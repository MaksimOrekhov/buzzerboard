import type { Game, GameId, NbaGameDate } from '@/entities/nba/model'
import { fetchWorkerResource, WorkerApiError } from '@/shared/api/nba/workerClient'
import type { GameDetailsResponse, GamesResponse } from '@/shared/api/nba/contracts'

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

export async function fetchGameDetails(
  gameId: GameId,
  date: NbaGameDate,
  signal?: AbortSignal,
): Promise<GameDetailsResponse> {
  const response = await fetchWorkerResource(
    `/api/games/${encodeURIComponent(gameId)}?date=${encodeURIComponent(date)}`,
    (payload): payload is GameDetailsResponse =>
      isRecord(payload) &&
      isRecord(payload.data) &&
      isGame(payload.data.game) &&
      payload.data.game.id === gameId &&
      (payload.data.boxScore === null || isRecord(payload.data.boxScore)) &&
      isRecord(payload.meta) &&
      (payload.meta.source === 'dunkapi' || payload.meta.source === 'espn') &&
      typeof payload.meta.fetchedAt === 'string' &&
      typeof payload.meta.isStale === 'boolean' &&
      (payload.boxScoreMeta === null || isRecord(payload.boxScoreMeta)),
    signal,
  )
  if (response.data.boxScore && response.data.boxScore.game.id !== gameId) {
    throw new WorkerApiError(
      200,
      {
        code: 'invalid_response',
        message: 'Worker API вернул детали другого матча.',
        retryable: false,
        provider: null,
        upstreamStatus: null,
      },
      null,
    )
  }
  return response
}
