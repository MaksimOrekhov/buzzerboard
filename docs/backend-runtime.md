# NBA backend runtime (PRO-167)

## Runtime and API

The Cloudflare Worker serves the built Vue app and `/api/*` from one origin. Provider adapters from PRO-166 remain pure normalizers. The Worker owns authentication, requests, durable caching, rate limits, budget reservations, and scheduled/manual refresh.

| Route                                   | Behavior                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/games?date=YYYY-MM-DD`        | Read date-specific games from D1, then use the weekly schedule snapshot to fill a cache miss. Never calls an upstream provider.       |
| `GET /api/standings?seasonEndYear=2027` | Read the season snapshot from D1. Never calls an upstream provider.                                                                   |
| `GET /api/news`                         | Returns `503 not_configured` until a source and normalizer are selected.                                                              |
| `POST /api/revalidate`                  | Protected refresh of one games date, standings season, or upcoming schedule. Requires `Authorization: Bearer <MANUAL_REFRESH_TOKEN>`. |

Successful responses identify `meta.source`, `meta.fetchedAt`, and `meta.isStale`. A stale response carries the last safe `meta.refreshError` when an update failed. If no usable cached value exists, the API returns a typed error and does not silently fetch on a page view. A stale cache entry past its retention window is deleted.

The refresh route is intended for an authenticated admin/server integration. The token must not be embedded in Vue code or sent to browsers. There is no public force-refresh route and no frontend refresh button until BuzzerBoard has an authenticated user session.

## Shared cache and refresh policy

D1 is the shared durable cache across Worker instances. Cache keys include provider, NBA league, capability, and date/season/filter dimensions. Refresh locks coalesce concurrent requests for a resource. GET requests read D1 only, so a page reload, visitor, or cache miss cannot trigger DunkAPI spend.

| Data                  | Fresh TTL | Maximum stale retention | Refresh schedule         |
| --------------------- | --------: | ----------------------: | ------------------------ |
| Games for an NBA date |  24 hours |                 30 days | Daily: previous NBA date |
| Standings             |  24 hours |                  7 days | Daily                    |
| Upcoming schedule     |    7 days |                 14 days | Sunday, 7-day window     |

At 10:30 UTC the Cron refreshes games for the previous US/Eastern NBA date and current-season standings; on Sundays it also refreshes the next seven days. Refreshes are sequential. A daily provider status is not presented as live: any normalized `live` status is converted to `unknown` before cache storage. No polling, SSE, WebSocket, live-score capability, or paid/live endpoint is enabled.

If the upstream fails, times out, returns invalid JSON, or exceeds its rate/quota guard, the Worker keeps a previously usable value, marks it stale, stores only the normalized safe error, and applies a 15-minute retry cooldown. It never copies provider error bodies or secrets to the response and never retries an upstream request automatically. Scheduled/manual failures are logged as resource type plus normalized error code only.

## Credit budget and rate protection

Each configured DunkAPI operation costs 2 credits: `list_games`, `get_standings`, and `get_schedule`. The provider free allowance is 500 credits/month. The application hard cap is 128 credits/month, matching the PRO-163 estimate for daily games/standings plus weekly schedule. D1 reserves credits atomically **before** a provider call. Failed or malformed attempts remain counted, which is conservative. The app also caps upstream traffic at 10 calls per minute, below the provider's documented 60/minute limit and its 10/minute low-balance limit.

The monthly account baseline is operator-supplied because the provider's live account balance is not queried. The checked PRO-163 work spent 27 credits in November 2026; Wrangler config records that baseline for `2026-11`. At month rollover, refresh fails closed until `DUNKAPI_CREDIT_BASELINE_MONTH` and `DUNKAPI_CREDITS_USED_BASELINE` are updated from the account's actual usage. Keep a dedicated key for this Worker and include all other key usage in the baseline. Do not infer remaining credits from the D1 app ledger alone.

Provider refresh is disabled in `wrangler.jsonc`. Tests use fixtures and mocked fetch. To enable a deployment, first confirm data rights and a monthly budget, create/bind D1, install server secrets, set the correct current-month usage baseline, then explicitly change `DUNKAPI_REFRESH_ENABLED` to `true`. No key belongs in Wrangler `vars`, `.env` tracked files, client bundles, or logs. Public display is still conditional on the unresolved DunkAPI upstream-data/NBA marks rights noted in `docs/data-sources.md`.

## Deployment

1. Create the D1 database and replace the placeholder ID in `wrangler.jsonc`.
2. Apply `migrations/0001_nba_runtime.sql` with `pnpm db:migrate:remote`.
3. Set `DUNKAPI_API_KEY` and a high-entropy `MANUAL_REFRESH_TOKEN` with `wrangler secret put`; do not commit these values.
4. Confirm the provider account's current-month spend, set the matching baseline month/credits, review the cap, then opt in to refresh.
5. Build/check with `pnpm worker:check`; deploy only after the operational configuration and rights review are complete.

Local D1 setup uses `pnpm db:migrate:local` and `pnpm worker:dev`. The migration is idempotent. `pnpm worker:check` bundles the Worker in dry-run mode and does not deploy or call DunkAPI.
