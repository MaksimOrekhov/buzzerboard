import {
  ARENA_CAPACITY_AS_OF,
  ARENA_DIRECTORY_SOURCE,
  ARENA_REVIEWED_AT,
  ARENA_SEASON_END_YEAR,
  ARENA_SEASON_START,
  arenaAlternateHomes,
  arenaConstruction,
  arenaCoordinates,
  arenaFacts,
  arenaFormerNames,
  arenaOccupants,
  arenaOpenings,
} from './arenaFacts'
import { findNbaTeam } from './teamCatalog'
import { NBA_TEAM_ENCYCLOPEDIA, type TeamEncyclopediaEntry } from './teamEncyclopedia'

function fact<T>(value: T, sourceUrl: string, asOf = ARENA_REVIEWED_AT) {
  return { value, sourceUrl, asOf }
}

function optionalFact<T>(input: readonly [T, string] | undefined) {
  return input ? fact(...input) : null
}

function arenaDetails(entry: TeamEncyclopediaEntry, slug: string) {
  const facts = arenaFacts[slug]
  const pin = arenaCoordinates[slug]
  return {
    id: entry.arenaId,
    slug,
    name: entry.arena.value ?? '',
    city: entry.city.value ?? '',
    cityId: entry.cityId,
    address: facts ? fact(facts.address, facts.addressSource) : null,
    basketballCapacity: facts
      ? fact(facts.basketballCapacity, ARENA_DIRECTORY_SOURCE, ARENA_CAPACITY_AS_OF)
      : null,
    opened: optionalFact(arenaOpenings[slug]),
    occupants: optionalFact(arenaOccupants[slug]),
    construction: optionalFact(arenaConstruction[slug]),
    coordinates: pin
      ? fact({ lat: pin.lat, lon: pin.lon }, 'https://www.wikidata.org/wiki/' + pin.qid)
      : null,
    wikidataQid: pin?.qid ?? null,
    formerNames: arenaFormerNames[slug] ?? [],
    alternateHome: arenaAlternateHomes[slug] ?? null,
  }
}

export type Arena = ReturnType<typeof arenaDetails> & { assignments: ArenaAssignment[] }
interface ArenaAssignment {
  team: NonNullable<ReturnType<typeof findNbaTeam>>
  sourceUrl: string
  asOf: string
  validFrom: string
  seasonEndYear: number
  wikidataVenue: ReturnType<typeof fact<string>> | null
}

/** Current designations for the 2026/27 season, separate from building history. */
export function buildArenaDirectory(teams: readonly TeamEncyclopediaEntry[]): Arena[] {
  const venues = new Map<string, Arena>()
  for (const entry of teams) {
    const team = findNbaTeam(entry.code)
    if (!team || !entry.arena.value || !entry.city.value) continue
    const slug = entry.arenaId.slice('nba:arena:'.length)
    const venue = venues.get(entry.arenaId) ?? { ...arenaDetails(entry, slug), assignments: [] }
    venue.assignments.push({
      team,
      sourceUrl: entry.arena.sourceUrl,
      asOf: ARENA_REVIEWED_AT,
      validFrom: ARENA_SEASON_START,
      seasonEndYear: ARENA_SEASON_END_YEAR,
      wikidataVenue:
        entry.pilot && venue.wikidataQid
          ? fact(venue.wikidataQid, entry.wikidata.sourceUrl + '#P115')
          : null,
    })
    venues.set(entry.arenaId, venue)
  }
  return [...venues.values()]
}

export const ARENAS: readonly Arena[] = buildArenaDirectory(NBA_TEAM_ENCYCLOPEDIA)
export const arenaPath = (arena: Pick<Arena, 'slug'>) => ({
  name: 'arena-profile',
  params: { arenaId: arena.slug },
})

export function getArena(id: string): Arena | undefined {
  return ARENAS.find((arena) => arena.slug === id || arena.id === id)
}

export function getTeamArena(code: string): Arena | undefined {
  return ARENAS.find((arena) => arena.assignments.some(({ team }) => team.code === code))
}

export function arenaMapUrl(arena: Arena): string {
  const point = arena.coordinates?.value
  if (point) {
    return (
      'https://www.openstreetmap.org/?mlat=' +
      point.lat +
      '&mlon=' +
      point.lon +
      '#map=17/' +
      point.lat +
      '/' +
      point.lon
    )
  }
  return (
    'https://www.openstreetmap.org/search?query=' +
    encodeURIComponent(arena.address?.value ?? arena.name + ', ' + arena.city)
  )
}
