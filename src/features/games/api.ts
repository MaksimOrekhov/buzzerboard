import type { Game, NbaGameDate } from '@/entities/nba/model'
import { fetchWorkerResource } from '@/shared/api/nba/workerClient'
import type { GamesResponse } from '@/shared/api/nba/contracts'

export { WorkerApiError } from '@/shared/api/nba/workerClient'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isGamesResponse(payload: unknown): payload is GamesResponse {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.meta)) return false
  return (
    (payload.meta.source === 'dunkapi' || payload.meta.source === 'espn') &&
    typeof payload.meta.fetchedAt === 'string' &&
    typeof payload.meta.isStale === 'boolean' &&
    typeof payload.meta.rejectedRecords === 'number'
  )
}

function isGame(value: unknown): value is Game {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.provider === 'dunkapi' || value.provider === 'espn') &&
    typeof value.nbaGameDate === 'string' &&
    typeof value.status === 'string' &&
    isRecord(value.homeTeam) &&
    isRecord(value.awayTeam) &&
    isRecord(value.score)
  )
}

export async function fetchGamesForDate(
  date: NbaGameDate,
  signal?: AbortSignal,
): Promise<GamesResponse> {
  return fetchWorkerResource(
    `/api/games?date=${encodeURIComponent(date)}`,
    (payload): payload is GamesResponse => isGamesResponse(payload) && payload.data.every(isGame),
    signal,
  )
}
