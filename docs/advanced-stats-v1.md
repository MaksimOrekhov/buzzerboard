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
- Each metric requires only its own inputs. Missing/invalid values, non-finite or negative counting stats, zero denominators, and impossible made/attempted relationships return null (`—`). Made/attempted checks tolerate up to 0.1 in rounded average data. A genuine zero remains zero. Negative GmSc and signed plus/minus are retained.
- Player Game Score is available only when every formula input is present. Team game comparisons show TS%, eFG%, AST/TO, 3PAr, and FTr from the same team box score; they do not create team GmSc or season advanced ratings from incomplete team averages.
- Catalog minimum GP, MIN per game, and FGA per game are user-selected sample filters, not official qualification thresholds. With filters at zero, the existing catalog inclusion behavior is unchanged. Null metrics sort last in both directions.

## UI surfaces

- Player catalog: “Эффективность” and “За 36 минут” sortable groups, plus existing search/team/conference/position/favorites filters and optional GP/MIN/FGA thresholds. Filter and sort state stays in the route query.
- Player profile: season advanced KPIs and per-36 rates, with source/estimation notes. Existing game-log chart stays on its actual four source fields.
- Game details: an advanced metric group in the player box-score tables and a separate expandable team comparison. All calculations run over the already-loaded payload.

## Verification

`src/entities/nba/advancedStats.spec.ts` tests hand-calculated eFG, TS, and Game Score; negative and zero results; missing and impossible values; DNP; zero denominators; values over 100%; per-36/minute parsing; qualification filters; team/player/season input mapping; and sorting 645 synthetic catalog rows without mutating the source list. A browser smoke with fully intercepted synthetic API responses covered catalog, profile, and game details at 375, 768, 1024, 1280, 1440, and 1920 CSS pixels (18 screenshots); it checked advanced sorting, detail disclosure, and horizontal overflow without calling a sports provider.
