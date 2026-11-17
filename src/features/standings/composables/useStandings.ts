import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

import { fetchStandings } from '@/features/standings/api'
import type { SeasonEndYear } from '@/entities/nba/model'

export const standingsQueryKey = (seasonEndYear: SeasonEndYear) =>
  ['nba', 'standings', seasonEndYear] as const

export function useStandings(seasonEndYear: MaybeRefOrGetter<SeasonEndYear>) {
  const currentSeason = computed(() => toValue(seasonEndYear))

  return useQuery({
    queryKey: computed(() => standingsQueryKey(currentSeason.value)),
    queryFn: ({ signal }) => fetchStandings(currentSeason.value, signal),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  })
}
