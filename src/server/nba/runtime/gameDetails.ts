import type { Game, GameId, NbaGameDate, NbaProviderId, UtcTimestamp } from '@/entities/nba/model'
import { normalizeDunkGameDetails } from '@/server/nba/adapters/gameDetails'
import {
  NbaAdapterError,
  createNbaApiError,
  mapHttpStatusToNbaError,
} from '@/server/nba/adapters/errors'
import type { BoxScoreCacheRecord, NbaRepository, WorkerEnvironment } from './types'
import { gameDetailsCacheKey, gamesCacheKey, scheduleCacheKey } from './cacheKeys'
import { parseNbaGameDate } from '@/server/nba/adapters/normalizers/primitives'
import { readDunkApiCreditBudget } from '@/server/nba/runtime/creditBudget'

const PROVIDER_URL = 'https://mcp.dunkapi.com/v1/get_game'
const TIMEOUT_MS = 12_000
const LOCK_MS = 30_000
const COOLDOWN_MS = 15 * 60_000
const FRESH_MS = 24 * 60 * 60_000
const MAX_STALE_MS = 30 * 24 * 60 * 60_000
export interface BoxScoreTarget {
  type: 'boxScore'
  date: NbaGameDate
  gameId: GameId
}

export interface BoxScoreRefreshOutcome {
  target: BoxScoreTarget
  state: 'refreshed' | 'up_to_date' | 'deferred' | 'in_progress'
  isStale: boolean
  fetchedAt: UtcTimestamp | null
  retryAfter: UtcTimestamp | null
  error: ReturnType<typeof createNbaApiError> | null
}

export function parseSourceGameId(value: unknown): { provider: NbaProviderId; id: GameId } | null {
  if (typeof value !== 'string') return null
  const match = /^(dunkapi|espn|bbs):game:(.+)$/.exec(value)
  return match ? { provider: match[1] as NbaProviderId, id: value as GameId } : null
}

export async function findCachedGame(
  repository: NbaRepository,
  date: NbaGameDate,
  gameId: GameId,
  now = Date.now(),
): Promise<Game | null> {
  const parsed = parseSourceGameId(gameId)
  if (!parsed) return null
  const exact = await repository.getCache(gamesCacheKey(parsed.provider, date))
  const exactGame =
    exact?.capability === 'games' && now < exact.staleUntil
      ? exact.data.find((game) => game.id === gameId && game.nbaGameDate === date)
      : undefined
  if (exactGame) return exactGame

  const schedule = await repository.getCache(scheduleCacheKey(parsed.provider))
  if (
    schedule?.capability !== 'schedule' ||
    now >= schedule.staleUntil ||
    date < schedule.coverage.from ||
    date > schedule.coverage.through
  )
    return null
  return schedule.data.find((game) => game.id === gameId && game.nbaGameDate === date) ?? null
}

function asTimestamp(value: number): UtcTimestamp {
  return new Date(value).toISOString() as UtcTimestamp
}

function errorResult(
  target: BoxScoreTarget,
  state: BoxScoreRefreshOutcome['state'],
  now: number,
  error: BoxScoreRefreshOutcome['error'],
  record: BoxScoreCacheRecord | null = null,
  retryAt: number | null = record?.retryAt ?? null,
): BoxScoreRefreshOutcome {
  return {
    target,
    state,
    isStale: !record || now >= record.expiresAt,
    fetchedAt: record?.fetchedAt ?? null,
    retryAfter: retryAt === null ? null : asTimestamp(retryAt),
    error,
  }
}

function config(env: WorkerEnvironment, now: number) {
  const budget = readDunkApiCreditBudget(env, now)
  if (env.DUNKAPI_BOX_SCORE_REFRESH_ENABLED !== 'true' || !budget || budget.boxScoreLimit < 5)
    return null
  return budget
}

async function cacheFailure(
  repository: NbaRepository,
  game: Game,
  previous: BoxScoreCacheRecord | null,
  error: ReturnType<typeof createNbaApiError>,
  now: number,
): Promise<BoxScoreCacheRecord> {
  const record: BoxScoreCacheRecord = {
    cacheKey: gameDetailsCacheKey(game.provider, game.id),
    capability: 'boxScore',
    gameId: game.id,
    provider: game.provider,
    data: previous?.data ?? null,
    fetchedAt: previous?.fetchedAt ?? asTimestamp(now),
    providerUpdatedAt: previous?.providerUpdatedAt ?? null,
    rejectedRecords: previous?.rejectedRecords ?? 0,
    expiresAt: Math.min(previous?.expiresAt ?? now, now),
    staleUntil: Math.max(previous?.staleUntil ?? 0, now + MAX_STALE_MS),
    retryAt: now + COOLDOWN_MS,
    refreshError: error,
  }
  await repository.putCache(record)
  return record
}

export async function refreshGameBoxScore(
  target: BoxScoreTarget,
  game: Game,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
): Promise<BoxScoreRefreshOutcome> {
  if (
    game.id !== target.gameId ||
    game.nbaGameDate !== target.date ||
    game.provider !== 'dunkapi' ||
    game.status !== 'final' ||
    game.score.home === null ||
    game.score.away === null
  )
    return errorResult(target, 'deferred', now, createNbaApiError('invalid_request', game.provider))

  const cacheKey = gameDetailsCacheKey(game.provider, game.id)
  const previous = await repository.getCache(cacheKey)
  const cached = previous?.capability === 'boxScore' ? previous : null
  if (cached && cached.data && now < cached.expiresAt)
    return errorResult(target, 'up_to_date', now, cached.refreshError, cached, null)
  if (cached?.retryAt && cached.retryAt > now)
    return errorResult(target, 'deferred', now, cached.refreshError, cached, cached.retryAt)

  const budget = config(env, now)
  const apiKey = env.DUNKAPI_API_KEY
  if (!budget || !apiKey) {
    return errorResult(
      target,
      'deferred',
      now,
      createNbaApiError('not_configured', 'dunkapi'),
      cached,
    )
  }

  const token = crypto.randomUUID()
  const lockExpires = now + LOCK_MS
  if (!(await repository.tryAcquireLock(cacheKey, token, now, lockExpires))) {
    return errorResult(target, 'in_progress', now, null, cached, lockExpires)
  }

  try {
    const latest = await repository.getCache(cacheKey)
    const current = latest?.capability === 'boxScore' ? latest : null
    if (current?.data && now < current.expiresAt)
      return errorResult(target, 'up_to_date', now, current.refreshError, current, null)
    if (current?.retryAt && current.retryAt > now)
      return errorResult(target, 'deferred', now, current.refreshError, current, current.retryAt)

    const usage = await repository.getCreditUsage(budget.month)
    if (usage && usage.baselineCredits !== budget.baselineCredits) {
      const error = createNbaApiError('not_configured', 'dunkapi')
      const record = await cacheFailure(repository, game, current, error, now)
      return errorResult(target, 'deferred', now, error, record)
    }
    if (
      !(await repository.consumeRateSlot(`dunkapi:boxscore:${budget.month}`, now, 5 * 60_000, 1))
    ) {
      const error = createNbaApiError('rate_limited', 'dunkapi', true)
      const retryAt = Math.floor(now / (5 * 60_000)) * (5 * 60_000) + 5 * 60_000
      const record = await cacheFailure(repository, game, current, error, now)
      return errorResult(target, 'deferred', now, error, record, retryAt)
    }
    const reserved = await repository.reserveBoxScoreCredits(
      budget.month,
      budget.baselineCredits,
      5,
      budget.boxScoreLimit,
      budget.regularAppLimit,
      budget.monthlyLimit,
    )
    if (!reserved) {
      const error = createNbaApiError('quota_exceeded', 'dunkapi')
      const record = await cacheFailure(repository, game, current, error, now)
      return errorResult(target, 'deferred', now, error, record)
    }

    let response: Response
    try {
      response = await fetcher(PROVIDER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ league: 'nba', game_id: game.providerId }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      const error = createNbaApiError('timeout', 'dunkapi', true)
      const record = await cacheFailure(repository, game, current, error, now)
      return errorResult(target, 'deferred', now, error, record)
    }
    if (!response.ok) {
      const error = mapHttpStatusToNbaError('dunkapi', response.status)
      const record = await cacheFailure(repository, game, current, error, now)
      return errorResult(target, 'deferred', now, error, record)
    }

    try {
      const payload: unknown = await response.json()
      const data = normalizeDunkGameDetails(payload, game)
      const record: BoxScoreCacheRecord = {
        cacheKey,
        capability: 'boxScore',
        gameId: game.id,
        provider: game.provider,
        data,
        fetchedAt: asTimestamp(now),
        providerUpdatedAt: null,
        rejectedRecords: 0,
        expiresAt: now + FRESH_MS,
        staleUntil: now + MAX_STALE_MS,
        retryAt: null,
        refreshError: null,
      }
      await repository.putCache(record)
      return errorResult(target, 'refreshed', now, null, record, null)
    } catch (cause) {
      const error =
        cause instanceof NbaAdapterError
          ? cause.details
          : createNbaApiError('invalid_response', 'dunkapi')
      const record = await cacheFailure(repository, game, current, error, now)
      return errorResult(target, 'deferred', now, error, record)
    }
  } finally {
    try {
      await repository.releaseLock(cacheKey, token)
    } catch {
      // The lease expires if D1 cannot delete the lock.
    }
  }
}

export function parseBoxScoreTarget(value: unknown): BoxScoreTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const target = value as Record<string, unknown>
  const date = parseNbaGameDate(target.date)
  const game = parseSourceGameId(target.gameId)
  return target.type === 'boxScore' && date && game?.provider === 'dunkapi'
    ? { type: 'boxScore', date, gameId: game.id }
    : null
}
