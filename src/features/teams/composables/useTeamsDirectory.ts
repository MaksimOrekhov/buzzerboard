import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'
import { computed, shallowRef } from 'vue'
import { useTeamFavorites } from '@/features/standings/composables/useTeamFavorites'
import { TEAM_SEASON_END_YEAR } from '../season'
import { useTeams } from './useTeams'

export type TeamConferenceFilter = 'all' | 'east' | 'west'
export type TeamSort = 'name' | 'rank' | 'wins' | 'points'

export function useTeamsDirectory() {
  const { hideAggregate } = useSpoilerMode()
  const statsHidden = computed(() => hideAggregate('team-directory'))
  const query = useTeams(TEAM_SEASON_END_YEAR)
  const { favoriteIds, isFavorite, toggleFavorite } = useTeamFavorites()
  const search = shallowRef('')
  const conference = shallowRef<TeamConferenceFilter>('all')
  const favoriteOnly = shallowRef(false)
  const sortBy = shallowRef<TeamSort>('rank')
  const sortDirection = shallowRef<'ascending' | 'descending'>('descending')
  const teams = computed(() => query.data.value?.data ?? [])
  const visibleTeams = computed(() => {
    const needle = search.value.trim().toLocaleLowerCase('ru')
    const filtered = teams.value.filter((entry) => {
      const matchesSearch =
        !needle ||
        `${entry.name} ${entry.code} ${entry.division}`.toLocaleLowerCase('ru').includes(needle)
      return (
        matchesSearch &&
        (conference.value === 'all' || entry.conference === conference.value) &&
        (!favoriteOnly.value || isFavorite(entry.team.id))
      )
    })
    return [...filtered].sort((left, right) => {
      if (statsHidden.value) return left.name.localeCompare(right.name, 'ru')
      const order = sortDirection.value === 'ascending' ? 1 : -1
      if (sortBy.value === 'name') return order * left.name.localeCompare(right.name, 'ru')
      const leftValue =
        sortBy.value === 'rank'
          ? (left.season?.overallRank ?? null)
          : sortBy.value === 'wins'
            ? (left.season?.wins ?? null)
            : (left.season?.stats.pointsPerGame ?? null)
      const rightValue =
        sortBy.value === 'rank'
          ? (right.season?.overallRank ?? null)
          : sortBy.value === 'wins'
            ? (right.season?.wins ?? null)
            : (right.season?.stats.pointsPerGame ?? null)
      if (leftValue === null && rightValue === null)
        return left.name.localeCompare(right.name, 'ru')
      if (leftValue === null) return 1
      if (rightValue === null) return -1
      const numericOrder = sortBy.value === 'rank' ? -order : order
      return numericOrder * (leftValue - rightValue) || left.name.localeCompare(right.name, 'ru')
    })
  })
  const activeFilters = computed(
    () => Boolean(search.value.trim()) || conference.value !== 'all' || favoriteOnly.value,
  )
  const sortOptions = [
    { value: 'rank', label: 'Место в лиге' },
    { value: 'wins', label: 'Победы' },
    { value: 'points', label: 'Очки за матч' },
    { value: 'name', label: 'Название' },
  ] as const
  function resetFilters() {
    search.value = ''
    conference.value = 'all'
    favoriteOnly.value = false
  }
  function toggleSortDirection() {
    sortDirection.value = sortDirection.value === 'ascending' ? 'descending' : 'ascending'
  }
  return {
    statsHidden,
    query,
    favoriteIds,
    isFavorite,
    toggleFavorite,
    search,
    conference,
    favoriteOnly,
    sortBy,
    sortDirection,
    sortOptions,
    teams,
    visibleTeams,
    activeFilters,
    resetFilters,
    toggleSortDirection,
  }
}
