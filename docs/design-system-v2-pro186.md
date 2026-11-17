# PRO-186 · Game Center pilot

This is the first approval checkpoint, based on `origin/main` at `e7da985`.
Only Game Center uses the new shell and theme. Home, Standings, News and Favorites
retain their existing implementation pending approval. Nothing is merged or deployed.

## Direction

A dark, editorial scoreboard: midnight surfaces, ice-blue controls, readable Manrope,
large tabular scores, real team identities and compact game rows. Desktop pairs the
scoreboard with a small, derived day summary. Mobile uses two aligned team/score lines
per match and a persistent five-item navigation bar. Layouts also work without artwork.
The date is an NBA day in New York; each start shows its local calendar date and time.

## Components and data flow

- `GameCenterShell`: navigation and page chrome; enabled only on the existing games route.
- `GamesView`: thin composition surface for the feature.
- `GameCenter`: composes the date controls, filters, scoreboard and data states.
- `useGameCenter`: orchestrates the existing query/favorites, URL date, filters, sorting,
  expanded game and derived insights. No provider or Worker changes.
- `GameScoreRow`: takes a game, favorite and expanded flags; emits favorite/details actions.
- `GameDayInsights`: takes derived final-game summaries; no extra requests or invented stats.
- `GameDatePicker`: string date model plus min/max; Reka calendar and portal popover.
- `CenterSelect`: string model, typed options and accessible label; Reka portal select,
  keyboard navigation and typeahead. Reka manages Escape, positioning and focus restoration.
- `TeamLogo`: team identity and fixed dimensions; canonical ID or abbreviation lookup,
  development-only optional image base URL and stable initials fallback.
- `CenterIcon`: small consistent SVG set; no icon font or external icon requests.

## Tokens and extension rules

All new styles are scoped under `.game-center-theme` or `gc-` classes. Semantic tokens
live in `src/assets/game-center.css`: canvas, sidebar, panel/hover, text/secondary/muted,
line, accent/soft accent, success, warning, radius and spacing. Portal content carries
the same theme class. Do not change the old global palette until approval.

Use Manrope Variable with bundled Latin and Cyrillic; no external font requests.
Use tabular numerals for scores, dates and counts. Primary team names are 15px desktop,
13px mobile; scores are 30px desktop / 25px mobile. Supporting labels are smaller.
Informative text tokens meet 4.5:1 against their surfaces. Selected states combine
color with borders, position or font weight. Controls have visible keyboard focus,
disabled states and reduced-motion support. Long names wrap instead of truncating.

Keep route views thin, state in composables, and UI contracts explicit. Add a semantic
token or shared primitive when a pattern repeats; keep page arrangement in the feature.
Date selection resets the team filter and expanded detail. Search, status and favorites
remain intentional filters until reset. Unknown scores stay as dashes. Only complete
final scores contribute to closest/highest/total-point insights. These are derived
summaries of the selected day, not official NBA rankings or predictions.

## Dependencies and licenses

| Dependency                   | Version | Purpose                                   | License            |
| ---------------------------- | ------- | ----------------------------------------- | ------------------ |
| reka-ui                      | 2.11.0  | Select, popover, calendar; Vue >=3.4 peer | MIT                |
| @internationalized/date      | 3.12.4  | Calendar date arithmetic                  | Apache-2.0         |
| @fontsource-variable/manrope | 5.3.0   | Self-hosted font, including Cyrillic      | SIL OFL 1.1 (font) |

Compatibility is verified with the repository's Vue 3.5, Vite 8, TypeScript and build.
Only imported Reka primitives enter the lazy games chunk. The first build measured
about 51 kB gzip for the new games chunk, 55 kB for the shared app JS and 14 kB for
shared CSS; font subsets load according to characters used. Package license files
remain available in installed distributions.

Primary implementation references: [Reka Select](https://reka-ui.com/docs/components/select),
[Reka Calendar](https://reka-ui.com/docs/components/calendar),
[Adobe date](https://react-spectrum.adobe.com/internationalized/date/index.html).

## Team artwork

All 30 canonical NBA IDs are mapped to aliases, including provider variants WSH and
UTAH. No team image files or licensed artwork are tracked. Without an explicitly set
development variable the component uses initials. Production builds always disable
external logo loading, even when `.env.local` exists during the build.

The private local prototype uses `VITE_PRIVATE_TEAM_LOGO_BASE_URL` pointing to the ESPN
team-logo CDN. This is not a secret and is not a license grant. ESPN-branded content
falls under the [Disney terms](https://disneytermsofuse.com/english/), including their
personal-use restrictions. Public availability does not imply redistribution rights.
PRO-181 must resolve the permitted source and usage before enabling artwork in a
public release. Do not commit images, private screenshots or that local configuration.
A future approved base can use the same identity mapping; unknown teams and image
errors retain a fixed-size fallback. Failed requests are not retried automatically.

## Data and verification

The local preview reads the existing Worker/D1 using GET only. Wrangler was started
with `DUNKAPI_REFRESH_ENABLED:false`; no revalidation or scheduled event was invoked.
The cached 2026-11-15 day contains nine games. The credit ledger remains unchanged:
2026-11 baseline 27, app credits 6. Backend, domain model and budgets are unchanged.

The existing query still disables retries, polling, focus, reconnect and mount refresh.
“Обновить данные” repeats the existing GET. Fresh/stale/error/cache miss/confirmed
empty/loading stay distinct. Source, actual fetch time, missing provider update time
and rejected-record count are available in source details; stale status is visible.
The API error's internal technical message is not used as the main product copy.

Local comparison captures are ignored:

- `artifacts/pro-186/before-{1440,768,375}.png`
- `artifacts/pro-186/after-{1440,1280,1024,768,620,375}.png`

These contain real cached data and must not be attached to public PRs or CI artifacts.
The owner can inspect them locally alongside the running Game Center preview.

`pnpm visual:pro186` creates only isolated synthetic responses, blocks external
requests and validates six widths, 15 games, long names, date/team interaction,
search, status, sorting, favorite persistence, available details, calendar/selection,
Escape focus restoration, empty/error/stale/loading and GET-only requests. It exposes
no fixture route in the app. CI uploads only `artifacts/pro-186/synthetic/`.
`visual:pro168` explicitly mocks API paths too, keeping old-page artifacts independent
of a locally running real-data Worker. Set `PW_CHANNEL=chrome` to use an installed
Chrome locally; CI uses its installed Playwright Chromium.

Run local preview with `pnpm worker:dev` (refresh disabled) and `pnpm dev`. Vite proxies
`/api` to `127.0.0.1:8787`. Open `/games?date=2026-11-15` while this date remains inside
the existing 30-day window. The URL date is validated and defaults to today's NBA date.
No fixture data ships in the production bundle.

## Remaining approval scope

Owner approval of this working visual direction precedes migrating other pages and
finishing the broader shared primitive library. Public artwork and release are also
out of scope for this checkpoint. The existing Favorites route remains a future page;
match favorites continue to persist and filter within Game Center as before.
