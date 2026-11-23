import { ARENAS, type Arena } from './arenaDirectory'
import { ARENA_SEASON_START } from './arenaFacts'
import { getCity, getTeamCity, type City, type GeoPoint } from './cityDirectory'
import type { Game, Team } from './model'

const EARTH_MEAN_RADIUS_KM = 6371.0088
const radians = (degrees: number) => (degrees * Math.PI) / 180

export function validGeoPoint(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.lat) &&
    Math.abs(point.lat) <= 90 &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lon) <= 180
  )
}

export function straightLineKm(a?: GeoPoint, b?: GeoPoint): number | null {
  if (!a || !b || !validGeoPoint(a) || !validGeoPoint(b)) return null
  const h =
    Math.sin(radians(b.lat - a.lat) / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lon - a.lon) / 2) ** 2
  return 2 * EARTH_MEAN_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))))
}

const normalizeVenue = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')
const genericVenue = /^(home|away|tbd|unknown|n\/?a|-)$/i
const neutralVenue = /\bneutral\b/i

function cityForTeam(team: Team) {
  const teamId = /^nba:team:([A-Z]{3})$/.exec(team.id)
  return teamId?.[1] ? getTeamCity(teamId[1]) : undefined
}

function municipality(city?: City) {
  return city?.boroughOf ? getCity(city.boroughOf) : city
}

interface VenueLocation {
  name: string
  cityName: string
  timeZone: string
  arena?: Arena
  sourceUrl: string
}

function resolveVenue(name: string, date: string): VenueLocation | null {
  if (name === 'moody center' && date >= '2022-04-20') {
    return {
      name: 'Moody Center',
      cityName: 'Остин, Техас',
      timeZone: 'America/Chicago',
      sourceUrl: 'https://moodycenteratx.com/fast-facts/',
    }
  }
  const matching = ARENAS.filter(
    (arena) =>
      (!arena.opened || Number(date.slice(0, 4)) >= arena.opened.value) &&
      (normalizeVenue(arena.name) === name ||
        arena.formerNames.some(
          (period) =>
            date >= period.from && date <= period.until && normalizeVenue(period.name) === name,
        )),
  )
  if (matching.length !== 1) return null
  const arena = matching[0]!
  const city = getCity(arena.cityId)
  if (!city) return null
  return {
    name: arena.name,
    cityName:
      city.name +
      (city.assignments[0]?.arenaLocality
        ? ' · ' + city.assignments[0].arenaLocality.value.name
        : ''),
    timeZone: city.timeZone.value,
    arena,
    sourceUrl: arena.address?.sourceUrl ?? city.identity.sourceUrl,
  }
}

export function getGameGeography(
  game: Pick<Game, 'venue' | 'nbaGameDate' | 'homeTeam' | 'awayTeam'>,
) {
  const away = cityForTeam(game.awayTeam)
  const home = cityForTeam(game.homeTeam)
  const name = normalizeVenue(game.venue ?? '')
  const neutral = neutralVenue.test(name)
  const venue = neutral ? null : resolveVenue(name, game.nbaGameDate)
  const homeArena = home?.assignments.find(({ team }) => team.team.id === game.homeTeam.id)?.arena
  const currentHomes = game.nbaGameDate >= ARENA_SEASON_START
  const offHomeCourt = venue !== null && (!venue.arena || venue.arena.id !== homeArena?.id)
  const unknownVenue = Boolean(name && !venue && !neutral && !genericVenue.test(name))
  const from = municipality(away)
  const to = municipality(home)
  const distance =
    currentHomes && !neutral && !offHomeCourt && !unknownVenue
      ? straightLineKm(from?.center?.value, to?.center?.value)
      : null
  return {
    home,
    away,
    venue,
    neutral,
    unknownVenue,
    offHomeCourt,
    currentHomes,
    from,
    to,
    distance,
  }
}
