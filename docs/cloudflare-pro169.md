# Private Cloudflare release (PRO-169)

## Safe release shape

The Worker serves the Vue build and `/api/*` from one origin. `GET /api/health` runs a read-only `SELECT 1` against D1 and returns only `{"status":"ok"}` or `{"status":"unavailable"}`. It never includes connection details, credentials, quota state or row contents.

The committed Wrangler configuration has no Cron triggers, disables Worker version preview URLs, and sets both provider refresh flags to `false`. Games use the existing BBS cache; the players read path is enabled. The bootstrap used `workers_dev: false` until the owner configured Worker-level Access. The stable `workers.dev` hostname is now enabled behind Access, which covers the hostname, API paths and static assets. Preview URLs remain disabled. Do not apply account-wide Access settings.

The application remains read-only. No BBS or DunkAPI key is needed for serving its cache, no provider requests are made during migration or seeding, and scheduled refresh is not configured. The first hosted seed deliberately excludes DunkAPI/ESPN rows and all local rate-limit, cooldown, lock and credit-ledger tables. It includes only currently retained, normalized BBS cache rows and a validated current player snapshot. The local D1 files are opened read-only and are not modified. The import only updates a row when its local observation is at least as recent as the remote row.

Big Balls Sports Data's current [Terms of Service](https://bigballsdata.com/legal/terms) permit storing API responses and displaying statistics in a site or dashboard, while prohibiting resale or republishing the raw feed. This importer transfers normalized application cache records, not source responses, credentials or export endpoints. NBA marks and any source dataset outside BBS remain out of scope; the Workers site must stay Access-restricted.

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
- Remote D1 in WEUR now contains 51 retained BBS cache rows (17 box scores, 3 game/date snapshots, 1 team directory, 30 team-season profiles) and one validated 2027 player snapshot with 645 players. No DunkAPI/ESPN rows, provider ledger, credentials, or raw provider payloads were copied. The local databases are unchanged.
- Worker deployment version: `61f6ef96-7b09-42d2-92b4-43edde8e94ef`. Cron and BBS/DunkAPI refresh remain disabled.

If Wrangler is not authenticated, the exact owner action is steps 1–4 above. The repository cannot log into Cloudflare on the owner's behalf. The rest of the code and CI setup can be reviewed before that login.

## Read-only local export and remote seed

`node --experimental-strip-types scripts/pro169-cloudflare-seed.mjs export --db .wrangler/pro195/v3/d1/miniflare-D1DatabaseObject/888c21ab22d15eb302062d13e43b157caa8e041b5205f6d44b4a36930cdbc5a1.sqlite --out /private/tmp/buzzerboard-bbs-seed.json`

Use the local `.sqlite` file from the named PRO-195 state directory. The exporter validates the BBS namespace, cache record shapes, player snapshot schema and snapshot age; it omits expired cache records and fails on malformed data. The output is mode `0600` and must stay outside Git. Do not upload or publish it elsewhere.

After steps 1–5, set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_D1_DATABASE_ID` in the shell. If `CLOUDFLARE_API_TOKEN` is omitted, the seed command uses the locally authenticated Wrangler OAuth token without printing it; alternatively provide a scoped token with only **D1 Write**. Then run:

`node --experimental-strip-types scripts/pro169-cloudflare-seed.mjs upload --file /private/tmp/buzzerboard-bbs-seed.json --access-verified`

The explicit flag is a second guard against importing before Access. The remote SQL is parameterized and idempotent. On interruption, run the same command again; newer remote observations win. The source local databases remain unchanged.

## GitHub Actions release

`.github/workflows/deploy-cloudflare.yml` deploys only the exact `main` SHA after the existing `CI` workflow completes successfully for a push. It never deploys PR code. It takes a single production concurrency lock, applies D1 migrations before publishing code, and targets the GitHub `production` environment.

After the first private Worker is protected, configure GitHub repository environment `production` with:

- Secret `CLOUDFLARE_API_TOKEN`: account-scoped token with **Workers Scripts Edit**, **D1 Edit**, and **Account Settings Read** for this Cloudflare account.
- Variable `CLOUDFLARE_ACCOUNT_ID`: the account identifier from the Cloudflare dashboard.

The D1 identifier is committed in the Wrangler binding after database creation. No API key or provider token is required. Do not add secrets to repository-wide variables, Vite variables, workflow artifacts or logs. Cloudflare Workers Builds must remain disconnected so there is one deploy path.

## Free limits and rollback

As checked 2026-11-18, Cloudflare documents Workers Free at 100,000 requests/day and 10 ms CPU per invocation; D1 Free at 500 MB/database, 5 million rows read/day, 100,000 rows written/day, 50 D1 queries per Worker invocation, 2 MB max row size and 100 KB SQL statements. A 329 KB player JSON value is below the row cap; its SQL stays short because it is sent as a bound parameter. These are plan ceilings, not an assurance that this Worker fits: verify the deployed health, response sizes, runtime CPU, and D1 usage before relying on the site. Do not upgrade automatically.

GitHub keeps previous Worker deployments available for rollback. Use Cloudflare Dashboard → Workers & Pages → `buzzerboard` → Deployments → **Rollback** to the last verified version. Migrations are additive and are applied before code; never reverse or delete a migration as a rollback. Pause the `production` GitHub environment to stop future deployments. Provider Cron and refresh remain disabled.

Local D1 launch remains unchanged: see [the PRO-195 cache runbook](./bbs-players-pro195.md). No local database is used as the remote Worker binding.
