# PRO-199: Daily BBS refresh

## Current release state

This PR adds an opt-in BBS refresh queue. Production remains unchanged until a future owner action: `BBS_REFRESH_ENABLED=false`, both DunkAPI refresh flags are `false`, and `wrangler.jsonc` has no Cron trigger. The standings read path now selects the BBS cache (`NBA_STANDINGS_PROVIDER_ORDER=bbs`) and never falls back to DunkAPI. Team profiles and the directory remain readable from existing BBS cache rows while refresh is disabled. A cache miss remains a cache miss until the owner enables a refresh.

No BBS or DunkAPI endpoint was called to implement or test this change. All adapter and refresh tests use synthetic fixtures and mocked `fetch`.

## Queue behavior

The app opens each daily cycle at 10:00 America/New_York, after the usual overnight game window. A `*/10 * * * *` trigger is DST-safe because the Worker checks New York local time before opening a new cycle. That time gate applies only when starting a plan: saved work continues on every later tick, including after midnight and before 10:00. The queue refreshes standings, the directory, the previous day and a 15-date window, then one team-season snapshot for each of the 30 canonical teams. A second forced check of yesterday's games becomes eligible two hours later. After team-season work, a local D1-only step fills standings home/away and last-ten wins only when the provider ID, season, observation time, and overall record all match. It clears unsupported or stale enrichment fields. Final games are queued for box scores from their verified private BBS references; no provider ID is guessed.

Progress is stored in the additive `nba_scheduled_refresh` D1 table as a bounded, deduplicated work list with per-item attempt and retry times. A renewable D1 lease fences queue reads and SQL writes across overlapping ticks. A successful task is removed; an item-level failure is deferred with capped backoff while independent tasks continue, then reported and dropped after five attempts. Authentication, provider outages, and quota/rate-limit errors pause the whole queue until their retry time. A missing or expired games cache makes its box-score task defer and requeue the exact date lookup. Before a new daily plan is added, date-bound work is retained only within the rolling seven-day past / seven-day future window; obsolete-season metadata work is dropped. Compatible saved box scores are checked in one D1 batch and are not queued again, even after their freshness TTL expires; missing or changed snapshots still get work. Corrupt or oversized progress is rejected and left intact for diagnosis rather than silently reset. The daily cycle marker remains after all tasks are complete, and the next date prepends new daily work while preserving unique pending work and its retry state.

The configured application request limit remains 150/day and 10/minute. The separate provider-header guard stops when observed remaining quota reaches the configured headroom (minimum 25); neither value proves the key's total or shared allowance, so do not assume an effective 125/day. A regular cycle has 49 queue tasks, 48 of which are provider-backed (standings, directory, 16 date reads including yesterday's delayed recheck, and 30 team-season reads); the enrichment step is local D1 work. Each final box score uses two more BBS requests. Fifteen newly missing/changed final boxes make a 64-task day, about 10 hours 40 minutes at ten-minute ticks, within the 144 daily invocations. A larger historical catch-up or provider cooldown may span midnight; saved work resumes, while already compatible box scores are skipped. Recent box-score work is inserted before older backlog; the next cycle prepends its current work and retains unique pending work. Quota reservations and provider cooldowns remain authoritative; do not raise limits automatically.

The suggested trigger remains every 10 minutes (144 ticks/day); it is **not configured in production**. Each invocation processes at most one queue item. Keep each invocation under Cloudflare Free's 10 ms CPU and 50 D1-operation limits. The enrichment item reads at most 32 cache rows and the queue uses a small fixed number of lock/progress operations. See current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) before changing task size or interval.

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

Synthetic tests cover a seven-day catch-up of 15-game dates followed by three consecutive daily cycles, mixed cached/missing box scores (63 fetched once), resuming saved work after midnight, New York 10:00 scheduling across DST, late-game recheck, item-level retry with independent task progress, queue de-duplication and rollover state preservation, compatible standings enrichment, and rejection of corrupt progress. No production Cron, remote migration, remote D1 write, deployment, or external sports-provider request is part of this PR.
