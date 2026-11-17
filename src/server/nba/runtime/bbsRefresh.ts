import type { Game, GameId, NbaApiError, NbaGameDate, UtcTimestamp } from '@/entities/nba/model'
import { normalizeBbsGameBox, normalizeBbsGames } from '@/server/nba/adapters/bbs'
import { createNbaApiError, mapHttpStatusToNbaError } from '@/server/nba/adapters/errors'
import { parseNbaGameDate } from '@/server/nba/adapters/normalizers/primitives'
import { getDateKeyInTimeZone, NBA_TIME_ZONE } from '@/shared/utils/nbaDate'
import type { BoxScoreCacheRecord, NbaCacheRecord, NbaRepository, WorkerEnvironment } from './types'
import { gameDetailsCacheKey, gamesCacheKey } from './cacheKeys'
import type { NbaRefreshTarget } from './types'
import type { BoxScoreRefreshOutcome } from './gameDetails'
import { isSameFinalGameSnapshot } from '@/shared/api/nba/gameDetailsGuards'

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
const COOLDOWN_MS = 15 * MINUTE_MS
const DEFAULT_REQUEST_INTERVAL_MS = 6_100
let previousRequestStartedAt = 0

export interface BbsRefreshOutcome {
  target: NbaRefreshTarget
  state: 'refreshed' | 'up_to_date' | 'deferred' | 'in_progress'
  isStale: boolean
  fetchedAt: UtcTimestamp | null
  retryAfter: UtcTimestamp | null
  error: NbaApiError | null
}

export interface BbsBoxTarget {
  type: 'boxScore'
  date: NbaGameDate
  gameId: GameId
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
): BbsRefreshOutcome {
  return {
    target,
    state,
    isStale: !record || now >= record.expiresAt,
    fetchedAt: record?.fetchedAt ?? null,
    retryAfter: retryAt === null ? null : timestamp(retryAt),
    error,
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

async function getBbsJson(
  path: string,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
  lock?: { key: string; token: string },
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
  const reservation = await repository.reserveBbsRequest(
    requestNow,
    configuredLimit(env.BBS_DAILY_REQUEST_LIMIT, DEFAULT_DAILY_LIMIT),
    configuredLimit(env.BBS_PER_MINUTE_REQUEST_LIMIT, DEFAULT_MINUTE_LIMIT),
  )
  if (!reservation.allowed) {
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
  try {
    const payload: unknown = await response.json()
    if (payload && typeof payload === 'object' && 'error' in payload) {
      throw createNbaApiError('invalid_response', 'bbs')
    }
    return payload
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'code' in cause) throw cause
    throw createNbaApiError('invalid_response', 'bbs')
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
    const box = normalizeBbsGameBox(teamsPayload, playersPayload, null, game, archiveGameId)
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
    const error =
      cause && typeof cause === 'object' && 'code' in cause
        ? (cause as NbaApiError)
        : createNbaApiError('invalid_response', 'bbs')
    const failedAt = Date.now()
    const retryAt =
      Number((cause as { retryAt?: number } | null)?.retryAt) || failedAt + COOLDOWN_MS
    if (BATCH_STOP_ERRORS.has(error.code))
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
    if (error.code !== 'refresh_in_progress')
      await repository.putCacheIfLockOwned(failure, lockKey, token, failedAt)
    return { state: 'deferred', error, retryAt }
  } finally {
    try {
      await repository.releaseLock(lockKey, token)
    } catch {
      /* Lease expires safely. */
    }
  }
}

const BATCH_STOP_ERRORS = new Set<NbaApiError['code']>([
  'authentication',
  'forbidden',
  'rate_limited',
  'quota_exceeded',
  'upstream_unavailable',
  'timeout',
  'storage_unavailable',
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
): Promise<{ error: NbaApiError | null; retryAt: number | null; refreshed: boolean }> {
  let firstError: NbaApiError | null = null
  let retryAt: number | null = null
  let refreshed = false
  const finals = games.filter((game) => game.provider === 'bbs' && game.status === 'final')
  for (let index = 0; index < finals.length; index += 1) {
    const game = finals[index]!
    const archiveId = providerReferences?.[game.id]
    const result = archiveId
      ? await refreshBox(game, archiveId, env, repository, fetcher, Math.max(now, Date.now()))
      : {
          state: 'deferred' as const,
          error: createNbaApiError('invalid_response', 'bbs'),
          retryAt: Date.now() + COOLDOWN_MS,
        }
    if (!archiveId) await saveBoxFailure(game, repository, result.error!, result.retryAt!)
    if (result.state === 'refreshed') refreshed = true
    if (result.error) {
      firstError ??= result.error
      retryAt ??= result.retryAt
      if (BATCH_STOP_ERRORS.has(result.error.code)) {
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
  return { error: firstError, retryAt, refreshed }
}

export async function refreshBbsGames(
  target: Extract<NbaRefreshTarget, { type: 'games' }>,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
): Promise<BbsRefreshOutcome> {
  const key = gamesCacheKey('bbs', target.date)
  const previous = await repository.getCache(key)
  if (previous && Date.now() < previous.expiresAt) {
    if (env.BBS_REFRESH_ENABLED === 'true' && previous.capability === 'games') {
      const boxes = await refreshCachedBoxes(
        previous.data,
        previous.providerReferences,
        env,
        repository,
        fetcher,
        now,
      )
      if (boxes.error)
        return outcome(target, 'deferred', previous, Date.now(), boxes.error, boxes.retryAt)
      return outcome(
        target,
        boxes.refreshed ? 'refreshed' : 'up_to_date',
        previous,
        Date.now(),
        null,
        null,
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
  try {
    const latest = await repository.getCache(key)
    const latestGames = latest?.capability === 'games' ? latest : null
    if (latest && Date.now() < latest.expiresAt) {
      if (latestGames) record = latestGames
      else throw createNbaApiError('invalid_response', 'bbs')
    } else {
      const path = `/v1/matches?league=nba&date=${encodeURIComponent(target.date)}&tz=America%2FNew_York&limit=100`
      const payload = await getBbsJson(path, env, repository, fetcher, Date.now(), {
        key: lockKey,
        token,
      })
      const { root, matches } = matchesPayload(payload)
      const fetchedAt = Date.now()
      const snapshot = normalizeBbsGames(
        { data: { ...root, matches } },
        { fetchedAt: timestamp(fetchedAt), stale: false },
      )
      if (snapshot.meta.rejectedRecords > 0) throw createNbaApiError('invalid_response', 'bbs')
      const data = snapshot.data.filter((game) => game.nbaGameDate === target.date)
      if (data.length !== snapshot.data.length) throw createNbaApiError('invalid_response', 'bbs')
      const providerReferences: Record<string, string> = {}
      for (const raw of matches) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
        const rawRecord = raw as Record<string, unknown>
        const rawId = rawRecord.id ?? rawRecord.match_id ?? rawRecord.match_uuid
        const archiveId = rawRecord.archive_game_id
        if (
          (typeof rawId === 'string' || typeof rawId === 'number') &&
          (typeof archiveId === 'string' || typeof archiveId === 'number')
        ) {
          const normalizedGameId = `bbs:game:${String(rawId)}`
          providerReferences[normalizedGameId] = String(archiveId)
        }
      }
      if (data.some((game) => game.status === 'final' && !providerReferences[game.id])) {
        throw createNbaApiError('invalid_response', 'bbs')
      }
      const freshRecord: Extract<NbaCacheRecord, { capability: 'games' }> = {
        cacheKey: key,
        capability: 'games',
        provider: 'bbs',
        data,
        providerReferences,
        fetchedAt: snapshot.meta.fetchedAt,
        providerUpdatedAt: snapshot.meta.providerUpdatedAt,
        rejectedRecords: snapshot.meta.rejectedRecords,
        expiresAt: fetchedAt + GAME_TTL_MS,
        staleUntil: fetchedAt + GAME_STALE_MS,
        retryAt: null,
        refreshError: null,
      }
      if (!(await repository.putCacheIfLockOwned(freshRecord, lockKey, token, Date.now())))
        throw Object.assign(createNbaApiError('refresh_in_progress', 'bbs', true), {
          retryAt: Date.now() + LOCK_MS,
        })
      record = freshRecord
      listRefreshed = true
    }
  } catch (cause) {
    refreshError =
      cause && typeof cause === 'object' && 'code' in cause
        ? (cause as NbaApiError)
        : createNbaApiError('invalid_response', 'bbs')
    refreshRetryAt =
      Number((cause as { retryAt?: number } | null)?.retryAt) || Date.now() + COOLDOWN_MS
    const failed = cacheFailure(previous, refreshError, Date.now(), refreshRetryAt)
    if (failed) await repository.putCacheIfLockOwned(failed, lockKey, token, Date.now())
  } finally {
    try {
      await repository.releaseLock(lockKey, token)
    } catch {
      /* Lease expires safely. */
    }
  }
  if (refreshError)
    return outcome(target, 'deferred', previous, Date.now(), refreshError, refreshRetryAt)
  if (!record)
    return outcome(
      target,
      'deferred',
      previous,
      Date.now(),
      createNbaApiError('invalid_response', 'bbs'),
    )
  const boxes = await refreshCachedBoxes(
    record.data,
    record.providerReferences,
    env,
    repository,
    fetcher,
    Date.now(),
  )
  if (boxes.error)
    return outcome(target, 'deferred', record, Date.now(), boxes.error, boxes.retryAt)
  return outcome(
    target,
    listRefreshed || boxes.refreshed ? 'refreshed' : 'up_to_date',
    record,
    Date.now(),
    null,
    null,
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
    const boxResult = await refreshBox(game, archiveId, env, repository, fetcher, Date.now())
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
    const error =
      cause && typeof cause === 'object' && 'code' in cause
        ? (cause as NbaApiError)
        : createNbaApiError('invalid_response', 'bbs')
    const retryAt =
      Number((cause as { retryAt?: number } | null)?.retryAt) || Date.now() + COOLDOWN_MS
    return result('deferred', error, retryAt)
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

export async function runScheduledBbsRefresh(
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
): Promise<BbsRefreshOutcome[]> {
  if (env.BBS_REFRESH_ENABLED !== 'true' || !env.BBS_API_KEY) return []
  const today = parseNbaGameDate(getDateKeyInTimeZone(new Date(now), NBA_TIME_ZONE))
  if (!today) return []
  const targets: NbaRefreshTarget[] = []
  for (let offset = -1; offset <= 7; offset += 1) {
    const [year, month, day] = today.split('-').map(Number)
    const date = parseNbaGameDate(
      new Date(Date.UTC(year!, month! - 1, day! + offset)).toISOString().slice(0, 10),
    )
    if (date) targets.push({ type: 'games', date })
  }
  const results: BbsRefreshOutcome[] = []
  for (const target of targets) {
    const result = await refreshBbsGames(
      target as Extract<NbaRefreshTarget, { type: 'games' }>,
      env,
      repository,
      fetcher,
      now,
    )
    results.push(result)
    // Authentication/quota failures are terminal for this run. Do not burn
    // further budget after a provider-wide 403/429 or the local daily cap.
    if (
      result.error?.code === 'forbidden' ||
      result.error?.code === 'authentication' ||
      result.error?.code === 'rate_limited' ||
      result.error?.code === 'quota_exceeded' ||
      result.error?.code === 'upstream_unavailable' ||
      result.error?.code === 'timeout' ||
      result.error?.code === 'storage_unavailable'
    )
      break
  }
  return results
}
