import type { Game, NbaApiError, NbaApiErrorCode, NbaGameDate } from '@/entities/nba/model'
import type { GamesResponse } from '@/shared/api/nba/contracts'

const errorCodes = new Set<NbaApiErrorCode>([
  'authentication',
  'forbidden',
  'rate_limited',
  'not_found',
  'cache_miss',
  'invalid_request',
  'timeout',
  'upstream_unavailable',
  'invalid_response',
  'unauthorized',
  'quota_exceeded',
  'not_configured',
  'refresh_in_progress',
  'storage_unavailable',
  'unknown',
])

export class WorkerApiError extends Error {
  constructor(
    readonly status: number,
    readonly error: NbaApiError,
    readonly requestId: string | null,
  ) {
    super(error.message)
    this.name = 'WorkerApiError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseApiError(payload: unknown): NbaApiError | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null
  const value = payload.error
  if (
    typeof value.code !== 'string' ||
    !errorCodes.has(value.code as NbaApiErrorCode) ||
    typeof value.message !== 'string' ||
    typeof value.retryable !== 'boolean'
  ) {
    return null
  }

  return {
    code: value.code as NbaApiErrorCode,
    message: value.message,
    retryable: value.retryable,
    provider: value.provider === 'dunkapi' || value.provider === 'espn' ? value.provider : null,
    upstreamStatus: typeof value.upstreamStatus === 'number' ? value.upstreamStatus : null,
  }
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
  const request: RequestInit = {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
  }
  if (signal) request.signal = signal
  const response = await fetch(`/api/games?date=${encodeURIComponent(date)}`, request)

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new WorkerApiError(
      response.status,
      {
        code: 'invalid_response',
        message: 'Worker API вернул некорректный JSON.',
        retryable: false,
        provider: null,
        upstreamStatus: null,
      },
      null,
    )
  }

  if (!response.ok) {
    const error = parseApiError(payload)
    if (error) {
      const requestId =
        isRecord(payload) && typeof payload.requestId === 'string' ? payload.requestId : null
      throw new WorkerApiError(response.status, error, requestId)
    }
    throw new WorkerApiError(
      response.status,
      {
        code: 'unknown',
        message: 'Worker API не смог получить данные NBA.',
        retryable: false,
        provider: null,
        upstreamStatus: null,
      },
      null,
    )
  }

  if (!isGamesResponse(payload) || !payload.data.every(isGame)) {
    throw new WorkerApiError(
      response.status,
      {
        code: 'invalid_response',
        message: 'Worker API вернул данные игр в неизвестном формате.',
        retryable: false,
        provider: null,
        upstreamStatus: null,
      },
      null,
    )
  }

  return payload
}
