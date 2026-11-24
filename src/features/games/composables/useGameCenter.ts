import { computed, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Game, GameId, GameStatus, NbaGameDate, Team } from '@/entities/nba/model'
import { findNbaTeam } from '@/entities/nba/teamCatalog'
import { WorkerApiError } from '@/features/games/api'
import { useGameFavorites } from './useGameFavorites'
import { useGamesForDate } from './useGamesForDate'
import { shiftNbaGameDate } from '@/shared/utils/nbaDate'
import { gameCenterReturnTo, gameDetailsPath } from '@/features/games/gameDetailsRoute'

import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'
import { isSettledGameResult } from '@/shared/api/nba/gameDetailsGuards'

export function shiftGameDate(date: string, days: number): NbaGameDate {
  return shiftNbaGameDate(date, days) as NbaGameDate
}

export function useGameCenter() {
  const { enabled: spoilerMode, window: gameWindow, hideGame, isFutureSchedule } = useSpoilerMode()
  const route = useRoute()
  const router = useRouter()
  const today = computed(() => gameWindow.value.today as NbaGameDate)
  const yesterday = computed(() =>
    route.path === '/games' ? shiftGameDate(today.value, -1) : null,
  )
  const minDate = computed(() => shiftGameDate(today.value, -30))
  const maxDate = computed(() => shiftGameDate(today.value, 7))
  const selectedDate = computed(() => {
    const date = route.query.date
    if (
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date < minDate.value ||
      date > maxDate.value
    )
      return today.value
    const parsed = new Date(`${date}T12:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
      ? (date as NbaGameDate)
      : today.value
  })
  const query = useGamesForDate(selectedDate, yesterday)
  const { favoriteIds, isFavorite, toggleFavorite } = useGameFavorites()
  const validStatuses: GameStatus[] = [
    'final',
    'scheduled',
    'postponed',
    'canceled',
    'suspended',
    'unknown',
  ]
  function normalizedStatus(value: unknown): GameStatus | 'all' {
    if (value === 'live') return 'unknown'
    return typeof value === 'string' && validStatuses.includes(value as GameStatus)
      ? (value as GameStatus)
      : 'all'
  }
  const statusFilter = shallowRef<GameStatus | 'all'>(normalizedStatus(route.query.status))
  const teamFilter = shallowRef(typeof route.query.team === 'string' ? route.query.team : 'all')
  const search = shallowRef(typeof route.query.q === 'string' ? route.query.q : '')
  const favoriteOnly = shallowRef(route.query.favorites === '1')
  const sortDirection = shallowRef(route.query.sort === 'desc' ? 'desc' : 'asc')
  const expandedGameId = shallowRef<GameId | null>(null)
  const games = computed(() => query.data.value?.data ?? [])
  const hasHiddenGames = computed(() => games.value.some(hideGame))
  const statusOf = (game: Game): GameStatus =>
    isFutureSchedule(game) ? 'scheduled' : game.status === 'live' ? 'unknown' : game.status
  const meta = computed(() => query.data.value?.meta ?? null)
  const yesterdayPending = computed(
    () =>
      !spoilerMode.value &&
      selectedDate.value === yesterday.value &&
      games.value.some((game) => !isSettledGameResult(game)),
  )
  const knownTeams = new Map<string, Team>()
  watch(
    games,
    (currentGames) => {
      for (const game of currentGames) {
        knownTeams.set(game.homeTeam.id, game.homeTeam)
        knownTeams.set(game.awayTeam.id, game.awayTeam)
      }
    },
    { immediate: true, flush: 'sync' },
  )
  const teamOptions = computed(() => {
    const teams = new Map<string, Team>()
    for (const game of games.value) {
      teams.set(game.homeTeam.id, game.homeTeam)
      teams.set(game.awayTeam.id, game.awayTeam)
    }
    const selected =
      knownTeams.get(teamFilter.value) ??
      (teamFilter.value.startsWith('nba:team:')
        ? findNbaTeam(teamFilter.value.slice(9))?.team
        : null)
    if (selected && !teams.has(selected.id)) teams.set(selected.id, selected)
    return [
      { value: 'all', label: 'Все команды' },
      ...(teamFilter.value !== 'all' && !selected
        ? [{ value: teamFilter.value, label: 'Выбранная команда' }]
        : []),
      ...[...teams.values()]
        .sort((a, b) => teamName(a).localeCompare(teamName(b)))
        .map((team) => ({ value: team.id, label: teamName(team) })),
    ]
  })
  watch(selectedDate, () => {
    expandedGameId.value = null
  })
  watch(
    () => route.query,
    (next) => {
      statusFilter.value = normalizedStatus(next.status)
      teamFilter.value = typeof next.team === 'string' ? next.team : 'all'
      search.value = typeof next.q === 'string' ? next.q : ''
      favoriteOnly.value = next.favorites === '1'
      sortDirection.value = next.sort === 'desc' ? 'desc' : 'asc'
    },
  )
  const visibleGames = computed(() =>
    games.value
      .filter((game) => {
        if (
          !hasHiddenGames.value &&
          statusFilter.value !== 'all' &&
          statusOf(game) !== statusFilter.value
        )
          return false
        if (
          teamFilter.value !== 'all' &&
          game.homeTeam.id !== teamFilter.value &&
          game.awayTeam.id !== teamFilter.value
        )
          return false
        if (favoriteOnly.value && !isFavorite(game.id)) return false
        const needle = search.value.trim().toLowerCase()
        return (
          !needle ||
          [
            teamName(game.homeTeam),
            teamName(game.awayTeam),
            game.homeTeam.abbreviation,
            game.awayTeam.abbreviation,
          ].some((name) => name?.toLowerCase().includes(needle))
        )
      })
      .sort((a, b) => {
        const left = a.startsAt ? Date.parse(a.startsAt) : Infinity
        const right = b.startsAt ? Date.parse(b.startsAt) : Infinity
        return (left - right) * (sortDirection.value === 'asc' ? 1 : -1) || a.id.localeCompare(b.id)
      }),
  )
  const finalGames = computed(() =>
    games.value.filter((game) => !hideGame(game) && statusOf(game) === 'final'),
  )
  const scheduledCount = computed(
    () => games.value.filter((game) => !hideGame(game) && statusOf(game) === 'scheduled').length,
  )
  const scoredGames = computed(() =>
    finalGames.value.filter((game) => game.score.home !== null && game.score.away !== null),
  )
  const closestGame = computed(
    () =>
      [...scoredGames.value].sort(
        (a, b) => Math.abs(a.score.home! - a.score.away!) - Math.abs(b.score.home! - b.score.away!),
      )[0] ?? null,
  )
  const highestGame = computed(
    () =>
      [...scoredGames.value].sort(
        (a, b) => b.score.home! + b.score.away! - (a.score.home! + a.score.away!),
      )[0] ?? null,
  )
  const totalPoints = computed(() =>
    scoredGames.value.reduce((sum, game) => sum + game.score.home! + game.score.away!, 0),
  )
  const activeFilters = computed(
    () =>
      (!hasHiddenGames.value && statusFilter.value !== 'all') ||
      teamFilter.value !== 'all' ||
      favoriteOnly.value ||
      search.value.trim() !== '' ||
      sortDirection.value !== 'asc',
  )
  const activeFilterCount = computed(
    () =>
      Number(!hasHiddenGames.value && statusFilter.value !== 'all') +
      Number(teamFilter.value !== 'all') +
      Number(favoriteOnly.value) +
      Number(search.value.trim() !== '') +
      Number(sortDirection.value !== 'asc'),
  )
  const displayDate = computed(() =>
    new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    })
      .format(new Date(`${selectedDate.value}T12:00:00Z`))
      .replace(/^./, (letter) => letter.toLocaleUpperCase('ru-RU')),
  )
  const workerError = computed(() =>
    query.error.value instanceof WorkerApiError ? query.error.value.error : null,
  )
  const errorTitle = computed(() =>
    workerError.value?.code === 'cache_miss'
      ? 'За этот день пока нет данных'
      : 'Не удалось загрузить матчи',
  )
  const errorDescription = computed(() =>
    workerError.value?.code === 'cache_miss'
      ? 'Результаты ещё не загружены. Выберите другую дату или проверьте позже.'
      : 'Проверьте соединение и попробуйте обновить страницу.',
  )
  const weekDates = computed(() =>
    Array.from({ length: 7 }, (_, i) => {
      const date = shiftGameDate(selectedDate.value, i - 3)
      const value = new Date(`${date}T12:00:00Z`)
      const weekday = new Intl.DateTimeFormat('ru-RU', {
        weekday: 'short',
        timeZone: 'UTC',
      }).format(value)
      return {
        date,
        day: value.getUTCDate(),
        weekday,
        label: date === today.value ? 'Сегодня' : weekday,
        disabled: date < minDate.value || date > maxDate.value,
      }
    }),
  )
  async function setDate(date: string) {
    if (date >= minDate.value && date <= maxDate.value) {
      const query: Record<string, string> = { date }
      if (statusFilter.value !== 'all') query.status = statusFilter.value
      if (teamFilter.value !== 'all') query.team = teamFilter.value
      if (favoriteOnly.value) query.favorites = '1'
      if (search.value.trim()) query.q = search.value
      if (sortDirection.value !== 'asc') query.sort = sortDirection.value
      await router.replace({ path: '/games', query: { ...query, date: selectedDate.value } })
      await router.push({ path: '/games', query })
    }
  }
  function resetFilters() {
    statusFilter.value = 'all'
    teamFilter.value = 'all'
    favoriteOnly.value = false
    search.value = ''
    sortDirection.value = 'asc'
    void router.replace({ path: '/games', query: { date: selectedDate.value } })
  }
  function toggleDetails(id: GameId) {
    expandedGameId.value = expandedGameId.value === id ? null : id
  }
  function detailsTo(game: Game) {
    const returnTo = gameCenterReturnTo({
      date: selectedDate.value,
      status: statusFilter.value,
      team: teamFilter.value,
      favoriteOnly: favoriteOnly.value,
      search: search.value,
      sort: sortDirection.value,
    })
    return gameDetailsPath(game, returnTo)
  }
  function teamName(team: Team) {
    return team.displayName ?? team.abbreviation ?? 'Команда неизвестна'
  }
  return {
    today,
    minDate,
    maxDate,
    selectedDate,
    query,
    games,
    hasHiddenGames,
    statusOf,
    meta,
    yesterdayPending,
    visibleGames,
    teamOptions,
    statusFilter,
    teamFilter,
    search,
    favoriteOnly,
    sortDirection,
    expandedGameId,
    finalGames,
    scheduledCount,
    closestGame,
    highestGame,
    totalPoints,
    activeFilters,
    activeFilterCount,
    displayDate,
    errorTitle,
    errorDescription,
    weekDates,
    setDate,
    resetFilters,
    toggleDetails,
    detailsTo,
    favoriteIds,
    isFavorite,
    toggleFavorite,
  }
}
