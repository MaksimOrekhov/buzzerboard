import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

import { fetchGamesForDate } from '@/features/games/api'
import type { NbaGameDate } from '@/entities/nba/model'

export const gamesQueryKey = (date: NbaGameDate) => ['nba', 'games', date] as const

export function useGamesForDate(date: MaybeRefOrGetter<NbaGameDate>) {
  const currentDate = computed(() => toValue(date))

  return useQuery({
    queryKey: computed(() => gamesQueryKey(currentDate.value)),
    queryFn: ({ signal }) => fetchGamesForDate(currentDate.value, signal),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  })
}
