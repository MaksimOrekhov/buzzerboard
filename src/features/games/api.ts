import type { Game, GameId, NbaGameDate } from '@/entities/nba/model'
import { fetchWorkerResource, WorkerApiError } from '@/shared/api/nba/workerClient'
import type { GameDetailsResponse, GamesResponse } from '@/shared/api/nba/contracts'
import { isGameBoxScoreForGame, isGameRecord } from '@/shared/api/nba/gameDetailsGuards'

export { WorkerApiError } from '@/shared/api/nba/workerClient'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isGamesResponse(payload: unknown): payload is GamesResponse {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.meta)) return false
  return (
    (payload.meta.source === 'dunkapi' ||
      payload.meta.source === 'espn' ||
      payload.meta.source === 'bbs') &&
    typeof payload.meta.fetchedAt === 'string' &&
    typeof payload.meta.isStale === 'boolean' &&
    typeof payload.meta.rejectedRecords === 'number'
  )
}

function isGame(value: unknown): value is Game {
  return isGameRecord(value)
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
      'boxScore' in payload.data &&
      isRecord(payload.meta) &&
      (payload.meta.source === 'dunkapi' ||
        payload.meta.source === 'espn' ||
        payload.meta.source === 'bbs') &&
      typeof payload.meta.fetchedAt === 'string' &&
      typeof payload.meta.isStale === 'boolean' &&
      (payload.boxScoreMeta === null || isRecord(payload.boxScoreMeta)) &&
      (payload.boxScoreAvailability === 'available' ||
        payload.boxScoreAvailability === 'unavailable' ||
        payload.boxScoreAvailability === 'snapshot_mismatch'),
    signal,
  )
  if (response.data.game.nbaGameDate !== date) {
    throw new WorkerApiError(
      200,
      {
        code: 'invalid_response',
        message: 'Worker API вернул матч не для запрошенного игрового дня.',
        retryable: false,
        provider: null,
        upstreamStatus: null,
      },
      null,
    )
  }
  if (response.data.boxScore === null) {
    if (response.boxScoreAvailability === 'available') {
      return {
        ...response,
        boxScoreAvailability: 'snapshot_mismatch',
        boxScoreMeta: null,
      }
    }
    return response
  }
  if (
    response.boxScoreAvailability !== 'available' ||
    !isGameBoxScoreForGame(response.data.boxScore, response.data.game)
  ) {
    return {
      ...response,
      data: { ...response.data, boxScore: null },
      boxScoreMeta: null,
      boxScoreAvailability: 'snapshot_mismatch',
    }
  }
  return response
}
