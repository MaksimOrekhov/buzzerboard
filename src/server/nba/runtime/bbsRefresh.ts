import type { Game, GameId, NbaApiError, NbaGameDate, UtcTimestamp } from '@/entities/nba/model'
import { normalizeBbsGameBox, normalizeBbsGames } from '@/server/nba/adapters/bbs'
import { createNbaApiError, mapHttpStatusToNbaError } from '@/server/nba/adapters/errors'
import { parseNbaGameDate } from '@/server/nba/adapters/normalizers/primitives'
import { getDateKeyInTimeZone, NBA_TIME_ZONE } from '@/shared/utils/nbaDate'
import type { BoxScoreCacheRecord, NbaCacheRecord, NbaRepository, WorkerEnvironment } from './types'
import { gameDetailsCacheKey, gamesCacheKey } from './cacheKeys'
import type { NbaRefreshTarget } from './types'
import type { BoxScoreRefreshOutcome } from './gameDetails'

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
let providerRemainingBudget: { utcDay: string; remaining: number } | null = null

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

async function reserveBbsRequest(
  repository: NbaRepository,
  env: WorkerEnvironment,
  now: number,
): Promise<{
  allowed: boolean
  retryAt: number | null
  code: 'quota_exceeded' | 'rate_limited' | null
}> {
  const dayStart = Math.floor(now / DAY_MS) * DAY_MS
  const dailyAllowed = await repository.consumeRateSlot(
    `bbs:utc-day:${new Date(dayStart).toISOString().slice(0, 10)}`,
    now,
    DAY_MS,
    configuredLimit(env.BBS_DAILY_REQUEST_LIMIT, DEFAULT_DAILY_LIMIT),
  )
  if (!dailyAllowed) return { allowed: false, retryAt: dayStart + DAY_MS, code: 'quota_exceeded' }
  const minuteAllowed = await repository.consumeRateSlot(
    'bbs:upstream-minute',
    now,
    MINUTE_MS,
    configuredLimit(env.BBS_PER_MINUTE_REQUEST_LIMIT, DEFAULT_MINUTE_LIMIT),
  )
  if (!minuteAllowed)
    return {
      allowed: false,
      retryAt: Math.floor(now / MINUTE_MS) * MINUTE_MS + MINUTE_MS,
      code: 'rate_limited',
    }
  return { allowed: true, retryAt: null, code: null }
}

function safeRetryAfter(response: Response, now: number): number {
  const value = response.headers.get('retry-after')
  const seconds = value ? Number(value) : NaN
  return Number.isFinite(seconds) && seconds >= 0 ? now + seconds * 1000 : now + COOLDOWN_MS
}

async function getBbsJson(
  path: string,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
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
  const utcDay = new Date(requestNow).toISOString().slice(0, 10)
  if (providerRemainingBudget?.utcDay !== utcDay) providerRemainingBudget = null
  if (providerRemainingBudget && providerRemainingBudget.remaining <= requestHeadroom(env)) {
    const nextDay = Date.parse(`${utcDay}T00:00:00.000Z`) + DAY_MS
    throw Object.assign(createNbaApiError('quota_exceeded', 'bbs', true), { retryAt: nextDay })
  }
  const reservation = await reserveBbsRequest(repository, env, requestNow)
  if (!reservation.allowed) {
    throw Object.assign(createNbaApiError(reservation.code ?? 'quota_exceeded', 'bbs', true), {
      retryAt: reservation.retryAt,
    })
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
  const remainingHeader =
    response.headers.get('x-ratelimit-remaining') ??
    response.headers.get('x-ratelimit-remaining-day') ??
    response.headers.get('x-ratelimit-day-remaining')
  const providerRemaining = remainingHeader === null ? NaN : Number(remainingHeader)
  if (Number.isSafeInteger(providerRemaining) && providerRemaining >= 0) {
    providerRemainingBudget = { utcDay, remaining: providerRemaining }
  }
  if (!response.ok) {
    const error = mapHttpStatusToNbaError('bbs', response.status)
    if (response.status === 429) {
      const retryAfter = safeRetryAfter(response, now)
      throw Object.assign(error, { retryAt: retryAfter })
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
): Promise<void> {
  if (game.provider !== 'bbs' || game.status !== 'final') return
  const key = gameDetailsCacheKey('bbs', game.id)
  const previous = await repository.getCache(key)
  if (previous?.capability === 'boxScore' && previous.data && now < previous.expiresAt) return
  const token = crypto.randomUUID()
  if (!(await repository.tryAcquireLock(key, token, now, now + LOCK_MS))) return
  try {
    const latest = await repository.getCache(key)
    if (latest?.capability === 'boxScore' && latest.data && now < latest.expiresAt) return
    const teamsPayload = await getBbsJson(
      `/v1/nba/games/${encodeURIComponent(archiveGameId)}`,
      env,
      repository,
      fetcher,
      now,
    )
    const playersPayload = await getBbsJson(
      `/v1/nba/games/${encodeURIComponent(game.providerId)}/box`,
      env,
      repository,
      fetcher,
      now,
    )
    const availabilityPayload = await getBbsJson(
      `/v1/nba/games/${encodeURIComponent(archiveGameId)}/availability`,
      env,
      repository,
      fetcher,
      now,
    )
    const box = normalizeBbsGameBox(
      teamsPayload,
      playersPayload,
      availabilityPayload,
      game,
      archiveGameId,
    )
    const record: BoxScoreCacheRecord = {
      cacheKey: key,
      capability: 'boxScore',
      gameId: game.id,
      provider: 'bbs',
      data: box,
      fetchedAt: timestamp(now),
      providerUpdatedAt: null,
      rejectedRecords: 0,
      expiresAt: now + BOX_TTL_MS,
      staleUntil: now + BOX_STALE_MS,
      retryAt: null,
      refreshError: null,
    }
    await repository.putCache(record)
  } finally {
    try {
      await repository.releaseLock(key, token)
    } catch {
      /* Lease expires safely. */
    }
  }
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
  if (previous && now < previous.expiresAt) {
    if (env.BBS_REFRESH_ENABLED === 'true' && previous.capability === 'games') {
      for (const game of previous.data) {
        const archiveId = previous.providerReferences?.[game.id]
        const box = await repository.getCache(gameDetailsCacheKey('bbs', game.id))
        if (
          game.status === 'final' &&
          archiveId &&
          (!box || box.capability !== 'boxScore' || !box.data || now >= box.expiresAt)
        ) {
          try {
            await refreshBox(game, archiveId, env, repository, fetcher, now)
          } catch (cause) {
            const error =
              cause && typeof cause === 'object' && 'code' in cause
                ? (cause as NbaApiError)
                : createNbaApiError('invalid_response', 'bbs')
            const retryAt =
              Number((cause as { retryAt?: number } | null)?.retryAt) || now + COOLDOWN_MS
            return outcome(target, 'deferred', previous, now, error, retryAt)
          }
        }
      }
    }
    return outcome(target, 'up_to_date', previous, now)
  }
  if (env.BBS_REFRESH_ENABLED !== 'true' || !env.BBS_API_KEY) {
    const error = createNbaApiError('not_configured', 'bbs')
    return outcome(target, 'deferred', previous, now, error)
  }
  const token = crypto.randomUUID()
  if (!(await repository.tryAcquireLock(key, token, now, now + LOCK_MS))) {
    return outcome(target, 'in_progress', previous, now, null, now + LOCK_MS)
  }
  try {
    const latest = await repository.getCache(key)
    if (latest && now < latest.expiresAt) return outcome(target, 'up_to_date', latest, now)
    const path = `/v1/matches?league=nba&date=${encodeURIComponent(target.date)}&tz=America%2FNew_York&limit=100`
    const payload = await getBbsJson(path, env, repository, fetcher, now)
    const { root, matches } = matchesPayload(payload)
    const snapshot = normalizeBbsGames(
      { data: { ...root, matches } },
      { fetchedAt: timestamp(now), stale: false },
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
    const record = {
      cacheKey: key,
      capability: 'games' as const,
      provider: 'bbs' as const,
      data,
      providerReferences,
      fetchedAt: snapshot.meta.fetchedAt,
      providerUpdatedAt: snapshot.meta.providerUpdatedAt,
      rejectedRecords: snapshot.meta.rejectedRecords,
      expiresAt: now + GAME_TTL_MS,
      staleUntil: now + GAME_STALE_MS,
      retryAt: null,
      refreshError: null,
    }
    const previousGames = previous?.capability === 'games' ? previous.data : []
    for (const game of data) {
      const prior = previousGames.find((candidate) => candidate.id === game.id)
      if (
        prior &&
        (prior.status !== game.status ||
          prior.homeTeam.id !== game.homeTeam.id ||
          prior.awayTeam.id !== game.awayTeam.id ||
          prior.score.home !== game.score.home ||
          prior.score.away !== game.score.away)
      ) {
        await repository.deleteCache(gameDetailsCacheKey('bbs', game.id))
      }
    }
    await repository.putCache(record)
    for (const game of data) {
      const archiveId = providerReferences[game.id]
      if (game.status === 'final' && archiveId)
        await refreshBox(game, archiveId, env, repository, fetcher, now)
    }
    return outcome(target, 'refreshed', record, now, null, null)
  } catch (cause) {
    const error =
      cause && typeof cause === 'object' && 'code' in cause
        ? (cause as NbaApiError)
        : createNbaApiError('invalid_response', 'bbs')
    const retryAt = Number((cause as { retryAt?: number } | null)?.retryAt) || now + COOLDOWN_MS
    const failed = cacheFailure(previous, error, now, retryAt)
    if (failed) await repository.putCache(failed)
    return outcome(target, 'deferred', failed, now, error, retryAt)
  } finally {
    try {
      await repository.releaseLock(key, token)
    } catch {
      /* Lease expires safely. */
    }
  }
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
  if (record?.data && now < record.expiresAt) return result('up_to_date', null, null)
  try {
    const games = await repository.getCache(gamesCacheKey('bbs', game.nbaGameDate))
    const archiveId =
      games?.capability === 'games' ? games.providerReferences?.[game.id] : undefined
    if (!archiveId) throw createNbaApiError('cache_miss', 'bbs', true)
    await refreshBox(game, archiveId, env, repository, fetcher, now)
    const latest = await repository.getCache(cacheKey)
    const latestBox = latest?.capability === 'boxScore' ? latest : null
    return result(latestBox?.data ? 'refreshed' : 'deferred', latestBox?.refreshError ?? null)
  } catch (cause) {
    const error =
      cause && typeof cause === 'object' && 'code' in cause
        ? (cause as NbaApiError)
        : createNbaApiError('invalid_response', 'bbs')
    const retryAt = Number((cause as { retryAt?: number } | null)?.retryAt) || now + COOLDOWN_MS
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
      result.error?.code === 'quota_exceeded'
    )
      break
  }
  return results
}
