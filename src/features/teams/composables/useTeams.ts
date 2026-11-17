import { useQuery } from '@tanstack/vue-query'
import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { SeasonEndYear } from '@/entities/nba/model'
import { fetchTeams } from '../api'

export const teamsQueryKey = (seasonEndYear: SeasonEndYear) =>
  ['nba', 'teams', seasonEndYear] as const

export function useTeams(seasonEndYear: MaybeRefOrGetter<SeasonEndYear>) {
  const currentSeason = computed(() => toValue(seasonEndYear))
  return useQuery({
    queryKey: computed(() => teamsQueryKey(currentSeason.value)),
    queryFn: ({ signal }) => fetchTeams(currentSeason.value, signal),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  })
}
