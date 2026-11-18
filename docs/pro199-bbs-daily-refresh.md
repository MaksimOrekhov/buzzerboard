# PRO-199: Daily BBS refresh

## Current release state

This PR adds an opt-in BBS refresh queue. Production remains unchanged until a future owner action: `BBS_REFRESH_ENABLED=false`, both DunkAPI refresh flags are `false`, and `wrangler.jsonc` has no Cron trigger. The standings read path now selects the BBS cache (`NBA_STANDINGS_PROVIDER_ORDER=bbs`) and never falls back to DunkAPI. Team profiles and the directory remain readable from existing BBS cache rows while refresh is disabled. A cache miss remains a cache miss until the owner enables a refresh.

No BBS or DunkAPI endpoint was called to implement or test this change. All adapter and refresh tests use synthetic fixtures and mocked `fetch`.

## Queue behavior

The daily work list contains current season standings, the BBS team directory, 15 exact-date game snapshots (seven days back through seven days ahead), and one team-season snapshot for each of the 30 canonical NBA teams. When each past-date game snapshot is stored, its final games are appended as individual box-score tasks for bounded catch-up. Existing final box scores from earlier dates are not fetched again. A box-score task requires the saved game and private BBS archive references; it never guesses provider IDs.

The queue cursor is stored in the additive `nba_scheduled_refresh` D1 table. One scheduled invocation processes one task. Successful and already-fresh tasks advance the cursor. Failed, rate-limited, or in-progress tasks keep their cursor and resume on a later trigger; existing D1 request reservations, cooldowns, cache validation, and per-resource locks remain in force. The task is therefore safe to retry and does not re-import or clear cache/player data. After the cycle, one completion marker stays until the next NBA date so the Worker cannot start a second cycle that day.

The current BBS guard permits up to 125 daily requests after the configured 25-request reserve (150 configured max) and 10 requests per minute. A normal full cycle is about 47 calls before boxes: one standings, one directory call when the standings snapshot is fresh, 15 date snapshots, and 30 team-season calls. A final box score uses two calls. Fifteen newly final games would bring that day's work to about 77 calls before historical catch-up. Up to seven days of missing boxes may need multiple daily quota windows; the cursor preserves the remaining work while each day's higher-priority standings, game dates, and team snapshots are prepended. If the provider quota is shared or the game count is higher, the existing reservation refuses the next request and the queue resumes after reset. Do not raise the cap automatically.

The suggested trigger is every 10 minutes (144 ticks/day): a normal cycle with 47 base tasks and up to 15 new box-score tasks completes in about 10 hours, leaving time for bounded catch-up. Each Cron invocation must stay under Cloudflare Free's 10 ms CPU allowance. The task processing is deliberately one resource at a time. D1 is also limited to 50 queries per Worker invocation on Free; no queue step uses a bulk refresh loop. See the current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) before changing the batch interval or task size.

## Owner activation steps (not performed by this PR)

Wait until this PR is merged and the existing main-branch workflow has completed the additive migration `0007_scheduled_bbs_refresh.sql` and deployed the Worker. Confirm Cloudflare Access still protects the Worker and GitHub's `production` environment is healthy.

1. In a local checkout of `main`, confirm `DUNKAPI_REFRESH_ENABLED=false` and `DUNKAPI_BOX_SCORE_REFRESH_ENABLED=false` remain set. Do not add either DunkAPI secret or enable DunkAPI.
2. Confirm the existing BBS key can be used for scheduled requests and that its shared daily allowance has room. If the Cloudflare Worker secret is not already present, add it in the project terminal with `pnpm exec wrangler secret put BBS_API_KEY`; enter the value only in Wrangler's terminal prompt.
3. In `wrangler.jsonc`, add the trigger and change only the BBS opt-in variable:

   ```jsonc
   "triggers": { "crons": ["*/10 * * * *"] },
   ```

   Set `BBS_REFRESH_ENABLED` to `true`, retain `NBA_STANDINGS_PROVIDER_ORDER: "bbs"`, and keep both DunkAPI refresh vars `false`. Commit and push this explicit activation as a separate change; CI will apply any pending migration and deploy from `main`.

4. Check the Cloudflare Worker Cron event log and BBS request ledger after the first few triggers. Confirm standings, current date snapshots, team profiles, and final game box scores advance in D1. Do not run a manual revalidation in parallel with the first cycle.

To turn refresh off, remove the Cron trigger and set `BBS_REFRESH_ENABLED` to `false`. This leaves the progress row and cache data in D1; subsequent activation resumes the saved work. Do not delete the table or reset the migration ledger.

## Verification

The test suite covers BBS standings normalization for 30 teams, BBS-only standings reads with no provider call, one-task queue advancement, and retrying the same cursor after an upstream failure. Type checking, test suite, lint, formatting, build, Worker dry-run, and the local additive migration are part of the PRO-199 verification. No production Cron, remote migration, remote D1 write, deployment, or external sports-provider request is part of this PR.
