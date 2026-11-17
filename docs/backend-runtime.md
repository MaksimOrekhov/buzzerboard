# NBA backend runtime (PRO-167)

## Runtime and API

The Cloudflare Worker serves the built Vue app and `/api/*` from one origin. Provider adapters from PRO-166 remain pure normalizers. The Worker owns authentication, requests, durable caching, rate limits, budget reservations, and scheduled/manual refresh.

| Route                                          | Behavior                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/games?date=YYYY-MM-DD`               | Read the exact date snapshot or a weekly schedule snapshot whose recorded coverage includes that date. Never calls an upstream provider.                           |
| `GET /api/games/:sourceGameId?date=YYYY-MM-DD` | Read the source-scoped game and optional box score from D1. A box-score cache miss returns the known game with `boxScore: null`; never calls an upstream provider. |
| `GET /api/standings?seasonEndYear=2027`        | Read the season snapshot from D1. Never calls an upstream provider.                                                                                                |
| `GET /api/news`                                | Returns `503 not_configured` until a source and normalizer are selected.                                                                                           |
| `POST /api/revalidate`                         | Protected refresh of one games date, standings season, or upcoming schedule. Requires `Authorization: Bearer <MANUAL_REFRESH_TOKEN>`.                              |
| `POST /api/games/:sourceGameId/refresh`        | Protected manual refresh of one already cached, finished DunkAPI game; request body contains its NBA date. Costs 5 credits when the provider call starts.          |

Successful responses identify `meta.source`, `meta.fetchedAt`, and `meta.isStale`. A stale response carries the last safe `meta.refreshError` when an update failed. If no usable cached value exists, the API returns a typed `cache_miss` error and does not silently fetch on a page view. An empty game list is returned only when an exact-date snapshot confirms no games. Schedule snapshots may provide matching positive game records within their recorded request window, but absent rows do not prove an empty day. A stale cache entry past its retention window is deleted.

The refresh route is intended for an authenticated admin/server integration. The token must not be embedded in Vue code or sent to browsers. There is no public force-refresh route and no frontend refresh button until BuzzerBoard has an authenticated user session.

Box scores are separately disabled by default with `DUNKAPI_BOX_SCORE_REFRESH_ENABLED=false`. The dedicated `DUNKAPI_BOX_SCORE_MONTHLY_CREDIT_BUDGET` is limited to one 5-credit match. D1 tracks `box_score_credits` separately from regular `app_credits`; an atomic reservation preserves the configured 128-credit regular allocation while keeping baseline + regular + box-score usage within the provider's monthly ceiling. Refresh requires an already cached final DunkAPI game, exact source game ID/date/team matching, a shared D1 lock, an upstream rate slot, and a 15-minute per-game cooldown after failures. It never runs from Cron or page reads and performs no retries or backfill. Box-score snapshots are fresh for 24 hours and retained up to 30 days. Failed provider attempts are counted conservatively.

## Shared cache and refresh policy

D1 is the shared durable cache across Worker instances. Cache keys include provider, NBA league, capability, and date/season/filter dimensions. Refresh locks coalesce concurrent requests for a resource. GET requests read D1 only, so a page reload, visitor, or cache miss cannot trigger DunkAPI spend.

| Data                  | Fresh TTL | Maximum stale retention | Refresh schedule                                  |
| --------------------- | --------: | ----------------------: | ------------------------------------------------- |
| Games for an NBA date |  24 hours |                 30 days | Daily: previous NBA date                          |
| Standings             |  24 hours |                  7 days | Daily                                             |
| Upcoming schedule     |    7 days |                 14 days | Budgeted Sundays, 7-day window                    |
| One game box score    |  24 hours |                 30 days | Protected per-game manual request only; 5 credits |

At 10:30 UTC the Cron refreshes games for the previous US/Eastern NBA date and current-season standings. A schedule snapshot records the expected seven-calendar-day request window from the NBA date at fetch time through six days later, based on the endpoint's documented up-to-seven-day scope. This window is only used to bound matching positive game records; it is not inferred from returned rows and does not prove that a date without rows had no game. A confirmed empty day requires an exact-date `list_games` snapshot. A date without that snapshot or a matching schedule row returns `cache_miss`, never a false empty day. Refreshes are sequential. A daily provider status is not presented as live: any normalized `live` status is converted to `unknown` before cache storage. No polling, SSE, WebSocket, live-score capability, or paid/live endpoint is enabled.

If the upstream fails, times out, returns invalid JSON, or exceeds its rate/quota guard, the Worker keeps a previously usable value, marks it stale, stores only the normalized safe error, and applies a 15-minute retry cooldown. It never copies provider error bodies or secrets to the response and never retries an upstream request automatically. Scheduled/manual failures are logged as resource type plus normalized error code only.

## Credit budget and rate protection

Each configured DunkAPI operation costs 2 credits: `list_games`, `get_standings`, and `get_schedule`. The provider free allowance is 500 credits/month. The application hard cap remains 128 credits/month. Daily games and standings require 4 credits per calendar day (120 credits in a 30-day month, 124 in a 31-day month). The scheduler calculates the remaining schedule allowance from the effective monthly app budget and distributes schedule refreshes across Sundays: with a 128-credit cap it allows up to four schedule refreshes in 30-day months and two in 31-day months. Thus 30/31-day months with either four or five Sundays remain at or below 128 planned credits without increasing the cap. Schedule refreshes may be less frequent than weekly; the latest valid snapshot remains available under its 14-day retention. Protected manual revalidation shares the same cap, so its usage may defer later cron refreshes. No credits are reserved for historical backfill. D1 reserves credits atomically **before** a provider call. Failed or malformed attempts remain counted, which is conservative. The app also caps upstream traffic at 10 calls per minute, below the provider's documented 60/minute limit and its 10/minute low-balance limit.

The monthly account baseline is operator-supplied because the provider's live account balance is not queried. The checked PRO-163 work spent 27 credits in November 2026; Wrangler config records that baseline for `2026-11`. At month rollover, refresh fails closed until `DUNKAPI_CREDIT_BASELINE_MONTH` and `DUNKAPI_CREDITS_USED_BASELINE` are updated from the account's actual usage. Keep a dedicated key for this Worker and include all other key usage in the baseline. Do not infer remaining credits from the D1 app ledger alone.

Provider refresh is disabled in `wrangler.jsonc`. Tests use fixtures and mocked fetch. To enable a deployment, first confirm data rights and a monthly budget, create/bind D1, install server secrets, set the correct current-month usage baseline, then explicitly change `DUNKAPI_REFRESH_ENABLED` to `true`. No key belongs in Wrangler `vars`, `.env` tracked files, client bundles, or logs. Public display is still conditional on the unresolved DunkAPI upstream-data/NBA marks rights noted in `docs/data-sources.md`.

## Deployment

1. Create the D1 database and replace the placeholder ID in `wrangler.jsonc`.
2. Apply migrations with `pnpm db:migrate:remote`.
3. Set `DUNKAPI_API_KEY` and a high-entropy `MANUAL_REFRESH_TOKEN` with `wrangler secret put`; do not commit these values.
4. Confirm the provider account's current-month spend, set the matching baseline month/credits, review the cap, then opt in to refresh.
5. Build/check with `pnpm worker:check`; deploy only after the operational configuration and rights review are complete.

Local D1 setup uses `pnpm db:migrate:local` and `pnpm worker:dev`. The migration is idempotent. `pnpm worker:check` bundles the Worker in dry-run mode and does not deploy or call DunkAPI.
