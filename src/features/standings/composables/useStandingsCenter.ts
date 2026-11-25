import { computed, shallowRef, watch } from 'vue'
import type { Conference, SeasonEndYear, TeamId } from '@/entities/nba/model'
import { WorkerApiError } from '@/shared/api/nba/workerClient'
import { useStandings } from './useStandings'
import { useTeamFavorites } from './useTeamFavorites'
import {
  deriveConferenceStandings,
  sortStandingsRows,
  type StandingsSortKey,
  type SortDirection,
} from '../standingsModel'
export const CURRENT_SEASON = 2027 as SeasonEndYear
export function useStandingsCenter() {
  const query = useStandings(CURRENT_SEASON)
  const { favoriteIds, isFavorite, toggleFavorite } = useTeamFavorites()
  const conference = shallowRef<Conference>('east')
  const favoriteOnly = shallowRef(false)
  const search = shallowRef('')
  const sortBy = shallowRef<StandingsSortKey>('winPercentage')
  const sortDirection = shallowRef<SortDirection>('descending')
  const compareIds = shallowRef<ReadonlySet<TeamId>>(new Set())
  const comparisonOpen = shallowRef(false)
  const rows = computed(() => query.data.value?.data ?? [])
  const meta = computed(() => query.data.value?.meta ?? null)
  const activeStandings = computed(() =>
    deriveConferenceStandings(rows.value, conference.value, CURRENT_SEASON),
  )
  const visibleRows = computed(() =>
    sortStandingsRows(
      activeStandings.value.rows.filter(
        (row) =>
          (!favoriteOnly.value || isFavorite(row.team.id)) &&
          (!search.value.trim() ||
            `${row.team.displayName} ${row.team.abbreviation}`
              .toLowerCase()
              .includes(search.value.trim().toLowerCase())),
      ),
      sortBy.value,
      sortDirection.value,
      activeStandings.value.gamesBehindByTeamId,
    ),
  )
  const comparisonRows = computed(() =>
    [...compareIds.value].flatMap((id) => {
      const row = rows.value.find(({ team }) => team.id === id)
      return row ? [row] : []
    }),
  )
  const activeFilters = computed(() => favoriteOnly.value || search.value.trim() !== '')
  const conferenceLabel = computed(() =>
    conference.value === 'east' ? 'Восточная конференция' : 'Западная конференция',
  )
  const errorTitle = computed(() =>
    query.error.value instanceof WorkerApiError && query.error.value.error.code === 'cache_miss'
      ? 'Таблица пока не загружена'
      : 'Не удалось загрузить таблицу',
  )
  const sortOptions = computed<
    readonly { value: StandingsSortKey; label: string; shortLabel: string; disabled?: boolean }[]
  >(() => [
    { value: 'winPercentage', label: 'Процент побед', shortLabel: 'PCT' },
    { value: 'wins', label: 'Победы', shortLabel: 'В–П' },
    {
      value: 'gamesBehind',
      label: 'Отставание · GB',
      shortLabel: 'GB*',
      disabled: !activeStandings.value.gamesBehindAvailable,
    },
    { value: 'homeWins', label: 'Победы дома', shortLabel: 'Дома' },
    { value: 'awayWins', label: 'Победы в гостях', shortLabel: 'В гостях' },
    { value: 'conferenceWins', label: 'Победы в конференции', shortLabel: 'Конф.' },
    { value: 'lastTenWins', label: 'Победы в последних 10', shortLabel: 'Посл. 10' },
    { value: 'averageMargin', label: 'Средняя разница очков', shortLabel: 'Разница' },
  ])
  watch(
    () => activeStandings.value.gamesBehindAvailable,
    (available) => {
      if (!available && sortBy.value === 'gamesBehind') {
        sortBy.value = 'winPercentage'
        sortDirection.value = 'descending'
      }
    },
  )
  watch(rows, () => {
    compareIds.value = new Set(
      [...compareIds.value].filter((id) => rows.value.some((row) => row.team.id === id)),
    )
  })
  watch(comparisonRows, (selected) => {
    if (selected.length !== 2) comparisonOpen.value = false
  })
  function selectSort(field: StandingsSortKey) {
    if (field === 'gamesBehind' && !activeStandings.value.gamesBehindAvailable) return
    if (sortBy.value === field) {
      sortDirection.value = sortDirection.value === 'ascending' ? 'descending' : 'ascending'
    } else {
      sortBy.value = field
      sortDirection.value = field === 'gamesBehind' ? 'ascending' : 'descending'
    }
  }
  function resetFilters() {
    search.value = ''
    favoriteOnly.value = false
  }
  function toggleCompare(id: TeamId) {
    const next = new Set(compareIds.value)
    if (next.has(id)) next.delete(id)
    else if (next.size < 2 && rows.value.some(({ team }) => team.id === id)) next.add(id)
    compareIds.value = next
  }
  function clearComparison() {
    compareIds.value = new Set()
    comparisonOpen.value = false
  }
  return {
    query,
    favoriteIds,
    toggleFavorite,
    conference,
    favoriteOnly,
    search,
    sortBy,
    sortDirection,
    compareIds,
    comparisonOpen,
    rows,
    meta,
    activeStandings,
    visibleRows,
    comparisonRows,
    activeFilters,
    conferenceLabel,
    errorTitle,
    sortOptions,
    selectSort,
    resetFilters,
    toggleCompare,
    clearComparison,
  }
}
