import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useRoute } from 'vue-router'
import type { GameId, NbaGameDate } from '@/entities/nba/model'
import { fetchGameDetails, WorkerApiError } from '@/features/games/api'
import { safeGameReturnTo } from '@/features/games/gameDetailsRoute'

export function useGameDetails() {
  const route = useRoute()
  const gameId = computed(() =>
    typeof route.params.gameId === 'string' ? (route.params.gameId as GameId) : null,
  )
  const date = computed(() => {
    const value = route.query.date
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
      ? (value as NbaGameDate)
      : null
  })
  const query = useQuery({
    queryKey: computed(() => ['game-details', date.value, gameId.value]),
    queryFn: ({ signal }) => {
      if (!gameId.value || !date.value) throw new Error('Invalid game route')
      return fetchGameDetails(gameId.value, date.value, signal)
    },
    enabled: computed(() => Boolean(gameId.value && date.value)),
    staleTime: 60_000,
    retry: false,
  })
  const returnTo = computed(() => safeGameReturnTo(route.query.from))
  const apiError = computed(() =>
    query.error.value instanceof WorkerApiError ? query.error.value.error : null,
  )
  return { gameId, date, query, returnTo, apiError }
}
