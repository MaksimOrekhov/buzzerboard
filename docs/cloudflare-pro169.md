# Private Cloudflare release (PRO-169)

## Safe release shape

The Worker serves the Vue build and `/api/*` from one origin. `GET /api/health` runs a read-only `SELECT 1` against D1 and returns only `{"status":"ok"}` or `{"status":"unavailable"}`. It never includes connection details, credentials, quota state or row contents.

The committed Wrangler configuration has no Cron triggers, disables Worker version preview URLs, and sets both provider refresh flags to `false`. Games use the existing BBS cache; the players read path is enabled. The bootstrap used `workers_dev: false` until the owner configured Worker-level Access. The stable `workers.dev` hostname is now enabled behind Access, which covers the hostname, API paths and static assets. Preview URLs remain disabled. Do not apply account-wide Access settings.

The application remains read-only. No BBS or DunkAPI key is needed for serving its cache, no provider requests are made during migration or seeding, and scheduled refresh is not configured. The first hosted seed deliberately excludes DunkAPI/ESPN rows and all local rate-limit, cooldown, lock and credit-ledger tables. It includes only currently retained, normalized BBS cache rows and a validated current player snapshot. The local D1 files are opened read-only and are not modified. Subsequent seed updates only replace strictly older observations from the same provider/capability; equal or newer remote rows win.

Big Balls Sports Data's [Terms of Service](https://bigballsdata.com/legal/terms) are marked as a draft/pending public launch and do not explicitly grant persistent storage or hosted-display rights in the available text. Data-use rights remain unresolved under PRO-181; private Access does not resolve that question. This importer transfers only normalized application cache records, not source responses, credentials or export endpoints. Do not refresh the cache or make the site public until those rights are confirmed.

At the owner's direction, `TeamLogo.vue` loads all 30 NBA team marks at runtime from the official NBA CDN at `https://cdn.nba.com/logos/nba/{teamId}/primary/L/logo.svg`. Canonical team IDs map to NBA team IDs, and initials remain the fallback if the CDN request fails. No logo files are stored in GitHub or bundled with the Worker. The image request uses `no-referrer`. Access still protects the application, API and Worker assets, while the CDN logo URLs themselves are public and the signed-in browser contacts `cdn.nba.com`.

The sidebar league mark uses the official color NBA logo directly from `https://cdn.nba.com/logos/nba/nba-logoman.svg` with the same `no-referrer` behavior and an NBA text fallback. It is served by the NBA CDN at runtime, not bundled or proxied by BuzzerBoard.

**Rights limitation:** the [NBA Terms of Use](https://www.nba.com/termsofuse) identify team marks as intellectual property and state that the terms do not grant a license without written permission. No written NBA/team permission or separate license is on record. The owner requested a rights attribution in the application footer and selected direct CDN loading for the private site; attribution and private Access do not establish a license. Logo rights remain unconfirmed and are reported separately.

## Owner setup (one time)

1. Authenticate Wrangler in a terminal from this repository with `pnpm exec wrangler login`. Finish Cloudflare's browser login/OTP as the account owner. Never paste an API token into chat or commit it.
2. The free D1 database has been created in WEUR (`ab82a06b-3311-41cc-b93c-9af5e92208e4`) and its ID is set in `wrangler.jsonc`. Migrations 0001–0006 are applied. The remote cache and player snapshot tables were verified empty.
3. The bootstrap Worker has been deployed with `workers_dev: false` and preview URLs disabled. It has no public hostname or deployment route.
4. In Cloudflare Dashboard → Workers & Pages → `buzzerboard` → **Access**, enable Access for **all traffic** (production and previews). Allow only the owner's verified email with a one-time PIN. Confirm the rule is Worker-level; do not choose the account-wide option.
5. After Access is active, change `workers_dev` to `true`, commit and push the change. The resulting permanent URL is `https://buzzerboard.<account-subdomain>.workers.dev`. Re-deploy, then verify the unauthenticated URL redirects to Access and authenticated pages and `/api/health` work. Preview URLs remain disabled in Wrangler; Worker-level Access also covers them if later enabled.
6. Only after that check, export and upload the private BBS seed as described below. Verify directory, profiles, teams, games and box-score pages; cache misses (including standings if no permitted BBS snapshot exists) stay visible as cache misses.

### Current deployment (2026-11-18)

- Permanent URL: https://buzzerboard.timberwolf-max.workers.dev
- Cloudflare Access is attached to this Worker with **All traffic** and the reusable **BuzzerBoard owner** policy. The policy allows one exact verified email. Unauthenticated `GET /` and `GET /api/health` both returned HTTP 302 to the Access login before data import.
- Remote D1 in WEUR now contains 51 retained BBS cache rows (17 box scores, 3 game/date snapshots, 1 team directory, 30 team-season profiles) and one validated 2027 player snapshot with 645 players. A prior read recorded 827,392 bytes of D1 storage; this is a point-in-time database size, not measured daily consumption. No DunkAPI/ESPN rows, provider ledger, credentials, or raw provider payloads were copied. The local databases are unchanged.
- Worker deployment version: `61f6ef96-7b09-42d2-92b4-43edde8e94ef`. Cron and BBS/DunkAPI refresh remain disabled.
- The PRO-196 anonymous route sweep returned Access redirects for the sampled pages and API paths after import. An authenticated owner smoke was not performed in this CLI session; owner-provided screenshots show games, teams and players responding, while `/api/standings` returns 503.
- Standings are absent: Wrangler is configured for the disabled DunkAPI standings provider and remote D1 has no standings snapshot. `/api/standings` therefore returns 503; no fallback data was invented or fetched.
- The screenshots show `/api/games`, `/api/teams` and `/api/players` returning 200 and repeated `/api/standings` requests returning 503. They do not verify game-detail routes, favorites persistence, all protected routes or an anonymous request after seeding.

If Wrangler is not authenticated, the exact owner action is steps 1–4 above. The repository cannot log into Cloudflare on the owner's behalf. The rest of the code and CI setup can be reviewed before that login.

## Read-only local export and remote seed

`node --experimental-strip-types scripts/pro169-cloudflare-seed.mjs export --db .wrangler/pro195/v3/d1/miniflare-D1DatabaseObject/888c21ab22d15eb302062d13e43b157caa8e041b5205f6d44b4a36930cdbc5a1.sqlite --out /private/tmp/buzzerboard-bbs-seed.json`

Use the local `.sqlite` file from the named PRO-195 state directory. The exporter and uploader share a strict validator for the entire versioned seed. It enforces BBS-only namespace, allowed cache-key/capability pairs, nested games/box-score/team/player schemas, SQL/cache metadata consistency, freshness, D1 row-size bounds, and duplicate-key rejection before any remote writes. Fully expired cache rows are skipped and reported; an expired player snapshot invalidates the seed. The output is mode `0600` and must stay outside Git. Do not upload or publish it elsewhere.

After steps 1–5, set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_D1_DATABASE_ID` in the shell. If `CLOUDFLARE_API_TOKEN` is omitted, the seed command uses the locally authenticated Wrangler OAuth token without printing it; alternatively provide a scoped token with only **D1 Write**. Then run:

`node --experimental-strip-types scripts/pro169-cloudflare-seed.mjs upload --file /private/tmp/buzzerboard-bbs-seed.json --access-verified`

The explicit flag is a second guard against importing before Access. The remote SQL is parameterized and idempotent. On interruption, a validated rerun is safe: strictly newer remote observations win and the script stops at the first API failure without logging tokens or row payloads. No re-import is needed for routine deploys. The source local databases remain unchanged.

## GitHub Actions release

`.github/workflows/deploy-cloudflare.yml` deploys only the exact `main` SHA after the existing `CI` workflow completes successfully for a push. It never deploys PR code. It takes a single production concurrency lock and checks that the candidate SHA is still current `main` both before applying D1 migrations and immediately before publishing code; superseded runs stop without deploying. It targets the GitHub `production` environment.

After the first private Worker is protected, configure GitHub repository environment `production` with:

- Secret `CLOUDFLARE_API_TOKEN`: account-scoped token with **Workers Scripts Edit**, **D1 Edit**, and **Account Settings Read** for this Cloudflare account.
- Variable `CLOUDFLARE_ACCOUNT_ID`: the account identifier from the Cloudflare dashboard.

The D1 identifier is committed in the Wrangler binding after database creation. No API key or provider token is required. Do not add secrets to repository-wide variables, Vite variables, workflow artifacts or logs. Cloudflare Workers Builds must remain disconnected so there is one deploy path. The owner reported creating the `production` environment values; GitHub does not expose secret contents for verification. The first post-merge deployment is still required to validate those credentials and the workflow end to end.

### D1 migration and data preservation

`wrangler d1 migrations apply --remote` applies only migrations absent from Wrangler's D1 migration ledger; it does not reseed data. Migrations 0003 and 0005 rebuild `nba_cache` while copying every existing row with `INSERT ... SELECT`; migration 0006 only adds `nba_player_snapshot`. Migrations 0001–0006 were applied before the initial seed. Later deployments must apply only new, reviewed migration files before deploying code; they must never delete or recreate the D1 database. On 2026-11-18 an authenticated, read-only Wrangler session successfully read remote D1 info, query insights and the migration-independent snapshot metadata. This PR adds no migration and does not re-import data.

## Free limits and rollback

### PRO-196 measured usage (2026-11-18)

Measurements were taken from the deployed `buzzerboard` Worker and remote D1 `buzzerboard-nba-cache` using the owner's authenticated Wrangler session. No provider endpoint was called. Cloudflare Worker analytics covers the 24 hours ending 2026-11-18 09:50 UTC; D1 `d1 info` and `d1 insights --time-period 1d` are rolling 24-hour views at collection time. The D1 counts include migration/deployment and manual validation activity, so they are not a clean estimate of ordinary page traffic.

| Resource           |                                          Observed |                                Free allowance |                                                   Approximate headroom |
| ------------------ | ------------------------------------------------: | --------------------------------------------: | ---------------------------------------------------------------------: |
| Worker requests    |                                          21 / 24h |                                 100,000 / day |                                                                >99.97% |
| Worker errors      |                                           0 / 24h |                     no separate request quota |                                                             0 observed |
| Worker subrequests |                                           0 / 24h |                          included in requests |                                                                      — |
| Worker CPU         | max reported hourly p50/p99 18,503 µs (18.503 ms) |              10 ms CPU per invocation on Free | observed quantile exceeds limit; investigate under representative load |
| D1 database size   |                    827,392 bytes (about 0.79 MiB) |         500 MB per database; 5 GB per account |                                      about 0.16% of per-database limit |
| D1 queries         |                       104 reads + 78 writes / 24h | query count itself is not the daily allowance |                                                                      — |
| D1 rows read       |                                         746 / 24h |                               5,000,000 / day |                                                          about 99.985% |
| D1 rows written    |                                         244 / 24h |                                 100,000 / day |                                                          about 99.756% |

The 21 Worker requests were spread across 19 hourly analytics buckets, so the CPU quantiles are based on very sparse traffic and should not be treated as a stable latency profile. The reported 18.503 ms CPU quantile is above the documented 10 ms Free CPU budget; no error was recorded in the same interval, but high-CPU requests may be terminated at the plan limit. Confirm again with representative catalog/profile traffic before relying on the margin. The D1 query insights attributed 91 reads to `SELECT record_json FROM nba_cache WHERE cache_key=?1` (63 rows read, average D1 duration 0.1232 ms), and 49 cache upserts (147 rows written, average 0.2318 ms); migration statements also appear in the 24-hour query list.

The player snapshot currently has 645 players in one 329,283-byte (about 321.6 KiB) JSON value, well below D1's 2 MiB per-value limit. Its route loads and parses the full snapshot for catalog and profile requests and validates the player set; profile lookup then scans that list. This is the main identified scaling risk for player pages: response/parse/validation work grows with the whole snapshot even when a single profile is requested. D1 storage and daily row quotas are currently far from their ceilings; Worker CPU is the item to watch. The 329 KB snapshot fits today, but should be monitored against the 2 MiB row cap if richer fields or additional seasons are added.

Current documented Free limits (checked 2026-11-18): Workers Free 100,000 requests/day and 10 ms CPU per invocation; D1 Free 5 million rows read/day, 100,000 rows written/day, 500 MB per database and 5 GB account storage. The D1 Worker invocation query cap is 50 operations; the per-value limit is 2 MiB. No plan change was made. Provider refresh and Cron remain disabled. The anonymous route check returned HTTP 302 for `/`, `/favorites`, `/api/health`, `/api/players?seasonEndYear=2027` and `/api/teams?seasonEndYear=2027`. This confirms Access gates these tested paths; other methods and untested paths were not probed. The authenticated Wrangler command reported no pending D1 migrations. Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 analytics](https://developers.cloudflare.com/d1/observability/metrics-analytics/), [Workers analytics](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/).

### Owner smoke checks

From a machine without a Cloudflare Access session, the 2026-11-18 sample check verified redirects for the routes below. Repeat after material Access or routing changes; the check does not cover every HTTP method or asset path:

```sh
for path in / /games /teams /players /favorites /api/health /api/players?seasonEndYear=2027 /api/teams?seasonEndYear=2027; do
  printf '%s ' "$path"
  curl --silent --output /dev/null --write-out '%{http_code}\n' "https://buzzerboard.timberwolf-max.workers.dev$path"
done
```

The owner can verify the overview, a game and its details, teams, player profiles and favorites in a browser after Access sign-in. Keep provider refresh disabled; these pages should read only existing remote D1 data. Authenticated browser route and favorites behavior was not re-tested for PRO-196.

Cloudflare retains previous Worker deployments for rollback. Use Cloudflare Dashboard → Workers & Pages → `buzzerboard` → Deployments → **Rollback** to the last verified version. Migrations are applied before code; never reverse or delete an applied migration as a code rollback. Pause the `production` GitHub environment to stop future deployments. Provider Cron and refresh remain disabled.

Local D1 launch remains unchanged: see [the PRO-195 cache runbook](./bbs-players-pro195.md). No local database is used as the remote Worker binding.
