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

The legacy DunkAPI box-score flow remains disabled by `DUNKAPI_BOX_SCORE_REFRESH_ENABLED=false`. BBS box scores are refreshed by the opt-in daily queue only, require a cached final BBS game and exact private archive references, and use the shared request ledger and per-game lock. No box-score refresh runs from page reads.

## Shared cache and refresh policy

D1 is the shared durable cache across Worker instances. Cache keys include provider, NBA league, capability, and date/season/filter dimensions. Refresh locks coalesce concurrent requests for a resource. GET requests read D1 only; a page view or cache miss cannot trigger a sports-provider request.

| Data                  | Fresh TTL | Maximum stale retention | Refresh schedule                                 |
| --------------------- | --------: | ----------------------: | ------------------------------------------------ |
| Games for an NBA date |   6 hours |                  7 days | Daily BBS queue: previous 7 and upcoming 8 dates |
| Standings             |  24 hours |                  7 days | Daily BBS queue                                  |
| Team season profile   |   6 hours |                  7 days | Daily BBS queue: 30 teams                        |
| Team directory        |    7 days |                 30 days | Daily BBS queue; reused across team profiles     |
| One game box score    |  24 hours |                 30 days | Daily BBS queue for final games on previous date |

The BBS queue is opt-in and has no Cron trigger in the committed Wrangler config. Once explicitly activated, run one queue task every 10 minutes (`*/10 * * * *`). D1 stores the task list and cursor; one invocation processes at most one task. Final-game box scores are separate tasks and a box is fetched only after its exact-date games snapshot has been stored. A successful or up-to-date task advances the cursor. An error leaves the cursor in place so the next trigger resumes after the existing provider cooldown or quota reset. A one-row completion marker prevents another cycle from starting on the same NBA date; the next date replaces the marker with a new queue. Cache writes remain lock-protected and validated; no cache or player snapshot is deleted as part of this refresh.

The daily queue refreshes exact-date games from seven days before today through seven days after today, current-season standings, the 30 team-season profiles, and box scores for final games in the past seven days. It uses BBS for those resources; DunkAPI is not selected. Daily game snapshots are exact-date snapshots, so an empty list is authoritative only for that requested date. A daily provider status is not presented as live: normalized `live` status is converted to `unknown` before cache storage. No polling, SSE, WebSocket, or live-score endpoint is enabled.

If the upstream fails, times out, returns invalid JSON, or exceeds its rate/quota guard, the Worker keeps a previously usable value, marks it stale, stores only the normalized safe error, and applies the existing retry cooldown. The daily queue leaves its cursor on that task and retries on a later Cron tick after the cooldown or quota reset. It never copies provider error bodies or secrets to the response. Scheduled failures are logged as resource type plus normalized error code only.

## Credit budget and rate protection

The production schedule remains disabled. BBS request reservations enforce the configured 150-request daily ceiling with 25 requests held back, and a 10-request per-minute ceiling; the queue makes at most one target attempt per trigger and uses the existing 6.1-second per-process spacing for multi-request targets. A normal full task list uses about 47 requests before box scores: one standings request, one team-directory request when the standings snapshot is fresh, 15 date snapshots, and 30 team profiles. Catch-up box scores for the prior seven days use two requests per final game and may span multiple quota days; the persisted cursor resumes without exceeding the 125-request usable cap. Actual game counts and any other BBS key usage reduce that margin. Provider-wide authentication, rate-limit, and quota failures do not advance the queue. Failed attempts remain counted conservatively. No deep archive backfill is performed.

The legacy DunkAPI monthly-credit guard remains in code for its disabled manual-refresh path. The automated queue does not spend or depend on DunkAPI credits and must not enable either DunkAPI refresh flag.

Provider refresh is disabled in `wrangler.jsonc`; no Cron trigger is configured. To enable BBS refresh later, follow `docs/pro199-bbs-daily-refresh.md`. Do not enable either DunkAPI refresh flag. No key belongs in Wrangler `vars`, tracked `.env` files, client bundles, or logs. Tests use synthetic fixtures and mocked fetch only.

## Deployment

1. Create the D1 database and set its ID in `wrangler.jsonc`.
2. Apply pending migrations with `pnpm db:migrate:remote`.
3. Keep all provider refresh flags disabled unless following the explicit owner activation steps in `docs/pro199-bbs-daily-refresh.md`.
4. Keep all provider credentials in Wrangler secrets; never commit or expose them to the client.
5. Build/check with `pnpm worker:check`; deploy only after review.

Local D1 setup uses `pnpm db:migrate:local` and `pnpm worker:dev`. `pnpm worker:check` bundles the Worker in dry-run mode and does not deploy or call a sports provider.
