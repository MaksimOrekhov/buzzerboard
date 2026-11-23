import { getTeamArena, type Arena } from './arenaDirectory'
import { cityEditorial } from './cityEditorial'
import rawStatistics from './cityStatistics.json'
import { findNbaTeam } from './teamCatalog'
import { NBA_TEAM_ENCYCLOPEDIA, type TeamEncyclopediaEntry } from './teamEncyclopedia'
import { getCityMedia } from './teamMediaManifest'

export const CITY_GUIDE_REVIEWED_AT = '2026-11-23'
export const IANA_SOURCE = 'https://www.iana.org/time-zones'
const US_TIME_SOURCE =
  'https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst'
const ONTARIO_TIME_SOURCE = 'https://www.ontario.ca/laws/statute/90t09'
const CENSUS_AREAS =
  'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2020.html'
const CENSUS_ESTIMATES =
  'https://www.census.gov/data/datasets/time-series/demo/popest/2020s-total-cities-and-towns.html'
const CENSUS_TORONTO =
  'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?geocode=S051235203519&pid=9810001501&request_locale=en'
const GNIS_SOURCE = 'https://www.usgs.gov/us-board-on-geographic-names/download-gnis-data'
const TORONTO_POINT =
  'https://www.toronto.ca/wp-content/uploads/2021/09/965f-ecs-specs-gi-design-criteria-manual-Sep2021.pdf'

export interface CitySource {
  label: string
  sourceUrl: string
  asOf: string
}

interface CityFact<T> extends CitySource {
  value: T
}

export interface GeoPoint {
  lat: number
  lon: number
}

type Stats = {
  geoId: string
  population?: number
  landAreaKm2?: number
  referencePoint?: GeoPoint & { gnisId?: string }
}
const statistics: Readonly<Record<string, Stats>> = rawStatistics

type CityTeam = {
  team: NonNullable<ReturnType<typeof findNbaTeam>>
  arena: Arena
  arenaLocality: CityFact<{ name: string; nameEn: string }> | undefined
  brandArea: CityFact<{ name: string; kind: string; relatedCityId?: string }> | undefined
}

const geographyLabels = {
  city: 'Город',
  borough: 'Боро Нью-Йорка',
  'consolidated-balance': 'Консолидированный город',
  'federal-district': 'Федеральный округ',
}
export type CityKind = keyof typeof geographyLabels
const boundaryLabels: Record<CityKind, string> = {
  city: 'Границы города',
  borough: 'Боро Бруклин / округ Кингс',
  'consolidated-balance': 'Indianapolis city (balance)',
  'federal-district': 'Округ Колумбия',
}

function fact<T>(
  value: T,
  label: string,
  sourceUrl: string,
  asOf = CITY_GUIDE_REVIEWED_AT,
): CityFact<T> {
  return { value, label, sourceUrl, asOf }
}

function cityDetails(
  entry: TeamEncyclopediaEntry,
  locality: Arena,
  editorial: NonNullable<(typeof cityEditorial)[string]>,
) {
  const [nameEn = '', regionEn = '', countryEn = ''] = entry.city.value?.split(', ') ?? []
  const country = countryEn === 'Canada' ? 'CA' : 'US'
  const kind = editorial.kind ?? 'city'
  const stat = statistics[entry.cityId]
  const boundary = boundaryLabels[kind]
  const geoId = stat?.geoId
  const isCanada = country === 'CA'
  const identitySource = locality.address?.sourceUrl ?? entry.city.sourceUrl
  const localPopulationSources: Partial<Record<CityKind, string>> = {
    borough: 'https://www.census.gov/quickfacts/fact/table/36047/PST045225',
    'federal-district': 'https://www.census.gov/quickfacts/table/PST045215/11001',
  }
  const descriptionSource = editorial.descriptionSource ?? identitySource
  const point = stat?.referencePoint
  return {
    id: entry.cityId,
    slug: entry.cityId.slice('nba:city:'.length),
    name: editorial.nameRu,
    nameEn,
    region: editorial.regionRu,
    regionEn,
    country,
    countryName: isCanada ? 'Канада' : 'США',
    geography: fact(
      geographyLabels[kind],
      'Место и границы',
      geoId ? (isCanada ? CENSUS_TORONTO : CENSUS_AREAS) : identitySource,
    ),
    kind,
    boroughOf: editorial.boroughOf,
    boundary,
    identity: fact(
      entry.city.value,
      'Местоположение домашней арены',
      identitySource,
      locality.address?.asOf ?? entry.city.asOf,
    ),
    description: fact(editorial.description, 'О городе', descriptionSource),
    established: editorial.established
      ? fact(editorial.established[0], editorial.established[1], editorial.established[2])
      : null,
    timeZone: fact(editorial.timeZone, 'IANA Time Zone Database', IANA_SOURCE),
    timeRules: {
      label: 'Правила сезонного перевода часов',
      sourceUrl: isCanada ? ONTARIO_TIME_SOURCE : US_TIME_SOURCE,
      asOf: CITY_GUIDE_REVIEWED_AT,
    } satisfies CitySource,
    population:
      stat?.population !== undefined
        ? fact(
            stat.population,
            isCanada ? 'Statistics Canada · перепись' : 'U.S. Census Bureau · оценка',
            isCanada ? CENSUS_TORONTO : (localPopulationSources[kind] ?? CENSUS_ESTIMATES),
            isCanada ? '2021-05-11' : '2025-07-01',
          )
        : null,
    landArea:
      stat?.landAreaKm2 !== undefined
        ? fact(
            stat.landAreaKm2,
            isCanada ? 'Statistics Canada · площадь суши' : 'U.S. Census Bureau · Gazetteer',
            isCanada ? CENSUS_TORONTO : CENSUS_AREAS,
            isCanada ? '2021-05-11' : '2020-01-01',
          )
        : null,
    censusId: geoId,
    referencePoint: point
      ? fact(
          point,
          point.gnisId ? 'USGS GNIS · ' + point.gnisId : 'City of Toronto · географическая точка',
          point.gnisId ? GNIS_SOURCE : TORONTO_POINT,
          point.gnisId ? '2026-11-02' : '2021-09-01',
        )
      : null,
    photo: getCityMedia(entry.cityId),
  }
}

export type City = ReturnType<typeof cityDetails> & { assignments: CityTeam[] }

export function buildCityDirectory(teams: readonly TeamEncyclopediaEntry[]): City[] {
  const cities = new Map<string, City>()
  for (const entry of teams) {
    const team = findNbaTeam(entry.code)
    const arena = getTeamArena(entry.code)
    const editorial = cityEditorial[entry.code]
    if (!team || !arena || !editorial || !entry.city.value) continue
    const city = cities.get(entry.cityId) ?? {
      ...cityDetails(entry, arena, editorial),
      assignments: [],
    }
    const { brandArea, arenaLocality } = editorial
    city.assignments.push({
      team,
      arena,
      arenaLocality: arenaLocality
        ? fact(arenaLocality, 'Район арены', arenaLocality.sourceUrl)
        : undefined,
      brandArea: brandArea ? fact(brandArea, 'География бренда', brandArea.sourceUrl) : undefined,
    })
    cities.set(entry.cityId, city)
  }
  return [...cities.values()]
}

export const CITIES: readonly City[] = buildCityDirectory(NBA_TEAM_ENCYCLOPEDIA)
export const CITY_FRANCHISE_COUNT = CITIES.reduce(
  (count, city) => count + city.assignments.length,
  0,
)
export const CITY_MUNICIPALITY_COUNT = new Set(CITIES.map(({ id, boroughOf }) => boroughOf ?? id))
  .size

export function getCity(id: string): City | undefined {
  return CITIES.find((city) => city.id === id || city.slug === id)
}

export function getTeamCity(code: string): City | undefined {
  return CITIES.find((city) => city.assignments.some(({ team }) => team.code === code))
}

export function cityPath(city: Pick<City, 'slug'>) {
  return { name: 'city-profile', params: { cityId: city.slug } }
}

export function cityMapUrl(city: City): string {
  const point = city.referencePoint?.value
  return point
    ? `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lon}#map=12/${point.lat}/${point.lon}`
    : 'https://www.openstreetmap.org/search?query=' +
        encodeURIComponent(
          [city.nameEn, city.regionEn, city.country === 'CA' ? 'Canada' : 'United States'].join(
            ', ',
          ),
        )
}

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>()

export function formatCityTime(instant: Date, timeZone: string): string {
  let formatter = dateTimeFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'shortOffset',
    })
    dateTimeFormatters.set(timeZone, formatter)
  }
  return formatter.format(instant)
}
