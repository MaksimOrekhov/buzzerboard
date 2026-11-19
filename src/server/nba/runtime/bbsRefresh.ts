import { SCHEDULED_BBS_MAX_ATTEMPTS, SCHEDULED_BBS_TASK_LIMIT, scheduledBbsTaskKey } from './types'
import type {
  Game,
  GameId,
  NbaApiError,
  NbaGameDate,
  SeasonEndYear,
  TeamProviderReference,
  UtcTimestamp,
} from '@/entities/nba/model'
import { findNbaTeam, NBA_TEAMS } from '@/entities/nba/teamCatalog'
import {
  normalizeBbsStandings,
  normalizeBbsTeamDirectory,
  normalizeBbsTeamSeason,
} from '@/server/nba/adapters/bbsTeams'
import { normalizeBbsGameBox, normalizeBbsGames } from '@/server/nba/adapters/bbs'
import {
  NbaAdapterError,
  createNbaApiError,
  mapHttpStatusToNbaError,
} from '@/server/nba/adapters/errors'
import { parseNbaGameDate, parseSeasonEndYear } from '@/server/nba/adapters/normalizers/primitives'
import { getDateKeyInTimeZone, NBA_TIME_ZONE } from '@/shared/utils/nbaDate'
import type {
  BoxScoreCacheRecord,
  NbaCacheRecord,
  NbaRepository,
  StandingsCacheRecord,
  TeamDirectoryCacheRecord,
  TeamSeasonCacheRecord,
  ScheduledBbsProgress,
  ScheduledBbsDiagnosticPhase,
  ScheduledBbsFailure,
  ScheduledBbsTaskDiagnostic,
  ScheduledBbsTask,
  WorkerEnvironment,
} from './types'
import {
  gameDetailsCacheKey,
  gamesCacheKey,
  teamDirectoryCacheKey,
  teamSeasonCacheKey,
  standingsCacheKey,
} from './cacheKeys'
import type { NbaRefreshTarget } from './types'
import type { BoxScoreRefreshOutcome } from './gameDetails'
import { isSameFinalGameSnapshot } from '@/shared/api/nba/gameDetailsGuards'
import { runScheduledBbsPlayerRefresh } from './bbsPlayerRefresh'

const DEFAULT_DAILY_LIMIT = 150
const DEFAULT_MINUTE_LIMIT = 10
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const LOCK_MS = 30_000
const REQUEST_TIMEOUT_MS = 12_000
const GAME_TTL_MS = 6 * 60 * MINUTE_MS
const GAME_STALE_MS = 7 * DAY_MS
const BOX_TTL_MS = DAY_MS
const BOX_STALE_MS = 30 * DAY_MS
const TEAM_SEASON_TTL_MS = 6 * 60 * MINUTE_MS
const TEAM_SEASON_STALE_MS = 7 * DAY_MS
const TEAM_DIRECTORY_TTL_MS = 7 * DAY_MS
const TEAM_DIRECTORY_STALE_MS = 30 * DAY_MS
const STANDINGS_TTL_MS = 20 * 60 * MINUTE_MS
const STANDINGS_STALE_MS = 7 * DAY_MS
const COOLDOWN_MS = 15 * MINUTE_MS
const DEFAULT_REQUEST_INTERVAL_MS = 6_100
let previousRequestStartedAt = 0

function archiveTeamReferenceKey(gameId: string, side: 'home' | 'away') {
  return `${gameId}:team:${side}`
}

function readBbsReference(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
  return null
}

function gamesMissingArchiveReferences(
  games: readonly Game[],
  providerReferences: Readonly<Record<string, string>> | undefined,
) {
  return games.filter(
    (game) =>
      game.status === 'final' &&
      (!providerReferences?.[game.id] ||
        !providerReferences[archiveTeamReferenceKey(game.id, 'home')] ||
        !providerReferences[archiveTeamReferenceKey(game.id, 'away')]),
  )
}

function archiveReferenceCount(
  game: Game,
  providerReferences: Readonly<Record<string, string>> | undefined,
) {
  return [
    providerReferences?.[game.id],
    providerReferences?.[archiveTeamReferenceKey(game.id, 'home')],
    providerReferences?.[archiveTeamReferenceKey(game.id, 'away')],
  ].filter(Boolean).length
}

function archiveReferenceSummary(
  games: readonly Game[],
  providerReferences: Readonly<Record<string, string>> | undefined,
) {
  const finals = games.filter((game) => game.status === 'final')
  return {
    expectedCount: finals.length * 3,
    actualCount: finals.reduce(
      (total, game) => total + archiveReferenceCount(game, providerReferences),
      0,
    ),
  }
}

function sameGameTeams(left: Game, right: Game) {
  return (
    left.id === right.id &&
    left.provider === right.provider &&
    left.nbaGameDate === right.nbaGameDate &&
    left.homeTeam.id === right.homeTeam.id &&
    left.awayTeam.id === right.awayTeam.id
  )
}

function hasCompleteFinalScore(game: Game) {
  return game.status !== 'final' || (game.score.home !== null && game.score.away !== null)
}

export interface BbsRefreshOutcome {
  target: NbaRefreshTarget
  state: 'refreshed' | 'up_to_date' | 'deferred' | 'in_progress'
  isStale: boolean
  fetchedAt: UtcTimestamp | null
  retryAfter: UtcTimestamp | null
  error: NbaApiError | null
  diagnostic?: Omit<ScheduledBbsTaskDiagnostic, 'observedAt' | 'errorCode'>
}

export interface BbsBoxTarget {
  type: 'boxScore'
  date: NbaGameDate
  gameId: GameId
}

export interface BbsTeamSeasonTarget {
  type: 'teamSeason'
  teamCode: string
  seasonEndYear: SeasonEndYear
}

export interface BbsTeamDirectoryTarget {
  type: 'teamDirectory'
  seasonEndYear: SeasonEndYear
}

function timestamp(value: number): UtcTimestamp {
  return new Date(value).toISOString() as UtcTimestamp
}

function outcome(
  target: NbaRefreshTarget,
  state: BbsRefreshOutcome['state'],
  record: NbaCacheRecord | null,
  now: number,
  error: NbaApiError | null = record?.refreshError ?? null,
  retryAt: number | null = record?.retryAt ?? null,
  diagnostic?: BbsRefreshOutcome['diagnostic'],
): BbsRefreshOutcome {
  return {
    target,
    state,
    isStale: !record || now >= record.expiresAt,
    fetchedAt: record?.fetchedAt ?? null,
    retryAfter: retryAt === null ? null : timestamp(retryAt),
    error,
    ...(diagnostic ? { diagnostic } : {}),
  }
}

function configuredLimit(value: string | undefined, fallback: number): number {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, fallback) : fallback
}

function requestHeadroom(env: WorkerEnvironment): number {
  const configured = Number(env.BBS_REQUEST_HEADROOM)
  return Number.isSafeInteger(configured) ? Math.max(25, configured) : 25
}

function safeRetryAfter(response: Response, now: number): number {
  const value = response.headers.get('retry-after')
  const seconds = value === null ? NaN : Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return now + seconds * 1000
  const date = value === null ? NaN : Date.parse(value)
  return Number.isFinite(date) && date > now ? date : now + COOLDOWN_MS
}

function resetTime(response: Response, header: string, fallback: number): number {
  const raw = response.headers.get(header)
  const seconds = raw === null ? NaN : Number(raw)
  const resetAt = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : NaN
  return Number.isFinite(resetAt) && resetAt > Date.now() ? resetAt : fallback
}

async function lockStillOwned(
  repository: NbaRepository,
  lock: { key: string; token: string } | undefined,
): Promise<void> {
  if (!lock) return
  const now = Date.now()
  if (!(await repository.renewLock(lock.key, lock.token, now, now + LOCK_MS))) {
    throw Object.assign(createNbaApiError('refresh_in_progress', 'bbs', true), {
      retryAt: now + LOCK_MS,
    })
  }
}

export async function getBbsJson(
  path: string,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
  lock?: { key: string; token: string; coreReserve?: number },
): Promise<unknown> {
  const key = env.BBS_API_KEY
  if (!key || env.BBS_REFRESH_ENABLED !== 'true') throw createNbaApiError('not_configured', 'bbs')
  const intervalValue = Number(env.BBS_REQUEST_INTERVAL_MS)
  const intervalMs =
    Number.isSafeInteger(intervalValue) && intervalValue >= 0
      ? Math.min(intervalValue, 60_000)
      : DEFAULT_REQUEST_INTERVAL_MS
  const elapsedMs = Math.max(0, Date.now() - previousRequestStartedAt)
  const waitMs = intervalMs === 0 ? 0 : Math.max(0, intervalMs - elapsedMs)
  if (previousRequestStartedAt > 0 && waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }
  const requestNow = Math.max(now, Date.now())
  const currentCooldown = await repository.getProviderCooldown('bbs')
  if (currentCooldown && currentCooldown.retryAt > requestNow) {
    throw Object.assign(createNbaApiError(currentCooldown.errorCode, 'bbs', true), {
      retryAt: currentCooldown.retryAt,
    })
  }
  if (currentCooldown) await repository.clearProviderCooldown('bbs', requestNow)
  await lockStillOwned(repository, lock)
  const dailyLimit = configuredLimit(env.BBS_DAILY_REQUEST_LIMIT, DEFAULT_DAILY_LIMIT)
  const reserve = lock?.coreReserve ?? 0
  if (reserve >= dailyLimit)
    throw Object.assign(createNbaApiError('quota_exceeded', 'bbs', true), {
      retryAt: (Math.floor(requestNow / DAY_MS) + 1) * DAY_MS,
    })
  const reservation = await repository.reserveBbsRequest(
    requestNow,
    dailyLimit - reserve,
    configuredLimit(env.BBS_PER_MINUTE_REQUEST_LIMIT, DEFAULT_MINUTE_LIMIT),
  )
  if (!reservation.allowed) {
    if (reserve === 0 || reservation.errorCode !== 'quota_exceeded')
      await repository.setProviderCooldown(
        'bbs',
        {
          retryAt: reservation.retryAt ?? requestNow + COOLDOWN_MS,
          errorCode: reservation.errorCode ?? 'rate_limited',
        },
        requestNow,
      )
    throw Object.assign(createNbaApiError(reservation.errorCode ?? 'rate_limited', 'bbs', true), {
      retryAt: reservation.retryAt,
    })
  }
  const providerBudget = await repository.reserveProviderBudget(
    'bbs',
    requestNow,
    requestHeadroom(env),
  )
  if (!providerBudget.allowed) {
    const retryAt = providerBudget.retryAt ?? requestNow + MINUTE_MS
    const errorCode = providerBudget.errorCode ?? 'rate_limited'
    await repository.setProviderCooldown('bbs', { retryAt, errorCode }, requestNow)
    throw Object.assign(createNbaApiError(errorCode, 'bbs', true), { retryAt })
  }
  const base = (env.BBS_API_BASE_URL ?? 'https://api.bigballsdata.com').replace(/\/$/, '')
  let response: Response
  try {
    previousRequestStartedAt = Date.now()
    response = await fetcher(`${base}${path}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    previousRequestStartedAt = Date.now()
    throw createNbaApiError('timeout', 'bbs', true)
  }
  previousRequestStartedAt = Date.now()
  const responseNow = previousRequestStartedAt
  const dailyRemainingHeader =
    response.headers.get('x-ratelimit-remaining-day') ??
    response.headers.get('x-ratelimit-day-remaining')
  const dailyRemaining = dailyRemainingHeader === null ? NaN : Number(dailyRemainingHeader)
  const remainingHeader = response.headers.get('x-ratelimit-remaining')
  const providerRemaining = remainingHeader === null ? NaN : Number(remainingHeader)
  const threshold = requestHeadroom(env)
  const genericReset = resetTime(response, 'x-ratelimit-reset', responseNow + MINUTE_MS)
  if (Number.isSafeInteger(dailyRemaining) && dailyRemaining <= threshold) {
    const utcDay = new Date(responseNow).toISOString().slice(0, 10)
    const retryAt = resetTime(
      response,
      'x-ratelimit-reset-day',
      Date.parse(`${utcDay}T00:00:00.000Z`) + DAY_MS,
    )
    await repository.recordProviderRemaining('bbs', dailyRemaining, retryAt, responseNow)
    await repository.setProviderCooldown(
      'bbs',
      { retryAt, errorCode: 'quota_exceeded' },
      responseNow,
    )
  } else if (Number.isSafeInteger(providerRemaining) && providerRemaining >= 0) {
    await repository.recordProviderRemaining('bbs', providerRemaining, genericReset, responseNow)
    if (providerRemaining <= threshold) {
      const retryAt = genericReset
      await repository.setProviderCooldown(
        'bbs',
        { retryAt, errorCode: 'rate_limited' },
        responseNow,
      )
    }
  } else if (Number.isSafeInteger(dailyRemaining) && dailyRemaining >= 0) {
    const utcDay = new Date(responseNow).toISOString().slice(0, 10)
    const retryAt = resetTime(
      response,
      'x-ratelimit-reset-day',
      Date.parse(`${utcDay}T00:00:00.000Z`) + DAY_MS,
    )
    await repository.recordProviderRemaining('bbs', dailyRemaining, retryAt, responseNow)
  }
  if (!response.ok) {
    const error = mapHttpStatusToNbaError('bbs', response.status)
    const retryAt =
      response.status === 429
        ? safeRetryAfter(response, responseNow)
        : response.status === 401 || response.status === 403 || response.status >= 500
          ? responseNow + COOLDOWN_MS
          : null
    if (retryAt !== null) {
      const errorCode = error.code === 'unknown' ? 'upstream_unavailable' : error.code
      await repository.setProviderCooldown('bbs', { retryAt, errorCode }, responseNow)
      throw Object.assign(error, { retryAt })
    }
    throw error
  }
  const payload: unknown = await response.json().catch(() => {
    throw createNbaApiError('invalid_response', 'bbs')
  })
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error != null)
    throw createNbaApiError('invalid_response', 'bbs')
  return payload
}

function bbsFailure(cause: unknown) {
  if (cause instanceof NbaAdapterError)
    return { error: cause.details, retryAt: Date.now() + COOLDOWN_MS }
  if (
    !cause ||
    typeof cause !== 'object' ||
    !('code' in cause) ||
    typeof cause.code !== 'string' ||
    !('provider' in cause) ||
    cause.provider !== 'bbs' ||
    !('upstreamStatus' in cause)
  )
    throw cause
  return {
    error: cause as NbaApiError,
    retryAt:
      'retryAt' in cause && typeof cause.retryAt === 'number'
        ? cause.retryAt
        : Date.now() + COOLDOWN_MS,
  }
}

function cacheFailure(
  previous: NbaCacheRecord | null,
  error: NbaApiError,
  now: number,
  retryAt = now + COOLDOWN_MS,
): NbaCacheRecord | null {
  if (!previous) return null
  return { ...previous, refreshError: error, retryAt, expiresAt: Math.min(previous.expiresAt, now) }
}

function matchesPayload(payload: unknown): { root: Record<string, unknown>; matches: unknown[] } {
  const envelope =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null
  const data = envelope && 'data' in envelope ? envelope.data : payload
  if (Array.isArray(data)) {
    const pagination = envelope?.pagination
    if (!pagination || typeof pagination !== 'object' || Array.isArray(pagination))
      throw createNbaApiError('invalid_response', 'bbs')
    const total = Number((pagination as Record<string, unknown>).total)
    if (!Number.isSafeInteger(total) || total < 0 || total !== data.length)
      throw createNbaApiError('invalid_response', 'bbs')
    return { root: { ...(envelope ?? {}), matches: data, pagination }, matches: data }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw createNbaApiError('invalid_response', 'bbs')
  const root = data as Record<string, unknown>
  const matches = Array.isArray(root.matches)
    ? root.matches
    : Array.isArray(root.games)
      ? root.games
      : null
  if (!matches) throw createNbaApiError('invalid_response', 'bbs')
  const pagination = root.pagination ?? envelope?.pagination
  if (!pagination || typeof pagination !== 'object' || Array.isArray(pagination))
    throw createNbaApiError('invalid_response', 'bbs')
  const total = Number((pagination as Record<string, unknown>).total)
  if (!Number.isSafeInteger(total) || total < 0 || total !== matches.length)
    throw createNbaApiError('invalid_response', 'bbs')
  return { root: { ...root, pagination }, matches }
}

async function refreshBox(
  game: Game,
  archiveGameId: string,
  archiveTeamIds: { home: string; away: string },
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
): Promise<{
  state: 'refreshed' | 'up_to_date' | 'deferred' | 'in_progress'
  error: NbaApiError | null
  retryAt: number | null
}> {
  if (game.provider !== 'bbs' || game.status !== 'final')
    return { state: 'deferred', error: createNbaApiError('invalid_request', 'bbs'), retryAt: null }
  const key = gameDetailsCacheKey('bbs', game.id)
  const lockKey = `bbs:box:${game.id}`
  const time = Date.now()
  const previousCache = await repository.getCache(key)
  const previous = previousCache?.capability === 'boxScore' ? previousCache : null
  let preservedBox = previous
  if (
    previous?.data &&
    now < previous.expiresAt &&
    isSameFinalGameSnapshot(previous.data.game, game)
  )
    return { state: 'up_to_date', error: null, retryAt: null }
  if (previous?.retryAt && previous.retryAt > time)
    return { state: 'deferred', error: previous.refreshError, retryAt: previous.retryAt }
  const token = crypto.randomUUID()
  if (!(await repository.tryAcquireLock(lockKey, token, time, time + LOCK_MS)))
    return {
      state: 'in_progress',
      error: createNbaApiError('refresh_in_progress', 'bbs', true),
      retryAt: time + LOCK_MS,
    }
  try {
    const latest = await repository.getCache(key)
    const latestBox = latest?.capability === 'boxScore' ? latest : null
    preservedBox = latestBox
    const latestNow = Date.now()
    if (
      latestBox?.data &&
      latestNow < latestBox.expiresAt &&
      isSameFinalGameSnapshot(latestBox.data.game, game)
    )
      return { state: 'up_to_date', error: null, retryAt: null }
    if (latestBox?.retryAt && latestBox.retryAt > latestNow)
      return { state: 'deferred', error: latestBox.refreshError, retryAt: latestBox.retryAt }
    const teamsPayload = await getBbsJson(
      `/v1/nba/games/${encodeURIComponent(archiveGameId)}`,
      env,
      repository,
      fetcher,
      Date.now(),
      { key: lockKey, token },
    )
    const playersPayload = await getBbsJson(
      `/v1/nba/games/${encodeURIComponent(game.providerId)}/box`,
      env,
      repository,
      fetcher,
      Date.now(),
      { key: lockKey, token },
    )
    const box = normalizeBbsGameBox(
      teamsPayload,
      playersPayload,
      null,
      game,
      archiveGameId,
      archiveTeamIds,
    )
    await lockStillOwned(repository, { key: lockKey, token })
    const fetchedAt = Date.now()
    const record: BoxScoreCacheRecord = {
      cacheKey: key,
      capability: 'boxScore',
      gameId: game.id,
      provider: 'bbs',
      data: box,
      fetchedAt: timestamp(fetchedAt),
      providerUpdatedAt: null,
      rejectedRecords: 0,
      expiresAt: fetchedAt + BOX_TTL_MS,
      staleUntil: fetchedAt + BOX_STALE_MS,
      retryAt: null,
      refreshError: null,
    }
    if (!(await repository.putCacheIfLockOwned(record, lockKey, token, Date.now())))
      return {
        state: 'in_progress',
        error: createNbaApiError('refresh_in_progress', 'bbs', true),
        retryAt: Date.now() + LOCK_MS,
      }
    return { state: 'refreshed', error: null, retryAt: null }
  } catch (cause) {
    const { error, retryAt } = bbsFailure(cause)
    const failedAt = Date.now()
    if (PROVIDER_PAUSE_CODES.has(error.code))
      await repository.setProviderCooldown('bbs', { retryAt, errorCode: error.code }, failedAt)
    const failure: BoxScoreCacheRecord = {
      cacheKey: key,
      capability: 'boxScore',
      gameId: game.id,
      provider: 'bbs',
      data: preservedBox?.data ?? null,
      fetchedAt: preservedBox?.fetchedAt ?? timestamp(failedAt),
      providerUpdatedAt: preservedBox?.providerUpdatedAt ?? null,
      rejectedRecords: preservedBox?.rejectedRecords ?? 0,
      expiresAt: Math.min(preservedBox?.expiresAt ?? failedAt, failedAt),
      staleUntil: Math.max(preservedBox?.staleUntil ?? 0, failedAt + BOX_STALE_MS),
      retryAt,
      refreshError: error,
    }
    if (
      error.code !== 'refresh_in_progress' &&
      !(await repository.putCacheIfLockOwned(failure, lockKey, token, failedAt))
    )
      return {
        state: 'in_progress',
        error: createNbaApiError('refresh_in_progress', 'bbs', true),
        retryAt: failedAt + LOCK_MS,
      }
    return { state: 'deferred', error, retryAt }
  } finally {
    try {
      await repository.releaseLock(lockKey, token)
    } catch {
      /* Lease expires safely. */
    }
  }
}

const PROVIDER_PAUSE_CODES = new Set<NbaApiError['code']>([
  'authentication',
  'forbidden',
  'rate_limited',
  'quota_exceeded',
  'upstream_unavailable',
  'timeout',
])

async function saveBoxFailure(
  game: Game,
  repository: NbaRepository,
  error: NbaApiError,
  retryAt: number,
): Promise<void> {
  const cacheKey = gameDetailsCacheKey('bbs', game.id)
  const lockKey = `bbs:box:${game.id}`
  const now = Date.now()
  const token = crypto.randomUUID()
  if (!(await repository.tryAcquireLock(lockKey, token, now, now + LOCK_MS))) return
  try {
    const current = await repository.getCache(cacheKey)
    const previous = current?.capability === 'boxScore' ? current : null
    if (
      previous?.data &&
      Date.now() < previous.expiresAt &&
      isSameFinalGameSnapshot(previous.data.game, game)
    )
      return
    const failure: BoxScoreCacheRecord = {
      cacheKey,
      capability: 'boxScore',
      gameId: game.id,
      provider: 'bbs',
      data: previous?.data ?? null,
      fetchedAt: previous?.fetchedAt ?? timestamp(now),
      providerUpdatedAt: previous?.providerUpdatedAt ?? null,
      rejectedRecords: previous?.rejectedRecords ?? 0,
      expiresAt: Math.min(previous?.expiresAt ?? now, now),
      staleUntil: Math.max(previous?.staleUntil ?? 0, now + BOX_STALE_MS),
      retryAt: Math.max(previous?.retryAt ?? 0, retryAt),
      refreshError: error,
    }
    await repository.putCacheIfLockOwned(failure, lockKey, token, Date.now())
  } finally {
    await repository.releaseLock(lockKey, token)
  }
}

async function refreshCachedBoxes(
  games: readonly Game[],
  providerReferences: Readonly<Record<string, string>> | undefined,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
): Promise<{
  error: NbaApiError | null
  retryAt: number | null
  refreshed: boolean
  missingReferences: number
}> {
  let firstError: NbaApiError | null = null
  let retryAt: number | null = null
  let refreshed = false
  let missingReferences = 0
  const finals = games.filter((game) => game.provider === 'bbs' && game.status === 'final')
  for (let index = 0; index < finals.length; index += 1) {
    const game = finals[index]!
    const archiveId = providerReferences?.[game.id]
    const archiveHomeTeamId = providerReferences?.[archiveTeamReferenceKey(game.id, 'home')]
    const archiveAwayTeamId = providerReferences?.[archiveTeamReferenceKey(game.id, 'away')]
    if (!archiveId || !archiveHomeTeamId || !archiveAwayTeamId) {
      missingReferences += 1
      continue
    }
    const result = await refreshBox(
      game,
      archiveId,
      { home: archiveHomeTeamId, away: archiveAwayTeamId },
      env,
      repository,
      fetcher,
      Math.max(now, Date.now()),
    )
    if (result.state === 'refreshed') refreshed = true
    if (result.error) {
      firstError ??= result.error
      retryAt ??= result.retryAt
      if (PROVIDER_PAUSE_CODES.has(result.error.code)) {
        for (const pending of finals.slice(index + 1))
          await saveBoxFailure(
            pending,
            repository,
            result.error,
            result.retryAt ?? Date.now() + COOLDOWN_MS,
          )
        break
      }
    }
  }
  return { error: firstError, retryAt, refreshed, missingReferences }
}

export async function refreshBbsGames(
  target: Extract<NbaRefreshTarget, { type: 'games' }>,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
  refreshBoxes = true,
  force = false,
): Promise<BbsRefreshOutcome> {
  const key = gamesCacheKey('bbs', target.date)
  const previous = await repository.getCache(key)
  if (previous?.retryAt && previous.retryAt > now)
    return outcome(target, 'deferred', previous, now, previous.refreshError, previous.retryAt)
  if (!force && previous && Date.now() < previous.expiresAt) {
    if (refreshBoxes && env.BBS_REFRESH_ENABLED === 'true' && previous.capability === 'games') {
      const boxes = await refreshCachedBoxes(
        previous.data,
        previous.providerReferences,
        env,
        repository,
        fetcher,
        now,
      )
      if (boxes.error)
        return outcome(target, 'deferred', previous, Date.now(), boxes.error, boxes.retryAt, {
          phase: 'box_score',
        })
      return outcome(
        target,
        boxes.refreshed ? 'refreshed' : 'up_to_date',
        previous,
        Date.now(),
        null,
        null,
        boxes.missingReferences > 0
          ? {
              phase: 'box_score_archive_references',
              ...archiveReferenceSummary(previous.data, previous.providerReferences),
            }
          : undefined,
      )
    }
    return outcome(target, 'up_to_date', previous, Date.now())
  }
  if (env.BBS_REFRESH_ENABLED !== 'true' || !env.BBS_API_KEY) {
    const error = createNbaApiError('not_configured', 'bbs')
    return outcome(target, 'deferred', previous, now, error)
  }
  const token = crypto.randomUUID()
  const lockKey = `bbs:games:${target.date}`
  const lockStartedAt = Date.now()
  if (!(await repository.tryAcquireLock(lockKey, token, lockStartedAt, lockStartedAt + LOCK_MS))) {
    return outcome(target, 'in_progress', previous, now, null, now + LOCK_MS)
  }
  let record: Extract<NbaCacheRecord, { capability: 'games' }> | null = null
  let listRefreshed = false
  let refreshError: NbaApiError | null = null
  let refreshRetryAt: number | null = null
  let diagnosticPhase: ScheduledBbsDiagnosticPhase = 'games_pagination'
  let diagnosticCounts: Omit<ScheduledBbsTaskDiagnostic, 'observedAt' | 'errorCode' | 'phase'> = {}
  try {
    const latest = await repository.getCache(key)
    const latestGames = latest?.capability === 'games' ? latest : null
    if (!force && latest && Date.now() < latest.expiresAt) {
      if (latestGames) record = latestGames
      else throw createNbaApiError('invalid_response', 'bbs')
    } else {
      diagnosticPhase = 'provider_fetch'
      const path = `/v1/matches?league=nba&date=${encodeURIComponent(target.date)}&tz=America%2FNew_York&limit=100`
      const payload = await getBbsJson(path, env, repository, fetcher, Date.now(), {
        key: lockKey,
        token,
      })
      diagnosticPhase = 'games_pagination'
      const { root, matches } = matchesPayload(payload)
      const fetchedAt = Date.now()
      diagnosticPhase = 'games_normalization'
      const snapshot = normalizeBbsGames(
        { data: { ...root, matches } },
        { fetchedAt: timestamp(fetchedAt), stale: false },
      )
      diagnosticCounts = {
        expectedCount: matches.length,
        actualCount: snapshot.data.length,
        rejectedRecords: snapshot.meta.rejectedRecords,
      }
      if (snapshot.meta.rejectedRecords > 0) throw createNbaApiError('invalid_response', 'bbs')
      diagnosticPhase = 'games_date_validation'
      const data = snapshot.data.filter((game) => game.nbaGameDate === target.date)
      if (data.length !== snapshot.data.length) {
        diagnosticCounts = { expectedCount: snapshot.data.length, actualCount: data.length }
        throw createNbaApiError('invalid_response', 'bbs')
      }
      diagnosticPhase = 'games_archive_references'
      const providerReferences: Record<string, string> = {}
      for (const raw of matches) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
        const rawRecord = raw as Record<string, unknown>
        const rawId = readBbsReference(rawRecord.id ?? rawRecord.match_id ?? rawRecord.match_uuid)
        const archiveId = readBbsReference(rawRecord.archive_game_id)
        if (rawId) {
          const normalizedGameId = `bbs:game:${rawId}`
          if (archiveId) providerReferences[normalizedGameId] = archiveId
          for (const side of ['home', 'away'] as const) {
            const sideValue = rawRecord[side]
            if (!sideValue || typeof sideValue !== 'object' || Array.isArray(sideValue)) continue
            const archiveTeamId = readBbsReference(
              (sideValue as Record<string, unknown>).archive_team_id,
            )
            if (archiveTeamId)
              providerReferences[archiveTeamReferenceKey(normalizedGameId, side)] = archiveTeamId
          }
        }
      }
      const previousGames = previous?.capability === 'games' ? previous : null
      const previousById = new Map(previousGames?.data.map((game) => [game.id, game]) ?? [])
      const incomingById = new Map(data.map((game) => [game.id, game]))
      const missingPriorFinals =
        previousGames?.data.filter(
          (game) => game.status === 'final' && !incomingById.has(game.id),
        ) ?? []
      if (missingPriorFinals.length > 0) {
        const previousFinalCount =
          previousGames?.data.filter((game) => game.status === 'final').length ?? 0
        diagnosticCounts = {
          expectedCount: previousFinalCount,
          actualCount: previousFinalCount - missingPriorFinals.length,
        }
        throw createNbaApiError('invalid_response', 'bbs')
      }
      const coherentData = data.map((game) => {
        const previousGame = previousById.get(game.id)
        if (previousGame && !sameGameTeams(previousGame, game)) {
          diagnosticPhase = 'games_normalization'
          diagnosticCounts = { expectedCount: data.length, actualCount: data.length - 1 }
          throw createNbaApiError('invalid_response', 'bbs')
        }
        if (
          previousGame?.status === 'final' &&
          (game.status !== 'final' || !hasCompleteFinalScore(game))
        ) {
          diagnosticPhase = 'games_normalization'
          diagnosticCounts = { expectedCount: data.length, actualCount: data.length - 1 }
          throw createNbaApiError('invalid_response', 'bbs')
        }
        if (!hasCompleteFinalScore(game)) {
          diagnosticPhase = 'games_normalization'
          diagnosticCounts = { expectedCount: data.length, actualCount: data.length - 1 }
          throw createNbaApiError('invalid_response', 'bbs')
        }
        return game
      })
      diagnosticPhase = 'games_archive_references'
      for (const game of coherentData) {
        const previousGame = previousById.get(game.id)
        if (!previousGame || !sameGameTeams(previousGame, game)) continue
        for (const key of [
          game.id,
          archiveTeamReferenceKey(game.id, 'home'),
          archiveTeamReferenceKey(game.id, 'away'),
        ]) {
          const incomingReference = providerReferences[key]
          const verifiedReference = previousGames?.providerReferences?.[key]
          if (incomingReference && verifiedReference && incomingReference !== verifiedReference)
            throw createNbaApiError('invalid_response', 'bbs')
          if (!incomingReference && verifiedReference) providerReferences[key] = verifiedReference
        }
      }
      const missingArchiveReferences = gamesMissingArchiveReferences(
        coherentData,
        providerReferences,
      )
      const referenceSummary = archiveReferenceSummary(coherentData, providerReferences)
      diagnosticCounts = {
        ...referenceSummary,
      }
      const freshRecord: Extract<NbaCacheRecord, { capability: 'games' }> = {
        cacheKey: key,
        capability: 'games',
        provider: 'bbs',
        data: coherentData,
        providerReferences,
        fetchedAt: snapshot.meta.fetchedAt,
        providerUpdatedAt: snapshot.meta.providerUpdatedAt,
        rejectedRecords: snapshot.meta.rejectedRecords,
        expiresAt: fetchedAt + GAME_TTL_MS,
        staleUntil: fetchedAt + GAME_STALE_MS,
        retryAt: null,
        refreshError: null,
      }
      diagnosticPhase = 'games_cache_write'
      if (!(await repository.putCacheIfLockOwned(freshRecord, lockKey, token, Date.now())))
        throw Object.assign(createNbaApiError('refresh_in_progress', 'bbs', true), {
          retryAt: Date.now() + LOCK_MS,
        })
      record = freshRecord
      listRefreshed = true
      if (missingArchiveReferences.length > 0) diagnosticPhase = 'games_archive_references'
    }
  } catch (cause) {
    const { error, retryAt } = bbsFailure(cause)
    refreshError = error
    refreshRetryAt = retryAt
    const failed =
      error.code === 'refresh_in_progress'
        ? null
        : cacheFailure(previous, error, Date.now(), retryAt)
    if (failed && !(await repository.putCacheIfLockOwned(failed, lockKey, token, Date.now())))
      return outcome(target, 'in_progress', previous, now, null, now + LOCK_MS)
  } finally {
    try {
      await repository.releaseLock(lockKey, token)
    } catch {
      /* Lease expires safely. */
    }
  }
  if (refreshError)
    return outcome(target, 'deferred', previous, Date.now(), refreshError, refreshRetryAt, {
      phase: diagnosticPhase,
      ...diagnosticCounts,
    })
  if (!record)
    return outcome(
      target,
      'deferred',
      previous,
      Date.now(),
      createNbaApiError('invalid_response', 'bbs'),
    )
  const boxes = refreshBoxes
    ? await refreshCachedBoxes(
        record.data,
        record.providerReferences,
        env,
        repository,
        fetcher,
        Date.now(),
      )
    : { error: null, retryAt: null, refreshed: false, missingReferences: 0 }
  if (boxes.error)
    return outcome(target, 'deferred', record, Date.now(), boxes.error, boxes.retryAt, {
      phase: 'box_score',
    })
  const missingReferences = Math.max(
    boxes.missingReferences,
    gamesMissingArchiveReferences(record.data, record.providerReferences).length,
  )
  return outcome(
    target,
    listRefreshed || boxes.refreshed ? 'refreshed' : 'up_to_date',
    record,
    Date.now(),
    null,
    null,
    missingReferences > 0
      ? {
          phase: 'games_archive_references',
          ...archiveReferenceSummary(record.data, record.providerReferences),
        }
      : undefined,
  )
}

export async function refreshBbsGameBoxScore(
  target: BbsBoxTarget,
  game: Game,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
): Promise<BoxScoreRefreshOutcome> {
  const cacheKey = gameDetailsCacheKey('bbs', game.id)
  const current = await repository.getCache(cacheKey)
  const record = current?.capability === 'boxScore' ? current : null
  const result = (
    state: BoxScoreRefreshOutcome['state'],
    error: NbaApiError | null,
    retryAt: number | null = record?.retryAt ?? null,
  ): BoxScoreRefreshOutcome => ({
    target,
    state,
    isStale: !record || now >= record.expiresAt,
    fetchedAt: record?.fetchedAt ?? null,
    retryAfter: retryAt === null ? null : timestamp(retryAt),
    error,
  })
  if (
    game.id !== target.gameId ||
    game.nbaGameDate !== target.date ||
    game.provider !== 'bbs' ||
    game.status !== 'final'
  ) {
    return result('deferred', createNbaApiError('invalid_request', 'bbs'))
  }
  if (record?.data && now < record.expiresAt && isSameFinalGameSnapshot(record.data.game, game))
    return result('up_to_date', null, null)
  if (record?.retryAt && record.retryAt > now)
    return result('deferred', record.refreshError, record.retryAt)
  try {
    const games = await repository.getCache(gamesCacheKey('bbs', game.nbaGameDate))
    const archiveId =
      games?.capability === 'games' ? games.providerReferences?.[game.id] : undefined
    if (!archiveId) throw createNbaApiError('cache_miss', 'bbs', true)
    const archiveHomeTeamId =
      games?.capability === 'games'
        ? games.providerReferences?.[archiveTeamReferenceKey(game.id, 'home')]
        : undefined
    const archiveAwayTeamId =
      games?.capability === 'games'
        ? games.providerReferences?.[archiveTeamReferenceKey(game.id, 'away')]
        : undefined
    if (!archiveHomeTeamId || !archiveAwayTeamId) throw createNbaApiError('cache_miss', 'bbs', true)
    const boxResult = await refreshBox(
      game,
      archiveId,
      { home: archiveHomeTeamId, away: archiveAwayTeamId },
      env,
      repository,
      fetcher,
      Date.now(),
    )
    const latest = await repository.getCache(cacheKey)
    const latestBox = latest?.capability === 'boxScore' ? latest : null
    return {
      target,
      state: boxResult.state,
      isStale: !latestBox?.data || Date.now() >= latestBox.expiresAt,
      fetchedAt: latestBox?.fetchedAt ?? null,
      retryAfter: boxResult.retryAt === null ? null : timestamp(boxResult.retryAt),
      error: boxResult.error ?? latestBox?.refreshError ?? null,
    }
  } catch (cause) {
    const { error, retryAt } = bbsFailure(cause)
    return result('deferred', error, retryAt)
  }
}

function makeStandingsRecord(
  payload: unknown,
  seasonEndYear: SeasonEndYear,
  references: readonly TeamProviderReference[],
  fetchedAt: number,
): StandingsCacheRecord {
  return {
    cacheKey: standingsCacheKey('bbs', seasonEndYear),
    capability: 'standings',
    provider: 'bbs',
    data: normalizeBbsStandings(payload, seasonEndYear, references),
    fetchedAt: timestamp(fetchedAt),
    providerUpdatedAt: null,
    rejectedRecords: 0,
    expiresAt: fetchedAt + STANDINGS_TTL_MS,
    staleUntil: fetchedAt + STANDINGS_STALE_MS,
    retryAt: null,
    refreshError: null,
  }
}

export async function refreshBbsStandings(
  seasonEndYear: SeasonEndYear,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
): Promise<BbsRefreshOutcome> {
  const target: NbaRefreshTarget = { type: 'standings', seasonEndYear }
  const cacheKey = standingsCacheKey('bbs', seasonEndYear)
  const cached = await repository.getCache(cacheKey)
  const previous = cached?.capability === 'standings' ? cached : null
  if (previous && now < previous.expiresAt)
    return outcome(target, 'up_to_date', previous, now, null, null)
  if (previous?.retryAt && previous.retryAt > now)
    return outcome(target, 'deferred', previous, now, previous.refreshError, previous.retryAt)
  if (env.BBS_REFRESH_ENABLED !== 'true' || !env.BBS_API_KEY)
    return outcome(target, 'deferred', previous, now, createNbaApiError('not_configured', 'bbs'))

  const directory = await repository.getCache(teamDirectoryCacheKey('bbs', seasonEndYear))
  if (
    directory?.capability !== 'teamDirectory' ||
    directory.seasonEndYear !== seasonEndYear ||
    directory.expiresAt <= now
  )
    return outcome(target, 'deferred', previous, now, createNbaApiError('cache_miss', 'bbs', true))

  const lockKey = `bbs:standings:season=${seasonEndYear}`
  const token = crypto.randomUUID()
  if (!(await repository.tryAcquireLock(lockKey, token, now, now + LOCK_MS)))
    return outcome(target, 'in_progress', previous, now, null, now + LOCK_MS)
  try {
    const startYear = Number(seasonEndYear) - 1
    const payload = await getBbsJson(
      `/v1/standings?league=nba&season=${startYear}`,
      env,
      repository,
      fetcher,
      now,
      { key: lockKey, token },
    )
    const fetchedAt = Date.now()
    const record = makeStandingsRecord(payload, seasonEndYear, directory.data, fetchedAt)
    if (!(await repository.putCacheIfLockOwned(record, lockKey, token, Date.now())))
      throw Object.assign(createNbaApiError('refresh_in_progress', 'bbs', true), {
        retryAt: Date.now() + LOCK_MS,
      })
    return outcome(target, 'refreshed', record, fetchedAt, null, null)
  } catch (cause) {
    const { error, retryAt } = bbsFailure(cause)
    const failed =
      error.code === 'refresh_in_progress'
        ? null
        : cacheFailure(previous, error, Date.now(), retryAt)
    if (failed && !(await repository.putCacheIfLockOwned(failed, lockKey, token, Date.now())))
      return outcome(target, 'in_progress', previous, now, null, now + LOCK_MS)
    return outcome(target, 'deferred', failed ?? previous, now, error, retryAt)
  } finally {
    try {
      await repository.releaseLock(lockKey, token)
    } catch {
      // The lease expires safely.
    }
  }
}

async function publishBootstrapStandings(
  payload: unknown,
  directory: TeamDirectoryCacheRecord,
  repository: NbaRepository,
  fetchedAt: number,
): Promise<void> {
  let record: StandingsCacheRecord
  try {
    record = makeStandingsRecord(payload, directory.seasonEndYear, directory.data, fetchedAt)
  } catch (error) {
    // Team identity can be valid even if the standings records cannot be published.
    if (error instanceof NbaAdapterError) return
    throw error
  }
  const lockKey = `bbs:standings:season=${directory.seasonEndYear}`
  const token = crypto.randomUUID()
  const now = Date.now()
  if (!(await repository.tryAcquireLock(lockKey, token, now, now + LOCK_MS))) return
  try {
    const latest = await repository.getCache(record.cacheKey)
    if (latest && Date.parse(latest.fetchedAt) >= fetchedAt) return
    await repository.putCacheIfLockOwned(record, lockKey, token, Date.now())
  } finally {
    try {
      await repository.releaseLock(lockKey, token)
    } catch {
      /* The lease expires safely. */
    }
  }
}

/** Refresh the one standings-to-directory crosswalk used by later per-team jobs. */
export async function refreshBbsTeamDirectory(
  target: BbsTeamDirectoryTarget,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
  bootstrapStandings = false,
): Promise<BbsRefreshOutcome> {
  const cacheKey = teamDirectoryCacheKey('bbs', target.seasonEndYear)
  const previousCache = await repository.getCache(cacheKey)
  let previous =
    previousCache?.capability === 'teamDirectory' &&
    previousCache.seasonEndYear === target.seasonEndYear
      ? previousCache
      : null
  const result = (
    state: BbsRefreshOutcome['state'],
    error: NbaApiError | null,
    record: TeamDirectoryCacheRecord | null = previous,
    retryAt: number | null = record?.retryAt ?? null,
  ) => outcome(target, state, record, Date.now(), error, retryAt)

  if (previous && now >= previous.staleUntil) {
    await repository.deleteCache(cacheKey)
    previous = null
  }
  if (previous && now < previous.expiresAt) return result('up_to_date', null, previous, null)
  if (previous?.retryAt && previous.retryAt > now)
    return result('deferred', previous.refreshError, previous, previous.retryAt)
  if (env.BBS_REFRESH_ENABLED !== 'true' || !env.BBS_API_KEY)
    return result('deferred', createNbaApiError('not_configured', 'bbs'))

  const lockKey = `bbs:team-directory:season=${target.seasonEndYear}`
  const token = crypto.randomUUID()
  if (!(await repository.tryAcquireLock(lockKey, token, now, now + LOCK_MS)))
    return result(
      'in_progress',
      Object.assign(createNbaApiError('refresh_in_progress', 'bbs', true), {
        retryAt: now + LOCK_MS,
      }),
    )

  try {
    const startYear = Number(target.seasonEndYear) - 1
    const standingsCache = await repository.getCache(standingsCacheKey('bbs', target.seasonEndYear))
    const priorReferences = new Map(
      previous?.data.map((reference) => [reference.teamId, reference]),
    )
    const hasCachedStandings =
      standingsCache?.capability === 'standings' &&
      standingsCache.staleUntil > now &&
      standingsCache.data.length === NBA_TEAMS.length &&
      standingsCache.data.every((row) => {
        const reference = priorReferences.get(row.team.id)
        return (
          row.seasonEndYear === target.seasonEndYear &&
          reference &&
          (reference.standingsTeamId ?? reference.providerTeamId) === row.team.providerId
        )
      })
    const standings = hasCachedStandings
      ? {
          season: String(startYear),
          standings: [
            {
              rows: standingsCache.data.map((row) => ({
                team_id: row.team.providerId,
                team_uuid: priorReferences.get(row.team.id)?.providerTeamId,
                abbreviation: row.team.abbreviation,
              })),
            },
          ],
        }
      : await getBbsJson(
          `/v1/standings?league=nba&season=${startYear}`,
          env,
          repository,
          fetcher,
          now,
          { key: lockKey, token },
        )
    const standingsFetchedAt = Date.now()
    const directory = await getBbsJson(
      '/v1/teams?sport=basketball&league=nba&limit=100',
      env,
      repository,
      fetcher,
      now,
      { key: lockKey, token },
    )
    const references = normalizeBbsTeamDirectory(standings, directory, target.seasonEndYear)
    const receivedAt = Date.now()
    const fresh: TeamDirectoryCacheRecord = {
      cacheKey,
      capability: 'teamDirectory',
      provider: 'bbs',
      seasonEndYear: target.seasonEndYear,
      data: references,
      fetchedAt: timestamp(receivedAt),
      providerUpdatedAt: null,
      rejectedRecords: 0,
      expiresAt: receivedAt + TEAM_DIRECTORY_TTL_MS,
      staleUntil: receivedAt + TEAM_DIRECTORY_STALE_MS,
      retryAt: null,
      refreshError: null,
    }
    if (!(await repository.putCacheIfLockOwned(fresh, lockKey, token, Date.now())))
      throw Object.assign(createNbaApiError('refresh_in_progress', 'bbs', true), {
        retryAt: Date.now() + LOCK_MS,
      })
    if (bootstrapStandings && !hasCachedStandings)
      await publishBootstrapStandings(standings, fresh, repository, standingsFetchedAt)
    return result('refreshed', null, fresh, null)
  } catch (cause) {
    const { error, retryAt } = bbsFailure(cause)
    const failed =
      error.code === 'refresh_in_progress'
        ? null
        : cacheFailure(previous, error, Date.now(), retryAt)
    if (failed && !(await repository.putCacheIfLockOwned(failed, lockKey, token, Date.now())))
      return result(
        'in_progress',
        createNbaApiError('refresh_in_progress', 'bbs', true),
        previous,
        now + LOCK_MS,
      )
    return result(
      'deferred',
      error,
      failed?.capability === 'teamDirectory' ? failed : previous,
      retryAt,
    )
  } finally {
    try {
      await repository.releaseLock(lockKey, token)
    } catch {
      /* The lease expires safely. */
    }
  }
}

/** Refresh exactly one previously cross-walked team-season snapshot. */
export async function refreshBbsTeamSeason(
  target: BbsTeamSeasonTarget,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
): Promise<BbsRefreshOutcome> {
  const reference = findNbaTeam(target.teamCode)
  if (!reference)
    return outcome(target, 'deferred', null, now, createNbaApiError('invalid_request', 'bbs'))
  const cacheKey = teamSeasonCacheKey('bbs', reference.team.id, target.seasonEndYear)
  const previousCache = await repository.getCache(cacheKey)
  let previous = previousCache?.capability === 'teamSeason' ? previousCache : null
  const directoryCache = await repository.getCache(
    teamDirectoryCacheKey('bbs', target.seasonEndYear),
  )
  const directory = directoryCache?.capability === 'teamDirectory' ? directoryCache : null
  const providerReference =
    directory?.data.find((entry) => entry.teamId === reference.team.id) ?? null
  const result = (
    state: BbsRefreshOutcome['state'],
    error: NbaApiError | null,
    record: TeamSeasonCacheRecord | null = previous,
    retryAt: number | null = record?.retryAt ?? null,
  ) => outcome(target, state, record, Date.now(), error, retryAt)

  if (previous && now >= previous.staleUntil) {
    await repository.deleteCache(cacheKey)
    previous = null
  }
  if (previous && now < previous.expiresAt) return result('up_to_date', null, previous, null)
  if (previous?.retryAt && previous.retryAt > now)
    return result('deferred', previous.refreshError, previous, previous.retryAt)
  if (env.BBS_REFRESH_ENABLED !== 'true' || !env.BBS_API_KEY)
    return result('deferred', createNbaApiError('not_configured', 'bbs'))
  if (
    !providerReference ||
    directory!.seasonEndYear !== target.seasonEndYear ||
    directory!.staleUntil <= now
  )
    return result('deferred', createNbaApiError('cache_miss', 'bbs', true))

  const lockKey = `bbs:team-season:season=${target.seasonEndYear}:team=${reference.code}`
  const token = crypto.randomUUID()
  if (!(await repository.tryAcquireLock(lockKey, token, now, now + LOCK_MS)))
    return result(
      'in_progress',
      Object.assign(createNbaApiError('refresh_in_progress', 'bbs', true), {
        retryAt: now + LOCK_MS,
      }),
    )

  try {
    const startYear = Number(target.seasonEndYear) - 1
    const payload = await getBbsJson(
      `/v1/teams/${encodeURIComponent(providerReference.providerTeamId)}/season?season=${startYear}`,
      env,
      repository,
      fetcher,
      now,
      { key: lockKey, token },
    )
    const receivedAt = Date.now()
    const normalized = normalizeBbsTeamSeason(payload, reference, target.seasonEndYear)
    if (normalized.providerTeamId !== providerReference.providerTeamId)
      throw createNbaApiError('invalid_response', 'bbs')
    const refreshed: TeamSeasonCacheRecord = {
      cacheKey,
      capability: 'teamSeason',
      provider: 'bbs',
      teamId: reference.team.id,
      seasonEndYear: target.seasonEndYear,
      providerTeamId: providerReference.providerTeamId,
      data: normalized.data,
      fetchedAt: timestamp(receivedAt),
      providerUpdatedAt: normalized.providerUpdatedAt,
      rejectedRecords: normalized.rejectedRecords,
      expiresAt: receivedAt + TEAM_SEASON_TTL_MS,
      staleUntil: receivedAt + TEAM_SEASON_STALE_MS,
      retryAt: null,
      refreshError: null,
    }
    if (!(await repository.putCacheIfLockOwned(refreshed, lockKey, token, Date.now())))
      throw Object.assign(createNbaApiError('refresh_in_progress', 'bbs', true), {
        retryAt: Date.now() + LOCK_MS,
      })
    return result('refreshed', null, refreshed, null)
  } catch (cause) {
    const { error, retryAt } = bbsFailure(cause)
    const failed =
      error.code === 'refresh_in_progress'
        ? null
        : cacheFailure(previous, error, Date.now(), retryAt)
    if (failed && !(await repository.putCacheIfLockOwned(failed, lockKey, token, Date.now())))
      return result(
        'in_progress',
        createNbaApiError('refresh_in_progress', 'bbs', true),
        previous,
        now + LOCK_MS,
      )
    return result(
      'deferred',
      error,
      failed?.capability === 'teamSeason' ? failed : previous,
      retryAt,
    )
  } finally {
    try {
      await repository.releaseLock(lockKey, token)
    } catch {
      /* The lease expires safely. */
    }
  }
}

export function parseBbsBoxTarget(value: unknown): BbsBoxTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const target = value as Record<string, unknown>
  const date = parseNbaGameDate(target.date)
  return target.type === 'boxScore' &&
    date &&
    typeof target.gameId === 'string' &&
    target.gameId.startsWith('bbs:game:')
    ? { type: 'boxScore', date, gameId: target.gameId as GameId }
    : null
}

function scheduledBbsTasksForDate(today: NbaGameDate): ScheduledBbsTask[] {
  const start = new Date(`${today}T12:00:00.000Z`)
  const seasonEndYear = parseSeasonEndYear(
    Number(today.slice(0, 4)) + (Number(today.slice(5, 7)) >= 8 ? 1 : 0),
  )
  if (!seasonEndYear) return []
  const tasks: ScheduledBbsTask[] = [
    { type: 'standings', seasonEndYear },
    { type: 'teamDirectory', seasonEndYear },
  ]
  const previousDate = parseNbaGameDate(
    new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() - 1))
      .toISOString()
      .slice(0, 10),
  )
  if (previousDate) tasks.push({ type: 'games', date: previousDate })
  if (previousDate) tasks.push({ type: 'lateGames', date: previousDate })
  for (let offset = -7; offset <= 7; offset += 1) {
    const date = parseNbaGameDate(
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + offset))
        .toISOString()
        .slice(0, 10),
    )
    if (date && date !== previousDate) tasks.push({ type: 'games', date })
  }
  for (const team of NBA_TEAMS)
    tasks.push({ type: 'teamSeason', teamCode: team.code, seasonEndYear })
  tasks.push({ type: 'enrichStandings', seasonEndYear })
  return tasks
}

function dateAtOffset(date: NbaGameDate, offset: number): NbaGameDate | null {
  const start = new Date(`${date}T12:00:00.000Z`)
  return parseNbaGameDate(
    new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + offset))
      .toISOString()
      .slice(0, 10),
  )
}

function taskWithinRolloverHorizon(task: ScheduledBbsTask, today: NbaGameDate): boolean {
  const seasonEndYear = parseSeasonEndYear(
    Number(today.slice(0, 4)) + (Number(today.slice(5, 7)) >= 8 ? 1 : 0),
  )
  if (!seasonEndYear) return false
  if ('seasonEndYear' in task) return task.seasonEndYear === seasonEndYear
  const lowerBound = dateAtOffset(today, -7)
  const upperBound = dateAtOffset(today, task.type === 'boxScore' ? 0 : 7)
  return !!lowerBound && !!upperBound && task.date >= lowerBound && task.date <= upperBound
}

const QUEUE_LOCK_KEY = 'bbs:scheduled-queue'
const QUEUE_LOCK_MS = 90_000
const LOCAL_RETRY_MS = 15 * MINUTE_MS
const MAX_LOCAL_RETRY_MS = 6 * 60 * MINUTE_MS
function workItem(task: ScheduledBbsTask, retryAt: number | null = null) {
  return { task, attempts: 0, retryAt }
}

function scheduledTaskPhase(task: ScheduledBbsTask): ScheduledBbsDiagnosticPhase {
  if (task.type === 'games' || task.type === 'lateGames') return 'provider_fetch'
  if (task.type === 'boxScore') return 'box_score'
  if (task.type === 'enrichStandings') return 'standings_enrichment'
  if (task.type === 'teamDirectory') return 'team_directory'
  if (task.type === 'teamSeason') return 'team_season'
  return task.type
}

function taskDiagnostic(
  result: BbsRefreshOutcome,
  task: ScheduledBbsTask,
  now: number,
): ScheduledBbsTaskDiagnostic {
  return {
    phase: result.diagnostic?.phase ?? scheduledTaskPhase(task),
    errorCode: result.error?.code ?? null,
    observedAt: now,
    ...(result.diagnostic?.expectedCount === undefined
      ? {}
      : { expectedCount: result.diagnostic.expectedCount }),
    ...(result.diagnostic?.actualCount === undefined
      ? {}
      : { actualCount: result.diagnostic.actualCount }),
    ...(result.diagnostic?.rejectedRecords === undefined
      ? {}
      : { rejectedRecords: result.diagnostic.rejectedRecords }),
  }
}

function setScheduledFailure(
  failures: readonly ScheduledBbsFailure[] | undefined,
  failure: ScheduledBbsFailure,
) {
  const key = scheduledBbsTaskKey(failure.task)
  return [
    ...(failures ?? []).filter((entry) => scheduledBbsTaskKey(entry.task) !== key),
    failure,
  ].slice(-SCHEDULED_BBS_TASK_LIMIT)
}

function firstDueTask(progress: ScheduledBbsProgress, now: number): number {
  if (progress.pauseUntil && progress.pauseUntil > now) return -1
  return progress.tasks.findIndex((item) => item.retryAt === null || item.retryAt <= now)
}

function mergePendingTasks(
  priority: ScheduledBbsProgress['tasks'],
  pending: ScheduledBbsProgress['tasks'],
) {
  const pendingByKey = new Map(pending.map((item) => [scheduledBbsTaskKey(item.task), item]))
  const merged = priority.map((item) => {
    const key = scheduledBbsTaskKey(item.task)
    const previous = pendingByKey.get(key)
    if (previous) pendingByKey.delete(key)
    return previous ?? item
  })
  for (const item of pendingByKey.values()) {
    merged.push(item)
  }
  if (merged.length > SCHEDULED_BBS_TASK_LIMIT) throw new Error('BBS refresh queue exceeds limit')
  return merged
}

export async function runScheduledBbsRefresh(
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
): Promise<BbsRefreshOutcome[]> {
  if (env.BBS_REFRESH_ENABLED !== 'true' || !env.BBS_API_KEY) return []
  const today = parseNbaGameDate(getDateKeyInTimeZone(new Date(now), NBA_TIME_ZONE))
  if (!today) return []
  const etClock = new Intl.DateTimeFormat('en-GB', {
    timeZone: NBA_TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(now))
  const currentHour = Number(etClock)
  const token = crypto.randomUUID()
  if (!(await repository.tryAcquireLock(QUEUE_LOCK_KEY, token, now, now + QUEUE_LOCK_MS))) return []
  const saveOwnedProgress = async (progress: ScheduledBbsProgress) => {
    const currentTime = Date.now()
    if (
      !(await repository.renewLock(QUEUE_LOCK_KEY, token, currentTime, currentTime + QUEUE_LOCK_MS))
    )
      return false
    return repository.putScheduledBbsProgressIfLockOwned(
      progress,
      QUEUE_LOCK_KEY,
      token,
      currentTime,
    )
  }
  try {
    let progress = await repository.getScheduledBbsProgress()
    if (
      currentHour < 10 &&
      (!progress || (progress.cycleDate !== today && progress.tasks.length === 0))
    )
      return []
    if (!progress) {
      const daily = scheduledBbsTasksForDate(today)
      if (!daily.length) return []
      progress = {
        cycleDate: today,
        tasks: daily.map((task) =>
          task.type === 'lateGames' ? workItem(task, now + 2 * 60 * MINUTE_MS) : workItem(task),
        ),
        cursor: 0,
        pauseUntil: null,
      }
    } else if (progress.cycleDate !== today && currentHour >= 10) {
      const retained = progress.tasks.filter((item) => taskWithinRolloverHorizon(item.task, today))
      const expiredCount = progress.tasks.length - retained.length
      if (expiredCount > 0)
        console.info(`Scheduled BBS refresh discarded expired queue items: ${expiredCount}`)
      const daily = scheduledBbsTasksForDate(today).map((task) =>
        task.type === 'lateGames' ? workItem(task, now + 2 * 60 * MINUTE_MS) : workItem(task),
      )
      progress = {
        cycleDate: today,
        tasks: mergePendingTasks(daily, retained),
        cursor: 0,
        pauseUntil: progress.pauseUntil,
        ...(progress.failedTasks === undefined
          ? {}
          : {
              failedTasks: progress.failedTasks.filter((failure) =>
                taskWithinRolloverHorizon(failure.task, today),
              ),
            }),
      }
    }
    if (progress.tasks.length > SCHEDULED_BBS_TASK_LIMIT)
      throw new Error('BBS refresh queue exceeds limit')
    const taskIndex = firstDueTask(progress, now)
    if (taskIndex < 0) {
      if (
        progress.cycleDate === today &&
        (progress.pauseUntil ?? 0) <= now &&
        env.BBS_PLAYER_REFRESH_ENABLED === 'true'
      ) {
        const cooldown = await repository.getProviderCooldown('bbs')
        if (cooldown && cooldown.retryAt > now) return []
        await runScheduledBbsPlayerRefresh(env.NBA_DB, env, repository, fetcher, now, {
          key: QUEUE_LOCK_KEY,
          token,
          // A waiting box may need archive metadata, teams and player stats.
          coreReserve: progress.tasks.reduce(
            (total, item) => total + (item.task.type === 'boxScore' ? 3 : 2),
            0,
          ),
        })
      }
      return []
    }
    if (!(await saveOwnedProgress(progress))) return []
    const item = progress.tasks[taskIndex]
    if (!item) return []
    const task = item.task

    let result: BbsRefreshOutcome
    if (task.type === 'standings') {
      result = await refreshBbsStandings(task.seasonEndYear, env, repository, fetcher, now)
    } else if (task.type === 'enrichStandings') {
      result = await enrichBbsStandings(task.seasonEndYear, repository, now)
    } else if (task.type === 'teamDirectory') {
      result = await refreshBbsTeamDirectory(task, env, repository, fetcher, now, true)
    } else if (task.type === 'games' || task.type === 'lateGames') {
      result = await refreshBbsGames(
        { type: 'games', date: task.date },
        env,
        repository,
        fetcher,
        now,
        false,
        task.type === 'lateGames',
      )
    } else if (task.type === 'teamSeason') {
      result = await refreshBbsTeamSeason(task, env, repository, fetcher, now)
    } else {
      const games = await repository.getCache(gamesCacheKey('bbs', task.date))
      const game =
        games?.capability === 'games' ? games.data.find((entry) => entry.id === task.gameId) : null
      const currentBox = await repository.getCache(gameDetailsCacheKey('bbs', task.gameId))
      const unchangedBoxAlreadyCached =
        currentBox?.capability === 'boxScore' &&
        currentBox.data !== null &&
        game !== null &&
        game !== undefined &&
        isSameFinalGameSnapshot(currentBox.data.game, game)
      if (unchangedBoxAlreadyCached) {
        result = outcome({ type: 'games', date: task.date }, 'up_to_date', games, now, null, null)
      } else if (game?.status === 'final') {
        const boxResult = await refreshBbsGameBoxScore(task, game, env, repository, fetcher, now)
        result = { ...boxResult, target: { type: 'games', date: task.date } }
      } else if (!games || games.capability !== 'games' || !game) {
        result = outcome(
          { type: 'games', date: task.date },
          'deferred',
          games,
          now,
          createNbaApiError('cache_miss', 'bbs', true),
          now + LOCAL_RETRY_MS,
        )
      } else {
        result = outcome({ type: 'games', date: task.date }, 'up_to_date', games, now, null, null)
      }
    }

    const tasks = [...progress.tasks]
    tasks.splice(taskIndex, 1)
    const completed = result.state === 'refreshed' || result.state === 'up_to_date'
    let pauseUntil: number | null = null
    let failedTasks = progress.failedTasks
    let taskExhausted = false
    if (completed) {
      const completedKey = scheduledBbsTaskKey(task)
      const remainingFailures = failedTasks?.filter(
        (failure) => scheduledBbsTaskKey(failure.task) !== completedKey,
      )
      failedTasks = remainingFailures?.length ? remainingFailures : undefined
      if ((task.type === 'games' || task.type === 'lateGames') && task.date < today) {
        const games = await repository.getCache(gamesCacheKey('bbs', task.date))
        if (games?.capability === 'games') {
          const finalGames = games.data.filter(
            (game) => game.provider === 'bbs' && game.status === 'final',
          )
          const cachedBoxes = await repository.getCaches(
            finalGames.map((game) => gameDetailsCacheKey('bbs', game.id)),
          )
          const boxes: ScheduledBbsTask[] = []
          finalGames.forEach((game, index) => {
            const cachedBox = cachedBoxes[index]
            if (
              cachedBox?.capability === 'boxScore' &&
              cachedBox.data !== null &&
              isSameFinalGameSnapshot(cachedBox.data.game, game)
            ) {
              const boxKey = scheduledBbsTaskKey({
                type: 'boxScore',
                date: task.date,
                gameId: game.id,
              })
              failedTasks = failedTasks?.filter(
                (failure) => scheduledBbsTaskKey(failure.task) !== boxKey,
              )
              return
            }
            const boxTask: ScheduledBbsTask = {
              type: 'boxScore',
              date: task.date,
              gameId: game.id,
            }
            const availableReferences = archiveReferenceCount(game, games.providerReferences)
            if (availableReferences < 3) {
              failedTasks = setScheduledFailure(failedTasks, {
                task: boxTask,
                errorCode: 'cache_miss',
                failedAt: now,
                diagnostic: {
                  phase: 'box_score_archive_references',
                  errorCode: 'cache_miss',
                  observedAt: now,
                  expectedCount: 3,
                  actualCount: availableReferences,
                },
              })
              console.warn(
                JSON.stringify({
                  event: 'scheduled_bbs_task_deferred',
                  cycleDate: progress.cycleDate,
                  taskType: boxTask.type,
                  targetDate: boxTask.date,
                  phase: 'box_score_archive_references',
                  errorCode: 'cache_miss',
                  expectedCount: 3,
                  actualCount: availableReferences,
                }),
              )
              return
            }
            boxes.push(boxTask)
          })
          const uniqueBoxes = boxes.filter(
            (box) =>
              !tasks.some(
                (queued) => scheduledBbsTaskKey(queued.task) === scheduledBbsTaskKey(box),
              ),
          )
          tasks.splice(taskIndex, 0, ...uniqueBoxes.map((box) => workItem(box)))
        }
      }
    } else if (result.error && PROVIDER_PAUSE_CODES.has(result.error.code)) {
      const lastError = taskDiagnostic(result, task, now)
      tasks.splice(taskIndex, 0, { ...item, lastError })
      pauseUntil = result.retryAfter ? Date.parse(result.retryAfter) : now + COOLDOWN_MS
    } else {
      const waitingForLease =
        result.state === 'in_progress' || result.error?.code === 'refresh_in_progress'
      const attempts = waitingForLease ? item.attempts : item.attempts + 1
      const lastError = result.error ? taskDiagnostic(result, task, now) : item.lastError
      if (attempts < SCHEDULED_BBS_MAX_ATTEMPTS) {
        let retryIndex = tasks.length
        const directoryNeeded = result.error?.code === 'cache_miss' && task.type === 'standings'
        if (directoryNeeded) {
          const repair: ScheduledBbsTask = {
            type: 'teamDirectory',
            seasonEndYear: task.seasonEndYear,
          }
          const key = scheduledBbsTaskKey(repair)
          const directoryIndex = tasks.findIndex((entry) => scheduledBbsTaskKey(entry.task) === key)
          if (directoryIndex >= 0) {
            retryIndex = Math.max(taskIndex, directoryIndex + 1)
          } else if (
            !failedTasks?.some((entry) => scheduledBbsTaskKey(entry.task) === key) &&
            tasks.length + 1 < SCHEDULED_BBS_TASK_LIMIT
          ) {
            tasks.splice(taskIndex, 0, workItem(repair))
            retryIndex = taskIndex + 1
          }
        } else if (result.error?.code === 'cache_miss' && task.type === 'boxScore') {
          const repair: ScheduledBbsTask = { type: 'games', date: task.date }
          const key = scheduledBbsTaskKey(repair)
          if (
            !tasks.some((entry) => scheduledBbsTaskKey(entry.task) === key) &&
            tasks.length + 1 < SCHEDULED_BBS_TASK_LIMIT
          ) {
            tasks.splice(taskIndex, 0, workItem(repair))
            retryIndex += 1
          }
        }
        const retryAt = waitingForLease
          ? Math.max(now + LOCK_MS, Date.parse(result.retryAfter ?? '') || 0)
          : now + Math.min(LOCAL_RETRY_MS * 2 ** (attempts - 1), MAX_LOCAL_RETRY_MS)
        tasks.splice(retryIndex, 0, {
          ...item,
          attempts,
          retryAt,
          ...(lastError ? { lastError } : {}),
        })
      } else {
        taskExhausted = true
        const errorCode = result.error?.code ?? null
        failedTasks = setScheduledFailure(failedTasks, {
          task,
          errorCode,
          failedAt: now,
          ...(lastError ? { diagnostic: lastError } : {}),
        })
      }
    }
    const progressToSave = {
      ...progress,
      tasks,
      cursor: 0,
      pauseUntil,
    }
    if (failedTasks === undefined) delete progressToSave.failedTasks
    else progressToSave.failedTasks = failedTasks
    const saved = await saveOwnedProgress(progressToSave)
    if (saved && result.error) {
      const diagnostic = taskDiagnostic(result, task, now)
      const event = taskExhausted ? 'scheduled_bbs_task_exhausted' : 'scheduled_bbs_task_retry'
      console.warn(
        JSON.stringify({
          event,
          cycleDate: progress.cycleDate,
          taskType: task.type,
          targetDate: 'date' in task ? task.date : undefined,
          phase: diagnostic.phase,
          errorCode: diagnostic.errorCode,
          upstreamStatus: result.error.upstreamStatus,
          attempts:
            event === 'scheduled_bbs_task_exhausted'
              ? SCHEDULED_BBS_MAX_ATTEMPTS
              : item.attempts + 1,
          retryAt:
            event === 'scheduled_bbs_task_exhausted'
              ? null
              : (tasks.find(
                  (queued) => scheduledBbsTaskKey(queued.task) === scheduledBbsTaskKey(task),
                )?.retryAt ?? result.retryAfter),
          expectedCount: diagnostic.expectedCount,
          actualCount: diagnostic.actualCount,
          rejectedRecords: diagnostic.rejectedRecords,
        }),
      )
    }
    return [result]
  } finally {
    try {
      await repository.releaseLock(QUEUE_LOCK_KEY, token)
    } catch {
      /* lease expires */
    }
  }
}

async function enrichBbsStandings(
  seasonEndYear: SeasonEndYear,
  repository: NbaRepository,
  now: number,
): Promise<BbsRefreshOutcome> {
  const target: NbaRefreshTarget = { type: 'standings', seasonEndYear }
  const standingsKey = standingsCacheKey('bbs', seasonEndYear)
  const cached = await repository.getCache(standingsKey)
  if (cached?.capability !== 'standings')
    return outcome(
      target,
      'deferred',
      cached,
      now,
      createNbaApiError('cache_miss', 'bbs', true),
      now + COOLDOWN_MS,
    )
  if (cached.staleUntil <= now)
    return outcome(
      target,
      'deferred',
      cached,
      now,
      createNbaApiError('cache_miss', 'bbs', true),
      now + COOLDOWN_MS,
    )
  const directory = await repository.getCache(teamDirectoryCacheKey('bbs', seasonEndYear))
  if (directory?.capability !== 'teamDirectory' || directory.staleUntil <= now)
    return outcome(
      target,
      'deferred',
      cached,
      now,
      createNbaApiError('cache_miss', 'bbs', true),
      now + COOLDOWN_MS,
    )

  const seasonRecords = await Promise.all(
    NBA_TEAMS.map((team) =>
      repository.getCache(teamSeasonCacheKey('bbs', team.team.id, seasonEndYear)),
    ),
  )
  const enriched = cached.data.map((row) => {
    const reference = directory.data.find((entry) => entry.teamId === row.team.id)
    const teamRecord = seasonRecords.find(
      (record) => record?.capability === 'teamSeason' && record.teamId === row.team.id,
    )
    const profile =
      reference &&
      teamRecord?.capability === 'teamSeason' &&
      teamRecord.providerTeamId === reference.providerTeamId &&
      teamRecord.seasonEndYear === seasonEndYear &&
      teamRecord.data.team.providerId === reference.providerTeamId &&
      row.team.providerId === (reference.standingsTeamId ?? reference.providerTeamId) &&
      teamRecord.staleUntil > now &&
      Date.parse(teamRecord.fetchedAt) <= now &&
      Math.abs(Date.parse(teamRecord.fetchedAt) - Date.parse(cached.fetchedAt)) <= DAY_MS &&
      teamRecord.data.wins === row.record.wins &&
      teamRecord.data.losses === row.record.losses
        ? teamRecord.data
        : null
    const home = profile?.home ?? null
    const away = profile?.away ?? null
    const validCount = (value: number | null) =>
      value !== null && Number.isInteger(value) && value >= 0 && value <= 82
    const splitsMatch =
      !!home &&
      !!away &&
      validCount(home.wins) &&
      validCount(home.losses) &&
      validCount(away.wins) &&
      validCount(away.losses) &&
      home.wins !== null &&
      away.wins !== null &&
      home.losses !== null &&
      away.losses !== null &&
      home.wins + away.wins === row.record.wins &&
      home.losses + away.losses === row.record.losses
    const lastTen = profile?.lastTen
    const lastTenWins =
      lastTen?.length === 10 ? lastTen.filter((game) => game.result === 'W').length : null
    return {
      ...row,
      record: {
        ...row.record,
        homeWins: splitsMatch ? home!.wins : null,
        homeLosses: splitsMatch ? home!.losses : null,
        awayWins: splitsMatch ? away!.wins : null,
        awayLosses: splitsMatch ? away!.losses : null,
        lastTenWins,
      },
    }
  })
  if (enriched.every((row, index) => row === cached.data[index]))
    return outcome(target, 'up_to_date', cached, now, null, null)

  const lockKey = `bbs:standings:season=${seasonEndYear}`
  const token = crypto.randomUUID()
  if (!(await repository.tryAcquireLock(lockKey, token, now, now + LOCK_MS)))
    return outcome(target, 'in_progress', cached, now, null, now + LOCK_MS)
  try {
    const latest = await repository.getCache(standingsKey)
    if (latest?.capability !== 'standings' || latest.fetchedAt !== cached.fetchedAt)
      return outcome(
        target,
        'deferred',
        latest,
        now,
        createNbaApiError('refresh_in_progress', 'bbs', true),
        now + LOCK_MS,
      )
    const updated = { ...latest, data: enriched }
    if (!(await repository.putCacheIfLockOwned(updated, lockKey, token, Date.now())))
      return outcome(target, 'in_progress', latest, now, null, now + LOCK_MS)
    return outcome(target, 'refreshed', updated, now, null, null)
  } finally {
    try {
      await repository.releaseLock(lockKey, token)
    } catch {
      /* lease expires */
    }
  }
}
