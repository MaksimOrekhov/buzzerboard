import type { VerifiedJersey, JerseyType } from '@/entities/nba/jerseyDirectory'
import type { LocationQueryRaw } from 'vue-router'

export const JERSEY_QUERY_KEYS = [
  'jerseyView',
  'jerseySeason',
  'jerseyType',
  'jerseyOrder',
] as const

export interface JerseyFilters {
  view: 'current' | 'archive'
  season: string
  type: JerseyType | 'all'
  order: 'newest' | 'oldest'
}

export function filterJerseys(
  sets: readonly VerifiedJersey[],
  filters: JerseyFilters,
  currentSeason: string,
) {
  return sets
    .filter((set) => (set.season === currentSeason) === (filters.view === 'current'))
    .filter((set) => filters.season === 'all' || filters.season === set.season)
    .filter((set) => filters.type === 'all' || filters.type === set.type)
    .sort((a, b) => {
      const chronology =
        filters.order === 'newest'
          ? b.season.localeCompare(a.season)
          : a.season.localeCompare(b.season)
      return chronology || a.type.localeCompare(b.type)
    })
}

export function withoutJerseyFilters(query: LocationQueryRaw) {
  const cleaned = { ...query }
  for (const key of JERSEY_QUERY_KEYS) delete cleaned[key]
  return cleaned
}
