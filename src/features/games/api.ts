import type { GameId, NbaGameDate } from '@/entities/nba/model'
import { fetchWorkerResource, isSnapshotMeta, WorkerApiError } from '@/shared/api/nba/workerClient'
import type { GameDetailsResponse, GamesResponse } from '@/shared/api/nba/contracts'
import { isGameBoxScoreForGame, isGameSnapshotRecord } from '@/shared/api/nba/gameDetailsGuards'

export { WorkerApiError } from '@/shared/api/nba/workerClient'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type UncheckedGameDetails = Omit<GameDetailsResponse, 'data' | 'boxScoreMeta'> & {
  data: { game: GameDetailsResponse['data']['game']; boxScore: unknown }
  boxScoreMeta: unknown
}

export async function fetchGamesForDate(
  date: NbaGameDate,
  signal?: AbortSignal,
): Promise<GamesResponse> {
  return fetchWorkerResource(
    `/api/games?date=${encodeURIComponent(date)}`,
    (payload): payload is GamesResponse =>
      isRecord(payload) &&
      isSnapshotMeta(payload.meta) &&
      Array.isArray(payload.data) &&
      payload.data.every((game) => isGameSnapshotRecord(game) && game.nbaGameDate === date),
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
    (payload): payload is UncheckedGameDetails =>
      isRecord(payload) &&
      isRecord(payload.data) &&
      isGameSnapshotRecord(payload.data.game) &&
      payload.data.game.id === gameId &&
      'boxScore' in payload.data &&
      isSnapshotMeta(payload.meta) &&
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
  const { game, boxScore } = response.data
  const boxScoreMeta = isSnapshotMeta(response.boxScoreMeta) ? response.boxScoreMeta : null
  if (boxScore === null && response.boxScoreAvailability !== 'available') {
    return { ...response, data: { game, boxScore }, boxScoreMeta }
  }
  if (
    response.boxScoreAvailability !== 'available' ||
    (response.boxScoreMeta !== null && boxScoreMeta === null) ||
    !isRecord(boxScore) ||
    !isGameSnapshotRecord(boxScore.game) ||
    !isGameBoxScoreForGame(boxScore, game)
  ) {
    return {
      ...response,
      data: { game, boxScore: null },
      boxScoreMeta: null,
      boxScoreAvailability: 'snapshot_mismatch',
    }
  }
  return { ...response, data: { game, boxScore }, boxScoreMeta }
}
