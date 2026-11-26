# NBA data models and provider adapters (PRO-166)

This document defines the source-independent model contract for future UI and internal API work. It does not configure a live provider or add provider network calls.

## Architecture boundary

```text
Provider response (unknown JSON)
        ↓ server-only pure adapter + boundary validation
Normalized domain model + provenance/freshness metadata
        ↓ internal BuzzerBoard API contract
Vue components consume only domain models and internal endpoints
```

Domain types live in `src/entities/nba/model.ts`; internal endpoint types live in `src/shared/api/nba/contracts.ts`; provider-only normalizers live in `src/server/nba/adapters/`. The adapters accept `unknown`, validate the response shape, and return normalized values or a typed adapter error. They do not fetch data, read environment variables, import an SDK, or hold an API key. A future server runtime owns authentication, timeouts, caching, retries, and provider selection.

The registry contains pure DunkAPI and ESPN normalizers, but no global provider or automatic failover is selected. `NbaCapability` and `resolveProviderForCapability` let the future server choose a source separately by capability. Currently only `games` and `standings` have normalizers. `liveScores`, `boxScores`, `players`, `playerHistory`, and `news` are represented as independent capability slots but resolve to no adapter until their contracts are implemented. A server preference could choose DunkAPI for games and another permitted source for standings; no preference is configured here. DunkAPI is the first real adapter from PRO-163. ESPN has separate technical adapters for games and standings, but its unofficial endpoint and terms have not been cleared for a public product. `docs/data-sources.md` remains the source and rights decision record. News-source coverage was not evaluated, so `NewsItem` is a domain contract only and no provider news normalizer is enabled.

## Domain models

| Model           | Contract and normalization rules                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Team`          | Stable canonical `nba:team:<abbreviation>` ID for known NBA abbreviations and aliases (`GS`/`GSW`, `SA`/`SAS`, `NO`/`NOP`, `NY`/`NYK`); otherwise provider-qualified ID. Keep raw provider ID, abbreviation, and display name separately. Missing display names stay `null`.                                                                                                                                                                                               |
| `Game`          | Provider-qualified ID built from the provider's stable game ID; that source ID is also retained for provider lookups. No cross-provider game identity is assumed. `nbaGameDate` is `YYYY-MM-DD` in America/New_York. `startsAt` is a UTC ISO instant or `null`. Home/away orientation is preserved.                                                                                                                                                                        |
| `Player`        | Provider-qualified player ID, raw provider ID, optional display name and canonical team ID. Names are not used to match a player across providers.                                                                                                                                                                                                                                                                                                                         |
| `GameStatus`    | `scheduled`, `live`, `final`, `postponed`, `canceled`, `suspended`, or `unknown`. Status is derived only from explicit status text/state; score presence never changes status. DunkAPI documents `scheduled`/`final` and has no in-game live feed; ESPN states can map to `live`.                                                                                                                                                                                          |
| `Score`         | Home and away totals are `number \| null`. Missing scheduled scores stay `null`; zero is a valid value and is not treated as absent.                                                                                                                                                                                                                                                                                                                                       |
| `ScoreByPeriod` | Explicit period number and optional home/away points. It is `null` when a source supplies no period scores. DunkAPI's `periods` field is a count, not a period score, so it is not converted into fabricated entries. ESPN linescores are mapped only when an explicit numeric period is present.                                                                                                                                                                          |
| `StandingsRow`  | Team, season, conference, nullable metrics, nullable `officialRank`/`playoffSeed`, and the original one-based `providerOrder`. Missing metrics stay `null`; no wins, losses, or percentage are inferred. `pointsFor`/`pointsAgainst` are totals, not per-game averages. Metrics with unverified units (including `pointDifferential`) are omitted. `providerOrder` is not a rank. Rank/seed are mapped only after the provider field and its semantics have been verified. |
| `NewsItem`      | Stable source-qualified id, source, title, URL, optional summary/image, and optional UTC publication timestamp. No current provider mapping is enabled because news sources and rights are outside PRO-163.                                                                                                                                                                                                                                                                |

For ESPN games, `season.year` is treated as the NBA season's ending year (`2027` means `2026–27`); no year is inferred from the game date. ESPN status `type.name`, `type.state`, and `type.description` are normalized as separate values so a state such as `in` is not lost beside a more specific label such as `STATUS_HALFTIME`. Cancellation and postponement labels take priority over generic `pre`/`post` states. ESPN standings averages are not copied into season-total fields, and a differential is not treated as average margin unless the provider names that metric explicitly as `averageMargin`.

All branded IDs/timestamps/dates are represented as strings/numbers at runtime and carry TypeScript brands after boundary normalization. A provider's external ID is never silently substituted for another provider's ID. Team IDs are provider-independent only for recognized current NBA abbreviations and the explicit alias table; unknown abbreviations remain provider-scoped. Game and player IDs are always provider-scoped because PRO-163 did not verify cross-provider game/player mappings. A source switch can therefore change game/player IDs, while components continue to consume the same model shape. Add cross-provider mappings only after verified attributes establish the identity; a matching raw numeric ID or display name alone is insufficient. The implementation currently adds no game/player crosswalk records.

## Snapshot and error contracts

Every successful internal response uses `NbaSnapshot<T>`:

```json
{
  "data": [],
  "meta": {
    "provider": "dunkapi",
    "fetchedAt": "2026-11-16T12:00:00.000Z",
    "providerUpdatedAt": null,
    "stale": false,
    "rejectedRecords": 0
  }
}
```

`fetchedAt` is the server receive time. `providerUpdatedAt` is `null` when the provider has no exact timestamp for that response; PRO-163 found no such field in the checked DunkAPI payloads. `stale` is set by the future cache layer and never guessed by an adapter. `rejectedRecords` counts malformed rows that were skipped; a malformed top-level collection rejects the response.

Internal error shape:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Превышен лимит запросов к поставщику данных.",
    "retryable": true,
    "provider": "dunkapi",
    "upstreamStatus": 429
  },
  "requestId": "optional-internal-correlation-id-or-null"
}
```

Provider HTTP statuses map to stable internal codes (`authentication`, `forbidden`, `rate_limited`, `not_found`, `invalid_request`, `timeout`, `upstream_unavailable`, `unknown`). Error bodies are not copied to clients. Only transient status classes are marked retryable; the future server layer must still apply a bounded retry policy.

## Internal endpoint contracts

These are target contracts, not routes implemented by the current Vite-only app:

| Endpoint                                | Response                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /api/games?date=YYYY-MM-DD`        | `GamesResponse`; `date` is the NBA game date in US Eastern.                                                    |
| `GET /api/standings?seasonEndYear=2027` | `StandingsResponse`.                                                                                           |
| `GET /api/news`                         | `NewsResponse`; source identifier stays open and the endpoint is unavailable until a news source is evaluated. |

Components depend on the endpoint/domain response, not provider JSON, provider IDs, SDK types, or credentials. Provider preferences are keyed by capability (not one application-wide primary/fallback), and resolution stays in the server layer. If a capability has no normalized adapter, resolution returns `null` instead of silently using an unrelated source.

The Worker client accepts a season-scoped standings snapshot only when every row names the requested `seasonEndYear`. A `null` season is representable in the domain model but cannot be attributed to the requested season, so the client rejects the snapshot with `invalid_response`. A finite PCT outside `[0, 1]` becomes `null` before caching. In-range values, including zero and one, remain as supplied. Standings display unavailable PCT as a dash and sort it after known values in both directions. GB still requires complete, consistent records and a unique leader. Official rank and seed come from the source.

## Provider coverage and limits

| Adapter | Capabilities with normalizers                                                                                                                                                          | Known gaps / deployment condition                                                                                                                                                                                                                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DunkAPI | `games` and `standings`; `list_games`-shape statuses/totals/dates/timestamps and `get_standings`-shape teams/metrics. Accepts the documented `data` envelope and direct JSON examples. | PRO-163 also verified `get_game` and player game-log data, but this adapter does not normalize those capabilities yet. No in-game live. No documented per-period score in `list_games`; exact response freshness timestamp and rank/seed were absent in PRO-163 sample. Public use still requires upstream source and NBA marks review. |
| ESPN    | `games` and `standings` as separate capabilities. Scoreboard status/scores and standings groups with recognized numeric stat names.                                                    | Period linescore mapping uses an explicit `period`/`value` shape in synthetic fixtures, not confirmed in the saved response. Endpoint is unofficial; public rights are unresolved. Select per capability only after source/legal review.                                                                                                |

The DunkAPI docs describe `list_games.date` as an US Eastern date, `starts_at` as an ISO timestamp, and `get_standings` metrics without a rank field ([games schema](https://dunkapi.com/docs/list-games), [standings schema](https://dunkapi.com/docs/get-standings)). Its docs describe daily box-score updates and no record-level revision timestamp ([timing and rights](https://dunkapi.com/docs/timing-and-rights)). The adapter derives a missing NBA game date from `startsAt` only when that UTC timestamp validates. It never derives an instant from a date-only value.

Official conference order must not be synthesized from W/L, win percentage, or array order. PRO-163 did not find rank/seed or documented tiebreakers. Keep `officialRank` and `playoffSeed` null unless a provider explicitly supplies and validates them; any later approximate sort must be a separate, visibly approximate presentation value, not stored as official standings data.

## Fixtures and tests

`docs/fixtures/nba-normalization-fixtures.json` contains synthetic, non-sensitive values shaped from the prior observed/documented payload formats. It is not a raw API archive. Tests cover scheduled, live, final, postponed, zero and missing scores, malformed rows, standings with missing metrics and absent rank/seed, NBA-vs-UTC date handling, explicit period scores, error mapping, independent provider selection by capability, and conflicting raw game/player/team IDs across providers. No DunkAPI network request is part of tests or CI.
