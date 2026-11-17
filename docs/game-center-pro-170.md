# PRO-170: Game Center real-data integration

## Data path

The Game Center reads `GET /api/games?date=YYYY-MM-DD` from the same origin through a typed
TanStack Vue Query composable. The browser never receives the DunkAPI key and never calls the
provider directly. The Worker reads the shared D1 cache; a cache miss is an explicit error, not an
empty game day. A confirmed empty response is possible only when the provider supplied an exact
date snapshot.

The date picker uses the NBA game date in US/Eastern, allows the previous 30 days and the next seven
days, and presents start instants in the viewer's detected local timezone. The UI shows the cache
source, fetch time, and stale state. It only displays provider-confirmed statuses and scores.

## Query behavior

- Query data is fresh in TanStack Query for five minutes and retained for 30 minutes.
- Automatic retries, polling, focus refreshes, reconnect refreshes, and mount refreshes are disabled.
- “Перечитать кеш” explicitly repeats the read-only Worker GET. It does not trigger an upstream
  request.
- Favorites are stored in browser local storage and do not alter shared cache data.
- No live-score behavior is enabled. A provider `live` status is suppressed by the Worker.

## Verified DunkAPI fields and limits

The local, manually-triggered smoke check confirmed these capabilities through the Worker, D1, and
the frontend read contract:

| Resource          | Available data                                                        | Limits                                                                                                            |
| ----------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Games by date     | NBA date, status, home/away teams, final totals, start instant, venue | No period-by-period scores or exact provider update timestamp in the observed list response.                      |
| Upcoming schedule | Normalized games in the provider's documented seven-day window        | A missing row does not prove a date was empty; only an exact-date snapshot can confirm that.                      |
| Standings         | Conference and team record metrics                                    | The observed response did not provide official rank or playoff seed; the UI must not infer either from row order. |

Provider snapshots are normalized and validated before they enter D1. Malformed rows are counted as
rejected and are not shown. The API exposes fetch time separately from provider update time, which
remains `null` when the provider omits it.

The smoke check used exactly three manual refreshes (games, schedule, standings), at two DunkAPI
credits each. It ran against local Wrangler and local D1 only. No scheduled event or remote Worker
was triggered. The API key and manual-refresh token were held in the ignored `.dev.vars` file and
were removed after verification. Real response payloads, game IDs, names, scores, and screenshots
are kept out of version control and public CI artifacts.

## Repeatable local checks

1. Put `DUNKAPI_API_KEY`, `MANUAL_REFRESH_TOKEN`, and `DUNKAPI_REFRESH_ENABLED=true` in ignored
   `.dev.vars` for a local smoke run. Keep the regular monthly budget and current baseline from
   `wrangler.jsonc`; do not use remote flags.
2. Apply local migrations with `pnpm db:migrate:local` and start `pnpm worker:dev`.
3. Call the protected local `POST /api/revalidate` once for each authorized resource. Each request
   costs two credits; the manual endpoint allows one refresh per five-minute window.
4. Verify that subsequent `GET /api/games` and `GET /api/standings` calls leave the D1 credit ledger
   unchanged.

Never invoke Wrangler's local scheduled-event route during this smoke check. The configured Cron is
not auto-triggered by `wrangler dev`, and the production refresh flag remains disabled by default.
