import rawHistory from './teamHistory.json'
import { getTeamEncyclopediaEntry, NBA_TEAM_ENCYCLOPEDIA } from './teamEncyclopedia'

export interface HistorySource {
  label: string
  url: string
  asOf: string
}

interface Cited {
  source: string
}

export interface FranchiseEra extends Cited {
  name: string
  city: string
  from: number
  until: number | null
}

export interface HistoricalArena extends FranchiseEra {
  arenaId: string
}

export const HISTORY_CATEGORIES = {
  history: 'История',
  identity: 'Переезды и имена',
  titles: 'Титулы',
  arenas: 'Арены',
  legends: 'Легенды',
} as const

export type HistoryCategory = keyof typeof HISTORY_CATEGORIES
export interface HistoryEvent extends Cited {
  year: number
  category: HistoryCategory
  title: string
  detail: string
}

export interface HistoryTitle {
  season: string
  league: 'NBA' | 'BAA' | 'ABA' | 'NBL'
}

export interface HistoryLegend extends Cited {
  name: string
  detail: string
  number: string | null
  hallOfFame: string | null
}

export interface TeamHistory {
  canonicalTeamId: string
  franchiseId: string
  founded: { year: number; detail: string | null } & Cited
  eras: FranchiseEra[]
  identityNote: ({ detail: string } & Cited) | null
  titles: { seasons: HistoryTitle[] | null; source: string; otherLeagueSource?: string }
  events: HistoryEvent[]
  arenas: HistoricalArena[]
  legends: HistoryLegend[]
  retired: { numbers: { number: string; name: string }[]; source: string } | null
}

interface TeamHistoryDocument {
  schemaVersion: number
  asOf: string
  sources: Record<string, HistorySource>
  profiles: TeamHistory[]
}

const document: TeamHistoryDocument = rawHistory as TeamHistoryDocument
export const TEAM_HISTORY_AS_OF = document.asOf
export const TEAM_HISTORY_SOURCES: Readonly<Record<string, HistorySource>> = document.sources
export const NBA_TEAM_HISTORIES: readonly TeamHistory[] = document.profiles

export function getTeamHistory(teamCode: string): TeamHistory | null {
  const identity = getTeamEncyclopediaEntry(teamCode)
  return (
    NBA_TEAM_HISTORIES.find((profile) => profile.canonicalTeamId === identity?.canonicalTeamId) ??
    null
  )
}

export function seasonEndYear(season: string): number {
  return Number(season.slice(0, 4)) + 1
}

export function eraAt(profile: TeamHistory, seasonStart: number): FranchiseEra | undefined {
  return profile.eras.find(
    ({ from, until }) => from <= seasonStart && (until === null || seasonStart < until),
  )
}

export function titleSource(profile: TeamHistory, title: HistoryTitle): string {
  return title.league === 'NBA' || title.league === 'BAA'
    ? profile.titles.source
    : (profile.titles.otherLeagueSource ?? profile.titles.source)
}

export function historyTimeline(
  profile: TeamHistory,
  category: HistoryCategory | 'all',
  order: 'asc' | 'desc',
): HistoryEvent[] {
  const transitions: HistoryEvent[] = profile.eras.slice(1).map((era) => ({
    year: era.from,
    title: era.name,
    detail: era.city,
    source: era.source,
    category: 'identity',
  }))
  const titles: HistoryEvent[] = (profile.titles.seasons ?? []).map((title) => ({
    year: seasonEndYear(title.season),
    title: `Чемпионство ${title.league}`,
    detail: `${title.season} · ${eraAt(profile, Number(title.season.slice(0, 4)))?.name}`,
    source: titleSource(profile, title),
    category: 'titles',
  }))
  const venues: HistoryEvent[] = profile.arenas.map((arena) => ({
    year: arena.from,
    title: arena.name,
    detail: arena.city,
    source: arena.source,
    category: 'arenas',
  }))
  return [...profile.events, ...transitions, ...titles, ...venues]
    .filter((event) => category === 'all' || event.category === category)
    .sort((a, b) => (order === 'asc' ? a.year - b.year : b.year - a.year))
}

export function validateTeamHistory(input: TeamHistoryDocument = document): string[] {
  const errors: string[] = []
  const verifiedBy = Number(input.asOf.slice(0, 4))
  const validDate = (date: string) => {
    const parsed = new Date(date)
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(+parsed) &&
      parsed.toISOString().slice(0, 10) === date
    )
  }
  const validYear = (year: number) => Number.isInteger(year) && year >= 1900 && year <= verifiedBy
  const hasSource = (key: string) => Object.hasOwn(input.sources, key)
  if (input.schemaVersion !== 1 || !validDate(input.asOf)) errors.push('invalid history metadata')
  for (const [id, source] of Object.entries(input.sources)) {
    if (
      !source.label.trim() ||
      !/^https:\/\/(?:[a-z0-9-]+\.)*(?:nba\.com|hoophall\.com|wnba\.com|wikidata\.org|unitedcenter\.com|thekiaforum\.com|targetcenter\.com|tdgarden\.com)\//.test(
        source.url,
      ) ||
      !validDate(source.asOf) ||
      source.asOf > input.asOf
    )
      errors.push(`invalid source ${id}`)
  }
  const knownTeams = new Set(NBA_TEAM_ENCYCLOPEDIA.map(({ canonicalTeamId }) => canonicalTeamId))
  const franchiseIds = new Set<string>()
  for (const profile of input.profiles) {
    const {
      canonicalTeamId: id,
      franchiseId,
      founded,
      eras,
      titles,
      events,
      arenas,
      legends,
      retired,
      identityNote,
    } = profile
    const invalid = (field: string) => errors.push(`${id}: invalid ${field}`)
    if (!knownTeams.delete(id)) invalid('team identity')
    if (!/^nba:franchise:[a-z0-9-]+$/.test(franchiseId) || franchiseIds.has(franchiseId))
      invalid('franchise identity')
    franchiseIds.add(franchiseId)
    if (!validYear(founded.year) || !hasSource(founded.source)) invalid('foundation')
    const validPeriod = ({ from, until, city, name, source }: FranchiseEra) =>
      city.trim() &&
      name.trim() &&
      hasSource(source) &&
      validYear(from) &&
      from >= founded.year &&
      (until === null || (validYear(until) && from < until))
    if (
      !eras.length ||
      eras.at(-1)?.until !== null ||
      eras.some(
        (era, index) =>
          !validPeriod(era) || (index > 0 && (eras[index - 1]?.until ?? Infinity) > era.from),
      )
    )
      invalid('franchise periods')
    if (
      arenas.some((arena) => !validPeriod(arena) || !/^nba:arena:[a-z0-9-]+$/.test(arena.arenaId))
    )
      invalid('arena periods')
    if (identityNote && (!hasSource(identityNote.source) || !identityNote.detail.trim()))
      invalid('identity note')
    if (
      !hasSource(titles.source) ||
      (titles.otherLeagueSource && !hasSource(titles.otherLeagueSource)) ||
      (titles.seasons !== null &&
        new Set(titles.seasons.map(({ season, league }) => `${season}:${league}`)).size !==
          titles.seasons.length)
    )
      invalid('title references')
    for (const title of titles.seasons ?? []) {
      const start = Number(title.season.slice(0, 4))
      if (
        !/^\d{4}\/\d{2}$/.test(title.season) ||
        !validYear(start + 1) ||
        title.season.slice(-2) !== String(start + 1).slice(-2) ||
        !eraAt(profile, start) ||
        !['NBA', 'BAA', 'ABA', 'NBL'].includes(title.league) ||
        (title.league === 'BAA' && (start < 1946 || start > 1948)) ||
        (title.league === 'NBA' && start < 1949) ||
        (title.league === 'ABA' && (start < 1967 || start > 1975)) ||
        (title.league === 'NBL' && start > 1948) ||
        !hasSource(titleSource(profile, title))
      )
        invalid(`title ${title.season}`)
    }
    if (
      events.length < 3 ||
      events.some(
        ({ year, category, title, detail, source }) =>
          !validYear(year) ||
          year < founded.year ||
          !Object.hasOwn(HISTORY_CATEGORIES, category) ||
          !title.trim() ||
          !detail.trim() ||
          !hasSource(source),
      )
    )
      invalid('timeline')
    if (
      !legends.length ||
      legends.some(
        ({ name, number, detail, source, hallOfFame }) =>
          !name.trim() ||
          !detail.trim() ||
          !hasSource(source) ||
          (number !== null && !/^\d{1,2}$/.test(number)) ||
          (hallOfFame !== null && !hasSource(hallOfFame)),
      )
    )
      invalid('legends')
    if (
      retired &&
      (!hasSource(retired.source) ||
        new Set(retired.numbers.map(({ number }) => number)).size !== retired.numbers.length ||
        retired.numbers.some(({ number, name }) => !/^\d{1,2}$/.test(number) || !name.trim()))
    )
      invalid('retired numbers')
  }
  if (knownTeams.size) errors.push(`missing team histories: ${[...knownTeams].join(', ')}`)
  return errors
}
