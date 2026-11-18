# NBA Teams and BBS team-season audit (PRO-189)

## Provider audit

The local audit on 2026-11-17 made 33 BBS GET requests: account identity, NBA standings, the provider team directory, and all 30 team-season endpoints for `season=2026`. Each team-season request returned HTTP 200. The audit used the existing local `.dev.vars` key, kept at least 25 requests in reserve, made no retries, and did not call DunkAPI. Raw provider responses remain in the ignored local `artifacts/pro-189/real/` directory; no provider UUIDs or raw rows are committed.

The provider directory returned 84 teams. Its IDs matched the standings `team_id` values one-to-one for exactly the current 30 NBA teams; the directory's `short_name` supplied canonical aliases (including GS, NO, UTAH and WSH). The server revalidates this one-to-one crosswalk before refreshing a team. BBS season labels are start years, so `season=2026` maps to the NBA 2026/27 domain season ending in 2027.

| Field or capability                          | Availability across 30 responses | Handling                                                                       |
| -------------------------------------------- | -------------------------------: | ------------------------------------------------------------------------------ |
| Team identity, W–L, overall rank, games back |                            30/30 | Validated against the canonical NBA team and standings record                  |
| Last 10 games, unique match IDs              |                            30/30 | Kept as BBS rows; game links require a matching local Game Center cache record |
| BBS top-player leaders                       |                            30/30 | Displayed as source-provided season leaders, not a roster                      |
| Games played and six basic per-game stats    |                            30/30 | Preserved when valid; games played is null if it disagrees with W+L            |
| Home/away splits                             |                            20/30 | Missing split remains null                                                     |
| Conference rank                              |                             0/30 | Remains null; no rank is inferred                                              |
| Advanced metrics                             |                             0/30 | No advanced fields were present in the team-season payloads                    |

The `games_played` value disagreed with W+L for POR and OKC (2/30), so it is withheld for those records. PCT is calculated from the confirmed W–L record. Standings conference and division values were null for all 30 teams; the catalogue uses the current NBA team/conference structure from the [NBA league directory](https://www.nba.com/news/about). The team catalogue includes no 84-row provider expansion, fabricated roster or injury data.

## Runtime and UI

`GET /api/teams` reads the static 30-team catalogue and cached BBS team-season rows. `GET /api/teams/:code` reads one cached profile. Both are cache-only. Refresh is an authenticated local/admin revalidation target: the directory crosswalk is refreshed separately, followed by one team-season request per call. The BBS budget ledger, request spacing, provider cooldowns and cache locks apply. Existing standings/game provider order is unchanged, and BBS refresh remains disabled in production configuration.

The directory supports search, conference filter, favourites and sorting by rank, wins, points per game or name. The profile shows BBS-provided record, available splits, basic shooting/per-game statistics, last ten and leaders. Recent-game links appear only when the game is verified in the local BBS game cache. The next game must match a fresh BBS game snapshot for one of the next eight NBA dates (today through day +7), narrowed to the kickoff's NBA date when it is available. The game must still be scheduled in the future and match the season, game ID, team, and any reported opponent or home/away flag. Missing fields stay empty. No advanced-stat categories are implied.

### Local review verification (2026-11-18)

Reused the isolated Wrangler D1 state on port 8788 (`--persist-to /private/tmp/pro189-wrangler-state`). For the calendar refresh only, the local Worker used `BBS_REFRESH_ENABLED=true` and `NBA_GAMES_PROVIDER_ORDER=bbs`; both DunkAPI refresh flags were false. An authenticated `POST /api/revalidate` for `{ "resource": { "type": "games", "date": "2026-11-18" } }` spent one BBS GET on the New York date, according to the D1 request ledger. No team profile refresh was required. The standings navigation used an existing local standings snapshot without an upstream call.

Two read-only API passes each found `coverage.available=30`, returned HTTP 200 with `source=bbs` and the expected team/season for all 30 profiles, and opened the game details for each of 20 confirmed next-game links. The other ten stored kickoff times had already passed. The BBS request count remained one on the verification date after both passes. No DunkAPI calls or production changes were made.

Chrome verified the populated catalogue, search, profile and next game at 375, 768 and 1440 px. The desktop pass also verified navigation among profiles, the next game and back, favourites, and standings. Leaders matched the active profile after navigation and reload. No Vue warnings or page errors appeared.

Synthetic adapter tests use synthetic IDs and values. Local real BBS snapshots are intentionally excluded from the repository.
