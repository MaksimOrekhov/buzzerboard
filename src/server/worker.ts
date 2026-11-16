import type { Game, NbaApiError, NbaApiErrorCode, NbaProviderId } from '@/entities/nba/model'
import type {
  GamesResponse,
  NbaApiErrorResponse,
  NbaApiSnapshot,
  NbaRevalidationResponse,
  NbaRevalidationTarget,
  StandingsResponse,
} from '@/shared/api/nba/contracts'
import { createNbaApiError } from '@/server/nba/adapters/errors'
import { parseNbaGameDate, parseSeasonEndYear } from '@/server/nba/adapters/normalizers/primitives'
import { D1NbaRepository } from '@/server/nba/runtime/d1Repository'
import { gamesCacheKey, scheduleCacheKey, standingsCacheKey } from '@/server/nba/runtime/cacheKeys'
import {
  refreshNbaResource,
  runScheduledRefresh,
  getProviderForTarget,
  nbaSeasonEndYearForDate,
} from '@/server/nba/runtime/refresh'
import type {
  GamesCacheRecord,
  NbaCacheRecord,
  NbaRefreshTarget,
  NbaRepository,
  WorkerDependencies,
  WorkerEnvironment,
  WorkerExecutionContext,
  ScheduledController,
} from '@/server/nba/runtime/types'

const PRIVATE_HEADERS = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
}

function suppressLiveStatus(games: readonly Game[]): readonly Game[] {
  return games.map((game) =>
    game.status === 'live' ? { ...game, status: 'unknown' as const } : game,
  )
}

function createError(
  code: NbaApiErrorCode,
  provider: NbaProviderId | null = null,
  retryable = false,
): NbaApiError {
  return createNbaApiError(code, provider, retryable)
}

function jsonResponse<T>(body: T, status = 200, extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(PRIVATE_HEADERS)
  headers.set('content-type', 'application/json; charset=utf-8')
  new Headers(extraHeaders).forEach((value, key) => headers.set(key, value))
  return new Response(JSON.stringify(body), { status, headers })
}

function errorResponse(
  error: NbaApiError,
  requestId: string,
  status: number,
  retryAfterSeconds?: number,
): Response {
  const body: NbaApiErrorResponse = { error, requestId }
  const headers: Record<string, string> = {}
  if (retryAfterSeconds !== undefined) headers['retry-after'] = String(retryAfterSeconds)
  return jsonResponse(body, status, headers)
}

function responseStatusForError(error: NbaApiError): number {
  switch (error.code) {
    case 'unauthorized':
    case 'authentication':
      return 401
    case 'invalid_request':
      return 400
    case 'not_found':
      return 404
    case 'cache_miss':
      return 503
    case 'quota_exceeded':
    case 'rate_limited':
      return 429
    case 'refresh_in_progress':
      return 409
    case 'not_configured':
    case 'storage_unavailable':
    case 'timeout':
    case 'upstream_unavailable':
    case 'invalid_response':
      return 503
    case 'forbidden':
      return 403
    case 'unknown':
      return 500
  }
}

function apiSnapshot<T>(
  record: NbaCacheRecord,
  data: T,
  now: number,
  refreshError: NbaApiError | null = record.refreshError,
): NbaApiSnapshot<T> {
  return {
    data,
    meta: {
      source: record.provider,
      fetchedAt: record.fetchedAt,
      providerUpdatedAt: record.providerUpdatedAt,
      isStale: now >= record.expiresAt,
      rejectedRecords: record.rejectedRecords,
      refreshError,
    },
  }
}

async function usableCache(
  repository: NbaRepository,
  cacheKey: string,
  now: number,
): Promise<NbaCacheRecord | null> {
  const record = await repository.getCache(cacheKey)
  if (!record) return null
  if (now >= record.staleUntil) {
    await repository.deleteCache(cacheKey)
    return null
  }
  return record
}

async function getGames(
  url: URL,
  env: WorkerEnvironment,
  repository: NbaRepository,
  now: number,
  requestId: string,
): Promise<Response> {
  const date = parseNbaGameDate(url.searchParams.get('date'))
  if (!date || !nbaSeasonEndYearForDate(date)) {
    return errorResponse(createError('invalid_request'), requestId, 400)
  }

  const target: NbaRefreshTarget = { type: 'games', date }
  const provider = getProviderForTarget(target, env)
  if (!provider) return errorResponse(createError('not_configured'), requestId, 503)

  const exact = await usableCache(repository, gamesCacheKey(provider, date), now)
  if (exact?.capability === 'games' && now < exact.expiresAt) {
    return gamesResponse(exact, suppressLiveStatus(exact.data), now)
  }

  const schedule = await usableCache(repository, scheduleCacheKey(provider), now)
  const exactGames: GamesCacheRecord | null = exact?.capability === 'games' ? exact : null
  const scheduleSnapshot: GamesCacheRecord | null =
    schedule?.capability === 'schedule' &&
    schedule.coverage.from <= date &&
    date <= schedule.coverage.through
      ? schedule
      : null
  const scheduledGames = scheduleSnapshot
    ? scheduleSnapshot.data.filter((game) => game.nbaGameDate === date)
    : []
  if (!exactGames && !scheduleSnapshot) {
    const error = createError('cache_miss', provider, true)
    return errorResponse(error, requestId, 503)
  }

  const merged = new Map<string, (typeof scheduledGames)[number]>()
  for (const game of suppressLiveStatus(scheduledGames)) merged.set(game.id, game)
  for (const game of suppressLiveStatus(exactGames?.data ?? [])) merged.set(game.id, game)
  const sourceRecords = [exactGames, scheduleSnapshot].filter(
    (record): record is GamesCacheRecord => record !== null,
  )
  const newest = sourceRecords.reduce((current, record) =>
    record.fetchedAt > current.fetchedAt ? record : current,
  )
  const refreshError = sourceRecords.find((record) => record.refreshError)?.refreshError ?? null
  const data = [...merged.values()]
  const response: GamesResponse = {
    data,
    meta: {
      source: provider,
      fetchedAt: newest.fetchedAt,
      providerUpdatedAt: newest.providerUpdatedAt,
      isStale: sourceRecords.some((record) => now >= record.expiresAt),
      rejectedRecords: sourceRecords.reduce((total, record) => total + record.rejectedRecords, 0),
      refreshError,
    },
  }
  return jsonResponse(
    response,
    200,
    response.meta.isStale ? { warning: '110 - "Response is stale"' } : {},
  )
}

function gamesResponse(
  record: GamesCacheRecord,
  data: GamesResponse['data'],
  now: number,
): Response {
  const response = apiSnapshot(record, data, now) satisfies GamesResponse
  return jsonResponse(
    response,
    200,
    response.meta.isStale ? { warning: '110 - "Response is stale"' } : {},
  )
}

async function getStandings(
  url: URL,
  env: WorkerEnvironment,
  repository: NbaRepository,
  now: number,
  requestId: string,
): Promise<Response> {
  const rawYear = url.searchParams.get('seasonEndYear')
  const seasonEndYear = parseSeasonEndYear(rawYear)
  if (!seasonEndYear || String(seasonEndYear) !== rawYear) {
    return errorResponse(createError('invalid_request'), requestId, 400)
  }

  const target: NbaRefreshTarget = { type: 'standings', seasonEndYear }
  const provider = getProviderForTarget(target, env)
  if (!provider) return errorResponse(createError('not_configured'), requestId, 503)
  const record = await usableCache(repository, standingsCacheKey(provider, seasonEndYear), now)
  if (!record || record.capability !== 'standings') {
    return errorResponse(createError('cache_miss', provider, true), requestId, 503)
  }
  const response: StandingsResponse = apiSnapshot(record, record.data, now)
  return jsonResponse(
    response,
    200,
    response.meta.isStale ? { warning: '110 - "Response is stale"' } : {},
  )
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

async function readRefreshTarget(request: Request): Promise<NbaRefreshTarget | null> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 2_048) return null
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    return null
  try {
    const rawBody = await request.text()
    if (rawBody.length > 2_048) return null
    const payload: unknown = JSON.parse(rawBody)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
    const resource = (payload as Record<string, unknown>).resource
    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) return null
    const target = resource as Record<string, unknown>
    if (target.type === 'games') {
      const date = parseNbaGameDate(target.date)
      return date && nbaSeasonEndYearForDate(date) ? { type: 'games', date } : null
    }
    if (target.type === 'standings') {
      const seasonEndYear = parseSeasonEndYear(target.seasonEndYear)
      return seasonEndYear ? { type: 'standings', seasonEndYear } : null
    }
    if (target.type === 'schedule') return { type: 'schedule' }
  } catch {
    return null
  }
  return null
}

function refreshResponseTarget(target: NbaRefreshTarget): NbaRevalidationTarget {
  if (target.type === 'games') return { type: 'games', date: target.date }
  if (target.type === 'standings') return target
  return target
}

async function postRevalidate(
  request: Request,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
  requestId: string,
): Promise<Response> {
  const expectedToken = env.MANUAL_REFRESH_TOKEN
  if (!expectedToken) {
    return errorResponse(createError('not_configured'), requestId, 503)
  }
  const authorization = request.headers.get('authorization') ?? ''
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!bearer || !constantTimeEqual(bearer, expectedToken)) {
    return errorResponse(createError('unauthorized'), requestId, 401)
  }

  const allowed = await repository.consumeRateSlot('manual:revalidate', now, 5 * 60_000, 1)
  if (!allowed) {
    const retryAfter = Math.ceil((5 * 60_000 - (now % (5 * 60_000))) / 1000)
    return errorResponse(createError('rate_limited'), requestId, 429, retryAfter)
  }

  const target = await readRefreshTarget(request)
  if (!target) return errorResponse(createError('invalid_request'), requestId, 400)

  const result = await refreshNbaResource(target, env, repository, fetcher, now)
  const body: NbaRevalidationResponse = {
    target: refreshResponseTarget(target),
    state: result.state,
    isStale: result.isStale,
    fetchedAt: result.fetchedAt,
    retryAfter: result.retryAfter,
    error: result.error,
  }
  const status = result.error
    ? responseStatusForError(result.error)
    : result.state === 'in_progress'
      ? 409
      : 200
  return jsonResponse(
    body,
    status,
    result.retryAfter
      ? {
          'retry-after': String(
            Math.max(1, Math.ceil((Date.parse(result.retryAfter) - now) / 1000)),
          ),
        }
      : {},
  )
}

async function handleApiRequest(
  request: Request,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
  requestId: string,
): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === '/api/news') {
    if (request.method !== 'GET')
      return errorResponse(createError('invalid_request'), requestId, 405, 60)
    return errorResponse(createError('not_configured'), requestId, 503)
  }

  if (url.pathname === '/api/games') {
    if (request.method !== 'GET')
      return errorResponse(createError('invalid_request'), requestId, 405)
    return getGames(url, env, repository, now, requestId)
  }

  if (url.pathname === '/api/standings') {
    if (request.method !== 'GET')
      return errorResponse(createError('invalid_request'), requestId, 405)
    return getStandings(url, env, repository, now, requestId)
  }

  if (url.pathname === '/api/revalidate') {
    if (request.method !== 'POST')
      return errorResponse(createError('invalid_request'), requestId, 405)
    return postRevalidate(request, env, repository, fetcher, now, requestId)
  }

  return errorResponse(createError('not_found'), requestId, 404)
}

export function createNbaWorker(dependencies: WorkerDependencies = {}) {
  const now = dependencies.now ?? Date.now
  const fetcher = dependencies.fetcher ?? fetch

  function getRepository(env: WorkerEnvironment): NbaRepository | null {
    if (dependencies.repository) return dependencies.repository
    return env.NBA_DB ? new D1NbaRepository(env.NBA_DB) : null
  }

  return {
    async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
      const url = new URL(request.url)
      if (!url.pathname.startsWith('/api/')) {
        return env.ASSETS?.fetch(request) ?? new Response('Not found', { status: 404 })
      }

      const requestId = dependencies.requestId?.() ?? crypto.randomUUID()
      const repository = getRepository(env)
      if (!repository) {
        return errorResponse(createError('storage_unavailable'), requestId, 503)
      }

      try {
        return await handleApiRequest(request, env, repository, fetcher, now(), requestId)
      } catch {
        return errorResponse(createError('storage_unavailable', null, true), requestId, 503)
      }
    },

    async scheduled(
      controller: ScheduledController,
      env: WorkerEnvironment,
      context: WorkerExecutionContext,
    ): Promise<void> {
      const repository = getRepository(env)
      if (!repository) {
        console.error('Scheduled NBA refresh skipped: storage_unavailable')
        return
      }

      const scheduledAt = controller.scheduledTime || now()
      if (env.DUNKAPI_REFRESH_ENABLED !== 'true') {
        await repository.cleanupExpired(scheduledAt)
        console.info('Scheduled NBA refresh skipped: refresh_disabled')
        return
      }

      const task = runScheduledRefresh(env, repository, fetcher, scheduledAt)
        .then((results) => {
          for (const result of results) {
            if (result.error) {
              console.warn(
                `Scheduled NBA refresh deferred: ${result.target.type}:${result.error.code}`,
              )
            }
          }
        })
        .catch(() => {
          console.error('Scheduled NBA refresh failed: storage_unavailable')
        })
      context.waitUntil(task)
    },
  }
}

const worker = createNbaWorker()
export default worker
