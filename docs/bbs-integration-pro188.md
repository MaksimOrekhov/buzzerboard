# Big Balls Sports Data integration (PRO-188)

## Scope and rollout

BBS is implemented as a private, opt-in source for game schedules, results, period scores, team totals, and player box scores. DunkAPI remains the standings source. Production vars continue to use `NBA_GAMES_PROVIDER_ORDER=dunkapi`, `NBA_STANDINGS_PROVIDER_ORDER=dunkapi`, and `BBS_REFRESH_ENABLED=false`; no public rollout or deployment is part of this change. BBS rights for public NBA statistics and marks remain a separate launch gate tracked in PRO-181.

Use the existing ignored `.dev.vars` for `BBS_API_KEY`. For a local-only refresh, set `BBS_REFRESH_ENABLED=true` and `NBA_GAMES_PROVIDER_ORDER=bbs` in a local Wrangler environment. Never set the key in `wrangler.jsonc`, a Vue build variable, fixtures, or CI. API GETs only read D1; the authenticated provider adapter is server-only.

## Provider and snapshot identity

- BBS match UUIDs become `bbs:game:<uuid>` and player IDs become `bbs:player:<id>`. Numeric `archive_game_id` values are kept in a private `providerReferences` map on the game's D1 cache record, keyed by the namespaced BBS game ID. That map is not serialized into public API responses.
- The current NBA teams are resolved by the 30 canonical abbreviations. Rows that do not resolve to one of those teams are rejected; the provider's 84-row team directory is not used as a roster or team source.
- BBS season labels are start years. An NBA date in August or later maps 2026 to domain season end-year 2027.
- Scores accept numbers and numeric strings; missing scores remain `null`. NBA game date is retained as supplied in Eastern Time while `startsAt` is normalized to UTC. Live labels are suppressed by the existing public game response.
- A box snapshot is accepted only when the response IDs map through the exact cached UUID/archive-ID crosswalk, the NBA date and team sides match, and team/player points reconcile to the selected final score. DunkAPI and BBS records never merge because cache keys include the provider namespace.

## Refresh, cache, and budget

The existing daily Worker cron refreshes the previous completed NBA date, today, and the next seven dates when BBS is explicitly enabled. Each date uses one `/v1/matches` request (limit 100); the response is cached only when its pagination total matches the received row count and all rows normalize. A final game needs `/v1/nba/games/{archive_game_id}` team totals and `/v1/nba/games/{match_uuid}/box` player statistics. The availability endpoint is not part of the core refresh and is never required for a box snapshot. These provider IDs are cross-referenced from the cached list and are not interchangeable.

The first complete day cache is fresh for six hours and can be served stale for seven days. Core box scores use two requests per final game and are refreshed at most daily; snapshots can be served stale for 30 days. Availability is optional enrichment and is not requested by this integration. Without it, participation and starter values stay unknown unless the core box response confirms them; an unknown row is never labeled DNP. A changed score/team/status makes the old box incompatible with the new result, while a failed update retains that old snapshot for the existing cache checks to reject safely.

At a busy 15-game date, two core requests per final plus nine date reads are 39 requests, within the conservative 150/day cap. The sequential worker spaces requests by at least 6.1 seconds. Its D1 request ledger reserves daily and rolling 60-second slots in one atomic statement and caps traffic at 150/day and 10/minute even if config is higher. BBS's generic `X-RateLimit-Remaining` is the tighter bucket; the worker reserves that remaining count in D1 and uses `X-RateLimit-Reset` for its exact limiting-window reset. If only an ambiguous low remaining value is available, it waits until that reset (or one minute when reset is absent); it does not mistake it for daily depletion. Provider cooldowns are shared across Worker isolates in `nba_provider_cooldowns`. `Retry-After` supports both seconds and HTTP-date. Authentication, rate/quota, transport, and provider outage errors stop the batch without HTTP retries; an isolated invalid/missing game response is cached with a per-game cooldown and does not block later games. An incomplete date never replaces an earlier complete cache snapshot. DunkAPI credits and their existing reservation tables are untouched.

The date-list lock covers only the list request and fenced D1 write. Each box score has its own renewable lock. Cache writes verify lock ownership in the same D1 statement, so a worker whose lease expired cannot overwrite a newer result. Per-game failures preserve any older compatible box and prevent repeated requests until cooldown expiry. Daily ingestion can resume from the saved list and per-game cache states without refetching successful games.

## Fixtures and verification

`docs/fixtures/bbs.synthetic.json` contains synthetic schedule/results data only; no real provider response or identifier is committed. Adapter and runtime tests cover status/score/date normalization (including Jan–Apr for a 2026 start-year season), source-scoped IDs, required game/date/team identity, team/player point reconciliation, unknown participation, optional availability, incomplete pagination, per-game failure recovery, D1-only public GETs, atomic request slots, shared cooldowns, rolling rate limits and fenced locks. These fixtures do not exercise provider rights.

The earlier PRO-187/188 smoke used seven BBS GETs. In this review follow-up, the approved local smoke used 16 additional BBS GETs (two core endpoints for each of the eight cached final games dated 2026-11-16), bringing the cumulative approved run to 23 GETs. No availability endpoint or DunkAPI request was made. The list snapshot stayed cached, but all eight box responses were rejected by identity validation and saved with per-game `invalid_response` cooldowns; no box data was published. The follow-up stopped without retrying. Thus fixtures and runtime behavior are tested, but a successful live box-score verification remains pending; the remaining five GETs are insufficient for a full eight-game retry.

## Disable / rollback

To stop BBS traffic, set `BBS_REFRESH_ENABLED=false` and remove `bbs` from `NBA_GAMES_PROVIDER_ORDER`. Existing DunkAPI/ESPN caches remain readable. Migration `0003_bbs_provider.sql` copies every current cache row before extending the provider constraint; it does not delete or rewrite the existing records. To reverse the schema after a private pilot, disable BBS, take a D1 backup, delete only `provider='bbs'` rows, and rebuild `nba_cache` with the pre-migration provider check (`dunkapi`, `espn`) from the preserved non-BBS rows. Do not downgrade a database containing BBS records by editing migration history.
