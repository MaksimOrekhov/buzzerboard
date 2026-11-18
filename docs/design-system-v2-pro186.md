# BuzzerBoard · Design System v2

The approved dark scoreboard direction now covers every existing route: Overview,
Game Center, Standings, News, Favorites and Not Found. There is one `AppShell`, one
icon set and one set of semantic tokens. Vue 3 Composition API, TypeScript, Vue Router,
TanStack Vue Query and the existing Worker/D1 contracts remain in place.

## Visual foundations

Midnight surfaces, ice-blue interactions, Manrope with Cyrillic and tabular numerals.
The main text colors meet 4.5:1 against their supported surfaces. Scores remain large;
team names wrap, supporting labels stay secondary, and results never rely on color alone.
There are no fabricated scores, rankings, streaks, headlines or prediction metrics.

- `src/assets/main.css`: minimal normalization, self-hosted font, base accessibility.
- `src/assets/design-system.css`: semantic palette, spacing, radii, shadows, typography,
  shared controls, states and portal content.
- `src/assets/app-shell.css`: desktop sidebar, tablet rail, mobile navigation, page chrome.
- Feature CSS lives beside Games, Standings, Home and Favorites; small static page
  arrangements live in `page-layouts.css`. Feature styles do not redefine the palette.

Use the `gc-`/`ui-` classes and tokens consistently. Add a semantic token when a value
has a reusable meaning. New feature-specific arrangement belongs in its feature CSS.
The previous global orange/lime theme, second shell, legacy match-card layout, duplicated
mobile standings cards and unused UnoCSS dependency/configuration are removed.

## Shared components

| Component                  | Contract and responsibility                                                           |
| -------------------------- | ------------------------------------------------------------------------------------- |
| AppShell                   | Navigation and one responsive page surface; shared footer and tooltip provider        |
| PageHeading                | Title, context, description and actions slot                                          |
| AppButton / AppBadge       | Variants, icons, disabled/loading/selected states, accessible labels                  |
| AppSearch                  | Labeled search input with string model                                                |
| AppSelect                  | Typed value/options model, disabled options, keyboard typeahead, portal positioning   |
| AppSegmented               | Typed model and options; pill or underline variants, optional counts                  |
| AppDatePicker              | String NBA-date model with min/max, localized Reka calendar and popover               |
| AppDialog                  | Controlled modal, focus trap, Escape, overlay and explicit opener focus restoration   |
| AppTooltip                 | Reka tooltip using the shell's provider; keyboard and pointer access                  |
| AppPanel                   | Labeled reusable content panel with header/actions/content slots                      |
| ResourceState / EmptyState | Shared skeleton, safe error copy, empty and ready composition                         |
| SnapshotStatus             | Actual fetch time, visible stale state, source details and refresh/rejection metadata |
| TeamLogo                   | Canonical identity mapping, fixed dimensions and initials/error fallback              |
| SortHeader                 | Keyboard sorting, aria-sort and metric explanations                                   |
| StandingsTable             | One semantic table with sticky team column and headers, shared number formats         |

Routes remain composition surfaces. Feature containers compose presentation and delegate
query/filter state to composables. `useGameCenter` preserves the NBA date window, filters,
sort, detail expansion and favorites. `useStandingsCenter` owns conference selection,
search/favorites, sorting and the two-team comparison selection. Props flow down and
explicit actions flow up. No global store or additional data provider was added.

## Screens

**Overview** uses the existing read-only games/standings queries, shows the selected NBA
day, four games and five teams by PCT for the selected conference. These teams are not
labeled with official positions. Loading, missing data and stale metadata remain visible.
Players and Analytics remain explicitly marked as future work.

**Game Center** preserves the approved composition and functionality. It now uses the
shared heading, search, tabs, calendar, states, source details and icon set. The scoreboard
has more breathing room between the score and home logo. Game times show the viewer's
local date and timezone separately from the NBA date in New York. Insights use only
complete final scores; unknown scores remain dashes.

**Standings** uses one table on desktop, tablet and mobile. Horizontal scroll belongs to
the table, not the page; team identities stay visible. Sorts include PCT, wins, guarded
GB, home/away wins, conference wins, last-ten wins and average point margin. Missing
conference W/L stays a dash. Average point margin is not Net Rating. PCT meters are
presentation of the supplied value, not a new ranking. Official rank is shown only if
actually supplied; provider order never becomes a position. Null metrics sort last.

GB still requires the existing full-conference, valid-record, consistent-PCT and unique-
leader checks. Filtering does not change that eligibility. Incomplete/tied data keeps
its explanation. Comparison takes two source-backed teams, including across conferences,
and compares records/PCT/venue/conference/last-ten/margin without inventing missing fields.

**Teams** adds a searchable 30-franchise catalogue with conference, favourites and
sortable season fields, plus a complete profile route for each canonical team. BBS
season data stays in its own cache namespace. Profiles show only the audited record,
available splits, basic per-game/shooting values, last-ten rows and provider-supplied
leaders. Missing splits and conference ranks remain null; advanced metrics are not
presented because the BBS team-season endpoint does not return them. Team links connect
the catalogue, standings, Game Center, favourites and profiles. See
[`docs/bbs-team-season-pro189.md`](./bbs-team-season-pro189.md) for the real-data audit.

**Favorites** uses the existing versioned ID storage. Teams come from the available
standings. Games come from loaded query snapshots, grouped by NBA date with each group's
own source/fetch/stale metadata. Unloaded IDs stay saved and are explicitly described as
unloaded; selecting their date reads that existing cache. No broad archive crawl, new
provider requests or extra persisted game payloads are introduced.

**News** honestly marks its source as not connected and links to available match/table
screens. **Not Found** has useful return actions in the same shell. No dead filters or
fabricated article cards are presented.

## Dependencies and artwork

| Dependency                   | Version | Purpose                                                  | License            |
| ---------------------------- | ------- | -------------------------------------------------------- | ------------------ |
| reka-ui                      | 2.11.0  | Select, calendar, popover, tooltip and dialog; Vue >=3.4 | MIT                |
| @internationalized/date      | 3.12.4  | Calendar date arithmetic                                 | Apache-2.0         |
| @fontsource-variable/manrope | 5.3.0   | Bundled Latin/Cyrillic variable font                     | SIL OFL 1.1 (font) |

Font files are self-hosted; no external font requests are needed. Existing Vite 8/Vue 3.5
compatibility is checked by types, build and browser tests. Only used Reka primitives
are bundled; page CSS and route code remain split. UnoCSS is no longer installed.
Primary references: [Reka](https://reka-ui.com/docs/components/select),
[calendar](https://reka-ui.com/docs/components/calendar),
[Adobe date](https://react-spectrum.adobe.com/internationalized/date/index.html).

All 30 canonical team IDs and provider aliases WSH/UTAH are mapped. No team artwork is
tracked. The optional `VITE_PRIVATE_TEAM_LOGO_BASE_URL` is used only in development;
production always uses the fixed-size fallback even if local configuration exists at
build time. The private prototype uses the ESPN team-logo CDN. It is not a license grant:
[Disney/ESPN terms](https://disneytermsofuse.com/english/) apply, and public availability
does not imply redistribution rights. PRO-181 must resolve the permitted public source.
Do not commit artwork, private screenshots or local configuration.

## Verification and local captures

`pnpm visual:pro171` covers all seven routes, including match details and box-score fallback, at 375, 620, 768, 1024, 1280 and 1440 px.
It intercepts API reads with isolated synthetic data and blocks external requests.
Coverage includes 15-game days, 30-team tables, long names, both conferences, search,
favorites persistence, all original sorts, date/team reset, details, calendar keyboard
selection, Escape/focus restoration, comparison limits, sticky columns, short-height
sidebar scrolling, ready/loading/empty/error/stale and tied-PCT GB protection. Public CI
uploads only `artifacts/pro-171/synthetic/`. No fixture route or payload ships in production.

Unit tests preserve the backend/API/date/favorite/GB regressions and add source-rank,
nullable conference records, cross-conference comparison, all-team logo mapping/fallback
and correct snapshot provenance for favorites. Standard checks are typecheck, lint,
format, unit, production build, Worker dry-run and Playwright. Production output is also
checked for private configuration, upstream credentials and synthetic payloads.

Real-data verification uses the existing local D1 with refresh forced off and GET only.
No provider refresh, revalidation, Cron invocation, backend or budget change is needed.
Keep those screenshots local: `artifacts/pro-186/complete/` contains each section at six
widths, both conferences, comparison, and populated team/game favorites. The local gallery
is `artifacts/pro-186/complete/index.html`. Do not upload these files to a public PR.

For local use, run `pnpm worker:dev` with refresh disabled and `pnpm dev`. Vite's existing
`/api` proxy remains `127.0.0.1:8787`. Data availability and the existing 30-day/7-day NBA
window remain authoritative; a cache miss is never presented as a confirmed empty day.

PR #11 remains unmerged for final owner review. Public branding clearance is still tracked
separately in PRO-181; it does not prevent local review with permitted private artwork.
