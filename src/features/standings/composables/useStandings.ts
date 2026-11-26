import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

import { fetchStandings } from '@/features/standings/api'
import type { SeasonEndYear } from '@/entities/nba/model'

export const standingsQueryKey = (seasonEndYear: SeasonEndYear) =>
  ['nba', 'standings', seasonEndYear] as const

export function useStandings(seasonEndYear: MaybeRefOrGetter<SeasonEndYear>) {
  return useQuery({
    queryKey: computed(() => standingsQueryKey(toValue(seasonEndYear))),
    queryFn: ({ queryKey: [, , requestedSeason], signal }) =>
      fetchStandings(requestedSeason, signal),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  })
}
