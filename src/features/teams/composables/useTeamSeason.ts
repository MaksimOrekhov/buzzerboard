import { useQuery } from '@tanstack/vue-query'
import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { SeasonEndYear } from '@/entities/nba/model'
import { fetchTeamSeason } from '../api'

export const teamSeasonQueryKey = (teamCode: string, seasonEndYear: SeasonEndYear) =>
  ['nba', 'team-season', teamCode, seasonEndYear] as const

export function useTeamSeason(
  teamCode: MaybeRefOrGetter<string>,
  seasonEndYear: MaybeRefOrGetter<SeasonEndYear>,
) {
  const currentCode = computed(() => toValue(teamCode))
  const currentSeason = computed(() => toValue(seasonEndYear))
  return useQuery({
    queryKey: computed(() => teamSeasonQueryKey(currentCode.value, currentSeason.value)),
    queryFn: ({ queryKey: [, , code, season], signal }) => fetchTeamSeason(code, season, signal),
    enabled: computed(() => currentCode.value.length > 0),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  })
}
