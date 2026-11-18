import { useQuery } from '@tanstack/vue-query'
import { toValue, computed, type MaybeRefOrGetter } from 'vue'
import { bbsPlayerId, playerPath, playerSeason, type PlayerResponse } from '@/entities/nba/players'
import { fetchWorkerResource } from '@/shared/api/nba/workerClient'
import { isPlayerResponse, isPlayersResponse } from '@/entities/nba/playerSnapshotGuards'

const options = { staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false } as const
const query = '?seasonEndYear=' + playerSeason
export function usePlayers(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    ...options,
    queryKey: ['nba', 'players', playerSeason],
    enabled: computed(() => toValue(enabled)),
    queryFn: ({ signal }) => fetchWorkerResource('/api/players' + query, isPlayersResponse, signal),
  })
}
export function usePlayer(id: MaybeRefOrGetter<string>) {
  return useQuery({
    ...options,
    queryKey: computed(() => ['nba', 'player', toValue(id), playerSeason] as const),
    enabled: computed(() => bbsPlayerId.test(toValue(id))),
    queryFn: ({ queryKey: [, , key], signal }) =>
      fetchWorkerResource(
        '/api' + playerPath(key) + query,
        (value): value is PlayerResponse => isPlayerResponse(value) && value.player.id === key,
        signal,
      ),
  })
}
