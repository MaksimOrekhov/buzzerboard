import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, onMounted, onUnmounted, toValue, type MaybeRefOrGetter } from 'vue'

import { fetchGamesForDate } from '@/features/games/api'
import type { NbaGameDate } from '@/entities/nba/model'
import type { GamesResponse } from '@/shared/api/nba/contracts'
import { isSettledGameResult } from '@/shared/api/nba/gameDetailsGuards'

const FRESH_MS = 5 * 60_000
export const gamesQueryKey = (date: NbaGameDate) => ['nba', 'games', date] as const

function needsYesterdayRefresh(snapshot: GamesResponse | undefined) {
  if (!snapshot) return true
  return snapshot.data.length ? !snapshot.data.every(isSettledGameResult) : snapshot.meta.isStale
}

export function useGamesForDate(
  date: MaybeRefOrGetter<NbaGameDate>,
  yesterday: MaybeRefOrGetter<NbaGameDate | null>,
) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: computed(() => gamesQueryKey(toValue(date))),
    queryFn: ({ queryKey, signal }) => fetchGamesForDate(queryKey[2], signal),
    staleTime: ({ queryKey, state }) =>
      queryKey[2] === toValue(yesterday) && !needsYesterdayRefresh(state.data)
        ? Infinity
        : FRESH_MS,
    enabled: ({ queryKey, state }) =>
      queryKey[2] !== toValue(yesterday) ||
      state.errorUpdatedAt <= state.dataUpdatedAt ||
      Date.now() - state.errorUpdatedAt >= FRESH_MS,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: ({ queryKey }) => queryKey[2] === toValue(yesterday),
  })

  async function refreshOnReturn() {
    if (document.visibilityState === 'hidden') return
    // The shared NBA date clock updates on the same event.
    await nextTick()
    const current = toValue(date)
    if (current !== toValue(yesterday)) return
    const state = client.getQueryState<GamesResponse>(gamesQueryKey(current))
    if (
      !state ||
      state.fetchStatus !== 'idle' ||
      !needsYesterdayRefresh(state.data) ||
      Date.now() - Math.max(state.dataUpdatedAt, state.errorUpdatedAt) < FRESH_MS
    )
      return
    void query.refetch({ cancelRefetch: false })
  }

  onMounted(() => {
    window.addEventListener('focus', refreshOnReturn)
    document.addEventListener('visibilitychange', refreshOnReturn)
  })
  onUnmounted(() => {
    window.removeEventListener('focus', refreshOnReturn)
    document.removeEventListener('visibilitychange', refreshOnReturn)
  })
  return query
}
