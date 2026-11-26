import type { NbaApiError, NbaApiErrorCode } from '@/entities/nba/model'
import type { NbaApiSnapshot } from './contracts'
import { isIsoInstant } from './gameDetailsGuards'

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

function isSnapshotRefreshError(value: unknown): value is NbaApiError {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    errorCodes.has(value.code as NbaApiErrorCode) &&
    typeof value.message === 'string' &&
    typeof value.retryable === 'boolean' &&
    (value.provider === null ||
      value.provider === 'dunkapi' ||
      value.provider === 'espn' ||
      value.provider === 'bbs') &&
    (value.upstreamStatus === null ||
      (typeof value.upstreamStatus === 'number' &&
        Number.isSafeInteger(value.upstreamStatus) &&
        value.upstreamStatus >= 100 &&
        value.upstreamStatus <= 599))
  )
}

export function isSnapshotMeta(meta: unknown): meta is NbaApiSnapshot<unknown>['meta'] {
  return (
    isRecord(meta) &&
    (meta.source === 'dunkapi' || meta.source === 'espn' || meta.source === 'bbs') &&
    isIsoInstant(meta.fetchedAt) &&
    (meta.providerUpdatedAt === null || isIsoInstant(meta.providerUpdatedAt)) &&
    typeof meta.isStale === 'boolean' &&
    typeof meta.rejectedRecords === 'number' &&
    Number.isSafeInteger(meta.rejectedRecords) &&
    meta.rejectedRecords >= 0 &&
    (meta.refreshError === null || isSnapshotRefreshError(meta.refreshError))
  )
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
    provider:
      value.provider === 'dunkapi' || value.provider === 'espn' || value.provider === 'bbs'
        ? value.provider
        : null,
    upstreamStatus: typeof value.upstreamStatus === 'number' ? value.upstreamStatus : null,
  }
}

function apiError(code: NbaApiErrorCode, message: string, retryable = false): NbaApiError {
  return { code, message, retryable, provider: null, upstreamStatus: null }
}

export async function fetchWorkerResource<T>(
  path: string,
  isPayload: (payload: unknown) => payload is T,
  signal?: AbortSignal,
): Promise<T> {
  const request: RequestInit = {
    method: 'GET',
    headers: { accept: 'application/json' },
    cache: 'no-store',
  }
  if (signal) request.signal = signal

  const response = await fetch(path, request)
  let payload: unknown

  try {
    payload = await response.json()
  } catch {
    throw new WorkerApiError(
      response.status,
      apiError('invalid_response', 'Worker API вернул некорректный JSON.'),
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
      apiError('unknown', 'Worker API не смог получить данные NBA.'),
      null,
    )
  }

  if (!isPayload(payload)) {
    throw new WorkerApiError(
      response.status,
      apiError('invalid_response', 'Worker API вернул данные в неизвестном формате.'),
      null,
    )
  }

  return payload
}
