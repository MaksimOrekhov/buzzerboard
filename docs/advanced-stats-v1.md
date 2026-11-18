# Advanced Stats v1

Advanced Stats v1 is a frontend-only calculation layer over the existing normalized BBS player-season averages and verified player/team box scores. It makes no provider requests and does not change cache, API, Worker, D1, refresh, or Cloudflare behavior. The values are BuzzerBoard calculations using public methodology, not official NBA or Basketball Reference statistics.

## Methodology and formulas

Formulas follow the public [NBA Stats glossary](https://www.nba.com/stats/help/glossary) and [Basketball Reference glossary](https://www.basketball-reference.com/about/glossary.html) / [advanced-stats notes](https://info.sports-reference.com/migration/knowledge/basketball-advanced-stats). Definitions are kept separate where conventions differ; in particular FTr is FTA/FGA, not the Four Factors free-throw scoring rate.

All ratios are stored and sorted as raw, unrounded numbers. The UI formats percentages as percentages (0.625 → 62.5%) and values to one decimal. No percentage is clamped; TS%, eFG%, and FTr can exceed 100% under their definitions or from source rounding.

| Metric                                 | Formula                                                                                                | Scope and units                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| eFG%                                   | (FGM + 0.5 × 3PM) / FGA                                                                                | Player season estimate or one-game box score; fraction                                                                                             |
| TS%                                    | PTS / (2 × (FGA + 0.44 × FTA))                                                                         | Player season estimate or one-game box score; fraction. 0.44 is a convention/estimate, not measured possessions                                    |
| GmSc                                   | PTS + 0.4×FGM − 0.7×FGA − 0.4×(FTA−FTM) + 0.7×OREB + 0.3×DREB + STL + 0.7×AST + 0.7×BLK − 0.4×PF − TOV | One game. Season display is explicitly “GmSc/игру (оценка)” and is the same linear formula on per-game averages; it is not PER or an impact rating |
| AST/TO                                 | AST / TOV                                                                                              | Ratio; null when TOV is zero                                                                                                                       |
| 3PAr                                   | 3PA / FGA                                                                                              | Fraction                                                                                                                                           |
| FTr                                    | FTA / FGA                                                                                              | Fraction; can exceed 1                                                                                                                             |
| 2P%                                    | (FGM − 3PM) / (FGA − 3PA)                                                                              | Optional; only when both shot lines are valid and the denominator is positive                                                                      |
| PTS/36, REB/36, AST/36, STL/36, BLK/36 | statistic × 36 / MIN                                                                                   | Season per-minute rate normalized to 36 minutes; not a prediction                                                                                  |

## Data quality and limitations

- Season calculations require GP > 0 and use BBS per-game averages directly. A season ratio derived from rounded means is approximate; multiplying means by GP would not recover exact totals. Use exact confirmed totals if they become available.
- `MM:SS` is converted to decimal minutes; numeric minutes remain numeric. A zero-minute, DNP, or missing-minute line does not produce a per-36 rate. The existing player game-log DTO contains only PTS, REB, AST, and MIN, so it is not used to infer TS%, eFG%, or GmSc.
- Each metric requires only its own inputs: eFG% needs FGM/FGA/3PM; TS% needs PTS/FGA/FTA; 3PAr and FTr need only their attempts and FGA; 2P% additionally needs both complete shot lines. Missing unrelated fields do not suppress a value, but any known contradictory made/attempted relationship does. Exact game box scores use no count tolerance. Rounded season averages allow 0.1 for a made-versus-attempted check; because 2P% subtracts two rounded values, derived lines allow up to 0.2 only for rounding noise. Negative derived makes, non-positive attempts, and impossible exact lines return null (`—`); values are never clamped. A genuine zero remains zero. Negative GmSc and signed plus/minus are retained.
- Player Game Score is available only when every formula input is present. Its game-table heading is “GmSc” with a one-game description; the catalog and player profile retain the estimated per-game season label. Team game comparisons show TS%, eFG%, AST/TO, 3PAr, and FTr from the same team box score; they do not create team GmSc or season advanced ratings from incomplete team averages.
- Catalog minimum GP, MIN per game, and FGA per game are user-selected sample filters, not official qualification thresholds. With filters at zero, the existing catalog inclusion behavior is unchanged. Null metrics sort last in both directions.

## UI surfaces

- Player catalog: “Эффективность” and “За 36 минут” sortable groups, plus existing search/team/conference/position/favorites filters and optional GP/MIN/FGA thresholds. The advanced groups show each player's GP, MIN, and FGA sample context beside the derived values. Filter and sort state stays in the route query.
- Player profile: season advanced KPIs and per-36 rates, with source/estimation notes. Existing game-log chart stays on its actual four source fields.
- Game details: an advanced metric group in the player box-score tables and a separate expandable team comparison. All calculations run over the already-loaded payload.

## Verification

`src/entities/nba/advancedStats.spec.ts` tests hand-calculated eFG, TS, and Game Score; metric-specific partial inputs; exact versus rounded count validation; impossible derived 2P lines; DNP; zero denominators; values over 100%; `M:S`/`M:SS` minute parsing; qualification filters; team/player/season input mapping; and null-last sorting in both directions across 645 synthetic catalog rows without mutating the source list. A browser smoke with fully intercepted synthetic API responses covered catalog, profile, and game details at 375, 768, 1024, 1280, 1440, and 1920 CSS pixels (18 screenshots); it checked advanced sorting, detail disclosure, and horizontal overflow without calling a sports provider. The available local D1 snapshot was inspected read-only: migrations through `0007` are present, but the cache and player snapshot tables are empty, so a real cached-data smoke was unavailable.
