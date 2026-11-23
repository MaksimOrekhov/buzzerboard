import type { Arena } from '@/entities/nba/arenaDirectory'
import { getArenaMedia } from '@/entities/nba/teamMediaManifest'

export const arenaConferences = [
  { value: 'all', label: 'Все' },
  { value: 'east', label: 'Восток' },
  { value: 'west', label: 'Запад' },
] as const

export const arenaAttributes = [
  { value: 'all', label: 'Любые' },
  { value: 'photo', label: 'С фотографией' },
  { value: 'coordinates', label: 'С координатами' },
  { value: 'opening', label: 'С годом открытия' },
  { value: 'capacity', label: 'С вместимостью' },
] as const

export const arenaSortOptions = [
  { value: 'name', label: 'По названию' },
  { value: 'opening', label: 'По году открытия' },
  { value: 'capacity', label: 'По вместимости' },
] as const

type ArenaFilters = {
  search: string
  conference: (typeof arenaConferences)[number]['value']
  city: string
  attribute: (typeof arenaAttributes)[number]['value']
  sort: (typeof arenaSortOptions)[number]['value']
}
const compareName = (a: Arena, b: Arena) => a.name.localeCompare(b.name, 'en')
const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const number = new Intl.NumberFormat('ru-RU')
export const formatArenaNumber = (value: number) => number.format(value)

function numericSort(a: number | null, b: number | null, direction: 1 | -1) {
  if (a === null || b === null) return Number(a === null) - Number(b === null)
  return direction * (a - b)
}

export function filterArenas(arenas: readonly Arena[], filters: ArenaFilters): Arena[] {
  const terms = normalize(filters.search).split(' ').filter(Boolean)
  return arenas
    .filter((arena) => {
      const { conference, city, attribute } = filters
      if (city !== 'all' && city !== arena.cityId) return false
      if (
        conference !== 'all' &&
        !arena.assignments.some(({ team }) => team.conference === conference)
      )
        return false
      if (attribute === 'photo' && !getArenaMedia(arena.id).length) return false
      if (attribute === 'coordinates' && !arena.coordinates) return false
      if (attribute === 'opening' && !arena.opened) return false
      if (attribute === 'capacity' && !arena.basketballCapacity) return false
      const searchIndex = normalize(
        [
          arena.name,
          arena.city,
          ...arena.formerNames.map(({ name }) => name),
          ...arena.assignments.flatMap(({ team }) => [team.name, team.code]),
        ].join(' '),
      )
      return terms.every((term) => searchIndex.includes(term))
    })
    .sort((a, b) => {
      if (filters.sort === 'opening') {
        return numericSort(a.opened?.value ?? null, b.opened?.value ?? null, 1) || compareName(a, b)
      }
      if (filters.sort === 'capacity') {
        return (
          numericSort(
            a.basketballCapacity?.value ?? null,
            b.basketballCapacity?.value ?? null,
            -1,
          ) || compareName(a, b)
        )
      }
      return compareName(a, b)
    })
}
