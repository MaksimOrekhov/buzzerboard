import { CITIES, type City } from '@/entities/nba/cityDirectory'
import type { LocationQuery } from 'vue-router'

export const cityConferences = [
  { value: 'all', label: 'Все' },
  { value: 'east', label: 'Восток' },
  { value: 'west', label: 'Запад' },
] as const

export const cityAttributes = [
  { value: 'all', label: 'Любые' },
  { value: 'photo', label: 'С панорамой' },
  { value: 'without-photo', label: 'Без панорамы' },
  { value: 'population', label: 'С численностью' },
  { value: 'land', label: 'С площадью' },
] as const

export const citySorts = [
  { value: 'name', label: 'По названию' },
  { value: 'population', label: 'По населению' },
  { value: 'land', label: 'По площади суши' },
] as const

const collator = new Intl.Collator('ru')
const regions = new Map(CITIES.map(({ regionEn, region }) => [regionEn, region]))
export const cityRegions = [
  { value: 'all', label: 'Все страны и регионы' },
  { value: 'US', label: 'США' },
  { value: 'CA', label: 'Канада' },
  ...[...regions]
    .sort((a, b) => collator.compare(a[1], b[1]))
    .map(([value, label]) => ({ value, label })),
]

const validOption = <T extends string>(options: readonly { value: T }[], value: unknown) =>
  options.find((option) => option.value === value)?.value ?? options[0]!.value

export function readCityFilters(query: LocationQuery) {
  return {
    q: typeof query.q === 'string' ? query.q : '',
    conference: validOption(cityConferences, query.conference),
    region: validOption(cityRegions, query.region),
    attribute: validOption(cityAttributes, query.attribute),
    sort: validOption(citySorts, query.sort),
  }
}

export type CityFilters = ReturnType<typeof readCityFilters>

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const indexCity = (city: City) =>
  normalize(
    [
      city.name,
      city.nameEn,
      city.region,
      city.regionEn,
      city.countryName,
      city.identity.value,
      ...city.assignments.flatMap(({ team, brandArea, arenaLocality, arena }) => [
        team.code,
        team.name,
        brandArea?.value.name,
        arenaLocality?.value.name,
        arenaLocality?.value.nameEn,
        arena.address?.value,
      ]),
    ].join(' '),
  )

function numericSort(a?: number, b?: number) {
  if (a === undefined || b === undefined) return Number(a === undefined) - Number(b === undefined)
  return b - a
}

export function filterCities(cities: readonly City[], filters: CityFilters): City[] {
  const terms = normalize(filters.q).split(' ').filter(Boolean)
  return cities
    .filter((city) => {
      const { conference, region, attribute } = filters
      if (
        conference !== 'all' &&
        !city.assignments.some(({ team }) => team.conference === conference)
      )
        return false
      if (region !== 'all' && city.country !== region && city.regionEn !== region) return false
      if (attribute === 'photo' && !city.photo) return false
      if (attribute === 'without-photo' && city.photo) return false
      if (attribute === 'population' && !city.population) return false
      if (attribute === 'land' && !city.landArea) return false
      const index = indexCity(city)
      return terms.every((term) => index.includes(term))
    })
    .sort((a, b) => {
      const nameOrder = collator.compare(a.name, b.name)
      if (filters.sort === 'population')
        return numericSort(a.population?.value, b.population?.value) || nameOrder
      if (filters.sort === 'land')
        return numericSort(a.landArea?.value, b.landArea?.value) || nameOrder
      return nameOrder
    })
}

const numbers = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
export const formatCityNumber = (value: number) => numbers.format(value)
