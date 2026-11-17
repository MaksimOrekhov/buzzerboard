# Big Balls Sports Data integration (PRO-188)

## Scope and rollout

BBS is implemented as a private, opt-in source for game schedules, results, period scores, team totals, and player box scores. DunkAPI remains the standings source. Production vars continue to use `NBA_GAMES_PROVIDER_ORDER=dunkapi`, `NBA_STANDINGS_PROVIDER_ORDER=dunkapi`, and `BBS_REFRESH_ENABLED=false`; no public rollout or deployment is part of this change. BBS rights for public NBA statistics and marks remain a separate launch gate tracked in PRO-181.

Use the existing ignored `.dev.vars` for `BBS_API_KEY`. For a local-only refresh, set `BBS_REFRESH_ENABLED=true` and `NBA_GAMES_PROVIDER_ORDER=bbs` in a local Wrangler environment. Never set the key in `wrangler.jsonc`, a Vue build variable, fixtures, or CI. API GETs only read D1; the authenticated provider adapter is server-only.

## Provider and snapshot identity

- BBS match UUIDs become `bbs:game:<uuid>` and player IDs become `bbs:player:<id>`. Numeric `archive_game_id` values are kept in a private `providerReferences` map on the game's D1 cache record, keyed by the namespaced BBS game ID. That map is not serialized into public API responses.
- The current NBA teams are resolved by the 30 canonical abbreviations. Rows that do not resolve to one of those teams are rejected; the provider's 84-row team directory is not used as a roster or team source.
- BBS season labels are start years. An NBA date in August or later maps 2026 to domain season end-year 2027.
- Scores accept numbers and numeric strings; missing scores remain `null`. NBA game date is retained as supplied in Eastern Time while `startsAt` is normalized to UTC. Live labels are suppressed by the existing public game response.
- A box snapshot is accepted only when the match UUID, archive ID, NBA date, team identity, and final score agree with the selected cached game. DunkAPI and BBS records never merge because cache keys include the provider namespace.

## Refresh, cache, and budget

The existing daily Worker cron refreshes the previous completed NBA date, today, and the next seven dates when BBS is explicitly enabled. Each date uses one `/v1/matches` request (limit 100); the response is cached only when its pagination total matches the received row count and all rows normalize. A final game needs `/v1/nba/games/{archive_game_id}` team totals, `/v1/nba/games/{match_uuid}/box` player statistics, and `/v1/nba/games/{archive_game_id}/availability` for confirmed played/DNP status before it can produce a box snapshot. These provider IDs are intentionally not interchangeable.

The first complete day cache is fresh for six hours and can be served stale for seven days. Box scores are refreshed at most daily and can be served stale for 30 days. A changed score/team/status invalidates only that BBS box snapshot before rebuilding it, so a corrected result cannot be paired with old statistics. At a busy 15-game date, three detail/box/availability GETs per final plus the nine date reads are 54 requests, within the 150/day cap. The sequential worker spaces requests by at least 6.1 seconds to stay below 10/minute. The independent BBS request ledger reuses D1's atomic rate-slot operation with UTC-day and rolling one-minute buckets; defaults are capped at 150/day and 10/minute even if a higher config value is supplied, and it preserves 25 calls of observed provider quota when headers are present. Each GET is reserved before it is sent. 401/403/429 and transport/JSON failures stop the current refresh without retries; `Retry-After` is honored for 429. An incomplete date never replaces an earlier complete cache snapshot. DunkAPI credits and their existing reservation tables are untouched.

## Fixtures and verification

`docs/fixtures/bbs.synthetic.json` contains synthetic schedule/results data only; no real provider response or identifier is committed. Adapter and runtime tests cover status/score/date normalization, source-scoped IDs, archive ID separation, box-score reconciliation, incomplete pagination, D1-only public GETs, request limits, and 429 stop behavior. These fixtures do not exercise provider rights or substitute for the separately authorized real smoke test.

## Disable / rollback

To stop BBS traffic, set `BBS_REFRESH_ENABLED=false` and remove `bbs` from `NBA_GAMES_PROVIDER_ORDER`. Existing DunkAPI/ESPN caches remain readable. Migration `0003_bbs_provider.sql` copies every current cache row before extending the provider constraint; it does not delete or rewrite the existing records. To reverse the schema after a private pilot, disable BBS, take a D1 backup, delete only `provider='bbs'` rows, and rebuild `nba_cache` with the pre-migration provider check (`dunkapi`, `espn`) from the preserved non-BBS rows. Do not downgrade a database containing BBS records by editing migration history.
