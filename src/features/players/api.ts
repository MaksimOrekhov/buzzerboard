import { useQuery } from '@tanstack/vue-query'
import { toValue, computed, type MaybeRefOrGetter } from 'vue'
import {
  bbsPlayerId,
  playerPath,
  playerSeason,
  type PlayerResponse,
  type PlayersResponse,
} from '@/entities/nba/players'
import { fetchWorkerResource } from '@/shared/api/nba/workerClient'

const options = { staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false } as const
const query = '?seasonEndYear=' + playerSeason
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function snapshot(value: unknown): value is Record<string, unknown> {
  return (
    object(value) &&
    value.seasonEndYear === playerSeason &&
    value.source === 'bbs' &&
    typeof value.fetchedAt === 'string' &&
    typeof value.isStale === 'boolean' &&
    object(value.coverage)
  )
}
function player(value: unknown) {
  return (
    object(value) &&
    typeof value.id === 'string' &&
    bbsPlayerId.test(value.id) &&
    typeof value.name === 'string'
  )
}
export function usePlayers(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    ...options,
    queryKey: ['nba', 'players', playerSeason],
    enabled: computed(() => toValue(enabled)),
    queryFn: ({ signal }) =>
      fetchWorkerResource(
        '/api/players' + query,
        (value): value is PlayersResponse =>
          snapshot(value) &&
          Array.isArray(value.players) &&
          value.players.length <= 1500 &&
          value.players.every(player),
        signal,
      ),
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
        (value): value is PlayerResponse =>
          snapshot(value) &&
          object(value.player) &&
          player(value.player) &&
          value.player.id === key,
        signal,
      ),
  })
}
