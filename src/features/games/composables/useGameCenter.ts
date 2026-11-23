import { computed, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Game, GameId, GameStatus, NbaGameDate, Team } from '@/entities/nba/model'
import { WorkerApiError } from '@/features/games/api'
import { useGameFavorites } from './useGameFavorites'
import { useGamesForDate } from './useGamesForDate'
import { getDefaultNbaGameDate, shiftNbaGameDate } from '@/shared/utils/nbaDate'
import { gameCenterReturnTo, gameDetailsPath } from '@/features/games/gameDetailsRoute'

import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'

export function shiftGameDate(date: string, days: number): NbaGameDate {
  return shiftNbaGameDate(date, days) as NbaGameDate
}

export function useGameCenter() {
  const { hideGame, isFutureSchedule } = useSpoilerMode()
  const route = useRoute()
  const router = useRouter()
  const today = getDefaultNbaGameDate() as NbaGameDate
  const minDate = shiftGameDate(today, -30)
  const maxDate = shiftGameDate(today, 7)
  const selectedDate = computed(() => {
    const date = route.query.date
    if (
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date < minDate ||
      date > maxDate
    )
      return today
    const parsed = new Date(`${date}T12:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
      ? (date as NbaGameDate)
      : today
  })
  const query = useGamesForDate(selectedDate)
  const { favoriteIds, isFavorite, toggleFavorite } = useGameFavorites()
  const rawStatus = route.query.status
  const validStatuses: GameStatus[] = [
    'final',
    'scheduled',
    'postponed',
    'canceled',
    'suspended',
    'unknown',
  ]
  const statusFilter = shallowRef<GameStatus | 'all'>(
    typeof rawStatus === 'string' && validStatuses.includes(rawStatus as GameStatus)
      ? (rawStatus as GameStatus)
      : 'all',
  )
  const teamFilter = shallowRef(typeof route.query.team === 'string' ? route.query.team : 'all')
  const search = shallowRef(typeof route.query.q === 'string' ? route.query.q : '')
  const favoriteOnly = shallowRef(route.query.favorites === '1')
  const sortDirection = shallowRef(route.query.sort === 'desc' ? 'desc' : 'asc')
  const expandedGameId = shallowRef<GameId | null>(null)
  const games = computed(() => query.data.value?.data ?? [])
  const hasHiddenGames = computed(() => games.value.some(hideGame))
  const statusOf = (game: Game): GameStatus => (isFutureSchedule(game) ? 'scheduled' : game.status)
  const meta = computed(() => query.data.value?.meta ?? null)
  const teamOptions = computed(() => {
    const teams = new Map<string, Team>()
    for (const game of games.value) {
      teams.set(game.homeTeam.id, game.homeTeam)
      teams.set(game.awayTeam.id, game.awayTeam)
    }
    return [
      { value: 'all', label: 'Все команды' },
      ...[...teams.values()]
        .sort((a, b) => teamName(a).localeCompare(teamName(b)))
        .map((team) => ({ value: team.id, label: teamName(team) })),
    ]
  })
  watch(selectedDate, () => {
    teamFilter.value = 'all'
    expandedGameId.value = null
  })
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
      search.value.trim() !== '',
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
        label: date === today ? 'Сегодня' : weekday,
        disabled: date < minDate || date > maxDate,
      }
    }),
  )
  function setDate(date: string) {
    if (date >= minDate && date <= maxDate) {
      const query: Record<string, string> = { date }
      if (statusFilter.value !== 'all') query.status = statusFilter.value
      if (favoriteOnly.value) query.favorites = '1'
      if (search.value.trim()) query.q = search.value
      if (sortDirection.value !== 'asc') query.sort = sortDirection.value
      void router.replace({ path: '/games', query })
    }
  }
  function resetFilters() {
    statusFilter.value = 'all'
    teamFilter.value = 'all'
    favoriteOnly.value = false
    search.value = ''
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
