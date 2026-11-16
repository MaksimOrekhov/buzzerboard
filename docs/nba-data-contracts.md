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

The registry contains pure DunkAPI and ESPN normalizers, but no default source or automatic failover is selected. DunkAPI is the strongest technical candidate from PRO-163. ESPN is included as a technically observed fallback candidate only; its unofficial endpoint and terms have not been cleared for a public product. `docs/data-sources.md` remains the source and rights decision record. News-source coverage was not evaluated, so `NewsItem` is a domain contract only and no provider news normalizer is enabled.

## Domain models

| Model           | Contract and normalization rules                                                                                                                                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Team`          | Stable canonical `nba:team:<abbreviation>` ID for known NBA abbreviations and aliases (`GS`/`GSW`, `SA`/`SAS`, `NO`/`NOP`, `NY`/`NYK`); otherwise provider-qualified ID. Keep raw provider ID, abbreviation, and display name separately. Missing display names stay `null`.                                                     |
| `Game`          | Provider-qualified ID built from the provider's stable game ID; that source ID is also retained for provider lookups. No cross-provider game identity is assumed. `nbaGameDate` is `YYYY-MM-DD` in America/New_York. `startsAt` is a UTC ISO instant or `null`. Home/away orientation is preserved.                              |
| `GameStatus`    | `scheduled`, `live`, `final`, `postponed`, `canceled`, `suspended`, or `unknown`. Status is derived only from explicit status text/state; score presence never changes status. DunkAPI documents `scheduled`/`final` and has no in-game live feed; ESPN states can map to `live`.                                                |
| `Score`         | Home and away totals are `number \| null`. Missing scheduled scores stay `null`; zero is a valid value and is not treated as absent.                                                                                                                                                                                             |
| `ScoreByPeriod` | Explicit period number and optional home/away points. It is `null` when a source supplies no period scores. DunkAPI's `periods` field is a count, not a period score, so it is not converted into fabricated entries. ESPN linescores are mapped only when an explicit numeric period is present.                                |
| `StandingsRow`  | Team, season, conference, nullable metrics, nullable `officialRank`/`playoffSeed`, and the original one-based `providerOrder`. Missing metrics stay `null`; no wins, losses, or percentage are inferred. `providerOrder` is not a rank. Rank/seed are mapped only after the provider field and its semantics have been verified. |
| `NewsItem`      | Stable source-qualified id, source, title, URL, optional summary/image, and optional UTC publication timestamp. No current provider mapping is enabled because news sources and rights are outside PRO-163.                                                                                                                      |

All branded IDs/timestamps/dates are represented as strings/numbers at runtime and carry TypeScript brands after boundary normalization. A provider's external ID is never silently substituted for another provider's ID. Team IDs for recognized NBA abbreviations are provider-independent; game IDs stay provider-qualified because no cross-provider game-ID mapping was verified. A source switch can therefore change game IDs, while components continue to consume the same model shape.

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

| Endpoint                                    | Response                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /api/nba/games?date=YYYY-MM-DD`        | `GamesResponse`; `date` is the NBA game date in US Eastern.                                                    |
| `GET /api/nba/games/:gameId`                | `GameResponse`.                                                                                                |
| `GET /api/nba/standings?seasonEndYear=2027` | `StandingsResponse`.                                                                                           |
| `GET /api/nba/news`                         | `NewsResponse`; source identifier stays open and the endpoint is unavailable until a news source is evaluated. |

Components depend on the endpoint/domain response, not provider JSON, provider IDs, SDK types, or credentials. Provider switching therefore happens behind the server adapter boundary.

## Provider coverage and limits

| Adapter | Mapped data                                                                                                                                                                                                                                                                    | Known gaps / deployment condition                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DunkAPI | `list_games`-shape games, statuses, totals, dates/timestamps; `get_standings`-shape teams and metrics. Accepts the documented `data` envelope and the direct JSON object shown in endpoint examples.                                                                           | No in-game live. No documented per-period score in `list_games`; exact response freshness timestamp and rank/seed were absent in PRO-163 sample. Public use still requires upstream source and NBA marks review. |
| ESPN    | Scoreboard games, explicit status and score fields; standings groups and recognized numeric stat names. Period linescore mapping uses an explicit `period`/`value` shape in synthetic fixtures and has not been confirmed in the saved API response. Rank/seed are not mapped. | Only a technical fallback candidate: endpoint is unofficial and has no supported public API contract. Reviewed terms do not clear public use. Do not activate without a separate rights/source decision.         |

The DunkAPI docs describe `list_games.date` as an US Eastern date, `starts_at` as an ISO timestamp, and `get_standings` metrics without a rank field ([games schema](https://dunkapi.com/docs/list-games), [standings schema](https://dunkapi.com/docs/get-standings)). Its docs describe daily box-score updates and no record-level revision timestamp ([timing and rights](https://dunkapi.com/docs/timing-and-rights)). The adapter derives a missing NBA game date from `startsAt` only when that UTC timestamp validates. It never derives an instant from a date-only value.

Official conference order must not be synthesized from W/L, win percentage, or array order. PRO-163 did not find rank/seed or documented tiebreakers. Keep `officialRank` and `playoffSeed` null unless a provider explicitly supplies and validates them; any later approximate sort must be a separate, visibly approximate presentation value, not stored as official standings data.

## Fixtures and tests

`docs/fixtures/nba-normalization-fixtures.json` contains synthetic, non-sensitive values shaped from the prior observed/documented payload formats. It is not a raw API archive. Tests cover scheduled, live, final, postponed, zero and missing scores, malformed rows, standings with missing metrics and absent rank/seed, NBA-vs-UTC date handling, explicit period scores, and error mapping. No DunkAPI network request is part of tests or CI.
