import type {
  Game,
  NbaApiError,
  NbaGameDate,
  NbaProviderId,
  SeasonEndYear,
  StandingsRow,
  UtcTimestamp,
} from '@/entities/nba/model'
import { parseNbaGameDate, parseSeasonEndYear } from '@/server/nba/adapters/normalizers/primitives'
import {
  NbaAdapterError,
  createNbaApiError,
  mapHttpStatusToNbaError,
} from '@/server/nba/adapters/errors'
import { nbaProviderAdapters } from '@/server/nba/adapters'
import { resolveProviderForCapability } from '@/server/nba/adapters/adapter'
import type {
  GameDateCoverage,
  NbaCacheRecord,
  NbaRefreshTarget,
  NbaRepository,
  WorkerEnvironment,
} from '@/server/nba/runtime/types'
import { gamesCacheKey, scheduleCacheKey, standingsCacheKey } from '@/server/nba/runtime/cacheKeys'
import { getDateKeyInTimeZone, NBA_TIME_ZONE } from '@/shared/utils/nbaDate'

const PROVIDER_URL = 'https://mcp.dunkapi.com/v1'
const UPSTREAM_TIMEOUT_MS = 12_000
const LOCK_LEASE_MS = 30_000
const UPSTREAM_WINDOW_MS = 60_000
const UPSTREAM_RATE_LIMIT = 10
const PROVIDER_FREE_MONTHLY_CREDITS = 500
const APP_MONTHLY_CREDIT_CAP = 128
const DAILY_REGULAR_REFRESH_CREDITS = 4
const SCHEDULE_REFRESH_CREDITS = 2
const RETRY_COOLDOWN_MS = 15 * 60_000
const GAME_FRESH_TTL_MS = 24 * 60 * 60_000
const GAME_MAX_STALE_MS = 30 * 24 * 60 * 60_000
const STANDINGS_FRESH_TTL_MS = 24 * 60 * 60_000
const STANDINGS_MAX_STALE_MS = 7 * 24 * 60 * 60_000
const SCHEDULE_FRESH_TTL_MS = 7 * 24 * 60 * 60_000
const SCHEDULE_MAX_STALE_MS = 14 * 24 * 60 * 60_000

export interface RefreshOutcome {
  target: NbaRefreshTarget
  state: 'refreshed' | 'up_to_date' | 'deferred' | 'in_progress'
  isStale: boolean
  fetchedAt: UtcTimestamp | null
  retryAfter: UtcTimestamp | null
  error: NbaApiError | null
}

interface ProviderRequest {
  endpoint: 'list_games' | 'get_standings' | 'get_schedule'
  credits: 2
  body: Record<string, string | number>
}

interface BudgetConfig {
  month: string
  baselineCredits: number
  appLimit: number
}

export interface RegularRefreshPlan {
  daysInMonth: number
  sundayOrdinals: readonly number[]
  scheduleRefreshSundayOrdinals: readonly number[]
  dailyCredits: number
  plannedScheduleCredits: number
  plannedCredits: number
}

export function getRegularRefreshPlan(
  month: string,
  monthlyCreditBudget: number,
): RegularRefreshPlan {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month)
  if (!match) throw new Error('A regular refresh plan requires a YYYY-MM month')

  const year = Number(match[1])
  const monthNumber = Number(match[2])
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const sundayOrdinals: number[] = []
  for (let day = 1; day <= daysInMonth; day += 1) {
    if (new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay() === 0) {
      sundayOrdinals.push(Math.floor((day - 1) / 7) + 1)
    }
  }

  const dailyCredits = daysInMonth * DAILY_REGULAR_REFRESH_CREDITS
  const scheduleRefreshCount = Math.min(
    sundayOrdinals.length,
    Math.floor(Math.max(0, monthlyCreditBudget - dailyCredits) / SCHEDULE_REFRESH_CREDITS),
  )
  const scheduleRefreshSundayOrdinals = Array.from({ length: scheduleRefreshCount }, (_, index) => {
    const sundayIndex = Math.floor(((index + 0.5) * sundayOrdinals.length) / scheduleRefreshCount)
    return sundayOrdinals[sundayIndex]!
  })
  const plannedScheduleCredits = scheduleRefreshCount * SCHEDULE_REFRESH_CREDITS

  return {
    daysInMonth,
    sundayOrdinals,
    scheduleRefreshSundayOrdinals,
    dailyCredits,
    plannedScheduleCredits,
    plannedCredits: dailyCredits + plannedScheduleCredits,
  }
}

function parseInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function budgetConfig(env: WorkerEnvironment, now: number): BudgetConfig | null {
  const month = new Date(now).toISOString().slice(0, 7)
  const baselineMonth = env.DUNKAPI_CREDIT_BASELINE_MONTH
  const monthlyLimit = parseInteger(env.DUNKAPI_MONTHLY_CREDIT_LIMIT)
  const configuredAppLimit = parseInteger(env.DUNKAPI_APP_MONTHLY_CREDIT_BUDGET)
  const baselineCredits = parseInteger(env.DUNKAPI_CREDITS_USED_BASELINE)

  if (
    baselineMonth !== month ||
    monthlyLimit === null ||
    monthlyLimit < 1 ||
    monthlyLimit > PROVIDER_FREE_MONTHLY_CREDITS ||
    configuredAppLimit === null ||
    configuredAppLimit < 1 ||
    configuredAppLimit > APP_MONTHLY_CREDIT_CAP ||
    baselineCredits === null ||
    baselineCredits < 0 ||
    baselineCredits >= monthlyLimit
  ) {
    return null
  }

  return {
    month,
    baselineCredits,
    appLimit: Math.min(configuredAppLimit, monthlyLimit - baselineCredits),
  }
}

function providerOrder(env: WorkerEnvironment, capability: 'games' | 'standings'): NbaProviderId[] {
  const value =
    capability === 'games' ? env.NBA_GAMES_PROVIDER_ORDER : env.NBA_STANDINGS_PROVIDER_ORDER
  if (!value) return []
  return value
    .split(',')
    .map((provider) => provider.trim())
    .filter((provider): provider is NbaProviderId => provider === 'dunkapi' || provider === 'espn')
}

export function getProviderForTarget(
  target: NbaRefreshTarget,
  env: WorkerEnvironment,
): NbaProviderId | null {
  const capability = target.type === 'standings' ? 'standings' : 'games'
  const resolved = resolveProviderForCapability(
    capability,
    { [capability]: providerOrder(env, capability) },
    Object.values(nbaProviderAdapters),
  )
  return resolved?.provider ?? null
}

export function cacheKeyForTarget(target: NbaRefreshTarget, provider: NbaProviderId): string {
  if (target.type === 'standings') return standingsCacheKey(provider, target.seasonEndYear)
  if (target.type === 'schedule') return scheduleCacheKey(provider)
  return gamesCacheKey(provider, target.date)
}

function providerRequest(target: NbaRefreshTarget): ProviderRequest | null {
  if (target.type === 'standings') {
    return {
      endpoint: 'get_standings',
      credits: 2,
      body: { league: 'nba', season: target.seasonEndYear },
    }
  }

  if (target.type === 'schedule') {
    return { endpoint: 'get_schedule', credits: 2, body: { league: 'nba', days: 7 } }
  }

  const seasonEndYear = nbaSeasonEndYearForDate(target.date)
  if (!seasonEndYear) return null

  return {
    endpoint: 'list_games',
    credits: 2,
    body: { league: 'nba', season: seasonEndYear, date: target.date, limit: 30 },
  }
}

export function nbaSeasonEndYearForDate(value: NbaGameDate): SeasonEndYear | null {
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  return parseSeasonEndYear(month >= 8 ? year + 1 : year)
}

function timePolicy(target: NbaRefreshTarget): { freshMs: number; maxStaleMs: number } {
  if (target.type === 'standings') {
    return { freshMs: STANDINGS_FRESH_TTL_MS, maxStaleMs: STANDINGS_MAX_STALE_MS }
  }
  if (target.type === 'schedule') {
    return { freshMs: SCHEDULE_FRESH_TTL_MS, maxStaleMs: SCHEDULE_MAX_STALE_MS }
  }
  return { freshMs: GAME_FRESH_TTL_MS, maxStaleMs: GAME_MAX_STALE_MS }
}

function asTimestamp(value: number): UtcTimestamp {
  return new Date(value).toISOString() as UtcTimestamp
}

function outcome(
  target: NbaRefreshTarget,
  state: RefreshOutcome['state'],
  record: NbaCacheRecord | null,
  now: number,
  error: NbaApiError | null = record?.refreshError ?? null,
  retryAt: number | null = record?.retryAt ?? null,
): RefreshOutcome {
  const isStale = !record || now >= record.expiresAt
  return {
    target,
    state,
    isStale,
    fetchedAt: record?.fetchedAt ?? null,
    retryAfter: retryAt === null ? null : asTimestamp(retryAt),
    error,
  }
}

function requestError(
  code: 'not_configured' | 'quota_exceeded' | 'rate_limited',
  provider: NbaProviderId,
) {
  const retryable = code !== 'not_configured'
  return createNbaApiError(code, provider, retryable)
}

async function postDunkApi(
  request: ProviderRequest,
  apiKey: string,
  fetcher: typeof fetch,
  provider: NbaProviderId,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetcher(`${PROVIDER_URL}/${request.endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch {
    throw createNbaApiError('timeout', provider, true)
  }

  if (!response.ok) throw mapHttpStatusToNbaError(provider, response.status)
  try {
    return await response.json()
  } catch {
    throw createNbaApiError('invalid_response', provider)
  }
}

function createCacheRecord(
  target: NbaRefreshTarget,
  provider: NbaProviderId,
  data: readonly Game[] | readonly StandingsRow[],
  fetchedAt: UtcTimestamp,
  providerUpdatedAt: UtcTimestamp | null,
  rejectedRecords: number,
  now: number,
): NbaCacheRecord {
  const policy = timePolicy(target)
  const base = {
    cacheKey: cacheKeyForTarget(target, provider),
    provider,
    fetchedAt,
    providerUpdatedAt,
    rejectedRecords,
    expiresAt: now + policy.freshMs,
    staleUntil: now + policy.maxStaleMs,
    retryAt: null,
    refreshError: null,
  }
  if (target.type === 'standings') {
    return { ...base, capability: 'standings', data: data as readonly StandingsRow[] }
  }
  if (target.type === 'schedule') {
    const coverage = getScheduleCoverage(now)
    return { ...base, capability: 'schedule', data: data as readonly Game[], coverage }
  }
  return {
    ...base,
    capability: 'games',
    data: data as readonly Game[],
  }
}

function addGameDays(date: NbaGameDate, days: number): NbaGameDate {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + days))
    .toISOString()
    .slice(0, 10) as NbaGameDate
}

function getScheduleCoverage(now: number): GameDateCoverage {
  const from = parseNbaGameDate(getDateKeyInTimeZone(new Date(now), NBA_TIME_ZONE))
  if (!from) throw new Error('Unable to determine the NBA schedule coverage start date')
  return { from, through: addGameDays(from, 6) }
}

async function persistFailure(
  repository: NbaRepository,
  target: NbaRefreshTarget,
  provider: NbaProviderId,
  error: NbaApiError,
  retryAt: number,
): Promise<NbaCacheRecord | null> {
  const cacheKey = cacheKeyForTarget(target, provider)
  const cached = await repository.getCache(cacheKey)
  if (!cached) return null
  const updated = { ...cached, refreshError: error, retryAt }
  await repository.putCache(updated)
  return updated
}

export async function refreshNbaResource(
  target: NbaRefreshTarget,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
): Promise<RefreshOutcome> {
  const provider = getProviderForTarget(target, env)
  if (!provider) {
    const error = createNbaApiError('not_configured', null)
    return outcome(target, 'deferred', null, now, error)
  }

  const cacheKey = cacheKeyForTarget(target, provider)
  const request = providerRequest(target)
  if (!request) {
    return outcome(target, 'deferred', null, now, createNbaApiError('invalid_request', provider))
  }
  const previous = await repository.getCache(cacheKey)
  if (previous && now < previous.expiresAt) return outcome(target, 'up_to_date', previous, now)
  if (previous && previous.staleUntil <= now) await repository.deleteCache(cacheKey)
  if (previous?.retryAt && previous.retryAt > now) {
    return outcome(target, 'deferred', previous, now, previous.refreshError, previous.retryAt)
  }

  const apiKey = env.DUNKAPI_API_KEY
  const budget = budgetConfig(env, now)
  if (env.DUNKAPI_REFRESH_ENABLED !== 'true' || !apiKey || !budget) {
    const error = requestError('not_configured', provider)
    const retryAt = now + 60 * 60_000
    const cache = await persistFailure(repository, target, provider, error, retryAt)
    return outcome(target, 'deferred', cache, now, error, retryAt)
  }

  if (provider !== 'dunkapi') {
    const error = createNbaApiError('not_configured', provider)
    const cache = await persistFailure(repository, target, provider, error, now + RETRY_COOLDOWN_MS)
    return outcome(target, 'deferred', cache, now, error, now + RETRY_COOLDOWN_MS)
  }

  const capability = target.type === 'standings' ? 'standings' : 'games'
  const resolved = resolveProviderForCapability(
    capability,
    { [capability]: [provider] },
    Object.values(nbaProviderAdapters),
  )
  if (!resolved) {
    const error = createNbaApiError('not_configured', provider)
    const cache = await persistFailure(repository, target, provider, error, now + RETRY_COOLDOWN_MS)
    return outcome(target, 'deferred', cache, now, error, now + RETRY_COOLDOWN_MS)
  }

  const token = crypto.randomUUID()
  const lockExpiresAt = now + LOCK_LEASE_MS
  const locked = await repository.tryAcquireLock(cacheKey, token, now, lockExpiresAt)
  if (!locked)
    return outcome(
      target,
      'in_progress',
      await repository.getCache(cacheKey),
      now,
      null,
      lockExpiresAt,
    )

  try {
    const latest = await repository.getCache(cacheKey)
    if (latest && now < latest.expiresAt) return outcome(target, 'up_to_date', latest, now)

    const usage = await repository.getCreditUsage(budget.month)
    if (usage && usage.baselineCredits !== budget.baselineCredits) {
      const error = requestError('not_configured', provider)
      const cache = await persistFailure(repository, target, provider, error, now + 60 * 60_000)
      return outcome(target, 'deferred', cache, now, error, now + 60 * 60_000)
    }
    if ((usage?.appCredits ?? 0) + 2 > budget.appLimit) {
      const error = requestError('quota_exceeded', provider)
      const nextMonth = Date.UTC(
        Number(budget.month.slice(0, 4)),
        Number(budget.month.slice(5, 7)),
        1,
      )
      const cache = await persistFailure(repository, target, provider, error, nextMonth)
      return outcome(target, 'deferred', cache, now, error, nextMonth)
    }

    const rateAllowed = await repository.consumeRateSlot(
      `${provider}:upstream`,
      now,
      UPSTREAM_WINDOW_MS,
      UPSTREAM_RATE_LIMIT,
    )
    if (!rateAllowed) {
      const error = requestError('rate_limited', provider)
      const retryAt = Math.floor(now / UPSTREAM_WINDOW_MS) * UPSTREAM_WINDOW_MS + UPSTREAM_WINDOW_MS
      const cache = await persistFailure(repository, target, provider, error, retryAt)
      return outcome(target, 'deferred', cache, now, error, retryAt)
    }

    const reserved = await repository.reserveCredits(
      budget.month,
      budget.baselineCredits,
      request.credits,
      budget.appLimit,
    )
    if (!reserved) {
      const error = requestError('quota_exceeded', provider)
      const nextMonth = Date.UTC(
        Number(budget.month.slice(0, 4)),
        Number(budget.month.slice(5, 7)),
        1,
      )
      const cache = await persistFailure(repository, target, provider, error, nextMonth)
      return outcome(target, 'deferred', cache, now, error, nextMonth)
    }

    try {
      const payload = await postDunkApi(request, apiKey, fetcher, provider)
      const fetchedAt = asTimestamp(now)
      if (target.type === 'standings') {
        const normalizer = nbaProviderAdapters.dunkapi.capabilities.standings
        if (!normalizer) throw createNbaApiError('not_configured', provider)
        const snapshot = normalizer.normalize(payload, { fetchedAt, stale: false })
        if (snapshot.data.length === 0 && snapshot.meta.rejectedRecords > 0) {
          throw createNbaApiError('invalid_response', provider)
        }
        const record = createCacheRecord(
          target,
          provider,
          snapshot.data,
          snapshot.meta.fetchedAt,
          snapshot.meta.providerUpdatedAt,
          snapshot.meta.rejectedRecords,
          now,
        )
        await repository.putCache(record)
        return outcome(target, 'refreshed', record, now, null, null)
      }

      const normalizer = nbaProviderAdapters.dunkapi.capabilities.games
      if (!normalizer) throw createNbaApiError('not_configured', provider)
      const snapshot = normalizer.normalize(payload, { fetchedAt, stale: false })
      if (snapshot.data.length === 0 && snapshot.meta.rejectedRecords > 0) {
        throw createNbaApiError('invalid_response', provider)
      }
      // This product does not support in-game live data. Never publish a live label
      // from a provider snapshot that may be cached for hours or days.
      const dateMatches =
        target.type === 'games'
          ? snapshot.data.filter((game) => game.nbaGameDate === target.date)
          : snapshot.data
      if (target.type === 'games' && snapshot.data.length > 0 && dateMatches.length === 0) {
        throw createNbaApiError('invalid_response', provider)
      }
      const data = dateMatches.map((game) =>
        game.status === 'live' ? { ...game, status: 'unknown' as const } : game,
      )
      const record = createCacheRecord(
        target,
        provider,
        data,
        snapshot.meta.fetchedAt,
        snapshot.meta.providerUpdatedAt,
        snapshot.meta.rejectedRecords + snapshot.data.length - dateMatches.length,
        now,
      )
      await repository.putCache(record)
      return outcome(target, 'refreshed', record, now, null, null)
    } catch (cause) {
      const error =
        cause instanceof NbaAdapterError
          ? cause.details
          : isNbaApiError(cause)
            ? cause
            : createNbaApiError('upstream_unavailable', provider, true)
      const retryAt = now + RETRY_COOLDOWN_MS
      const cache = await persistFailure(repository, target, provider, error, retryAt)
      return outcome(target, 'deferred', cache, now, error, retryAt)
    }
  } finally {
    try {
      await repository.releaseLock(cacheKey, token)
    } catch {
      // Expiring lease is a safe fallback; never fail a successful refresh on unlock.
    }
  }
}

function isNbaApiError(value: unknown): value is NbaApiError {
  if (!value || typeof value !== 'object') return false
  const error = value as Partial<NbaApiError>
  return typeof error.code === 'string' && typeof error.message === 'string'
}

export async function runScheduledRefresh(
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
): Promise<RefreshOutcome[]> {
  const instant = new Date(now)
  const today = getDateKeyInTimeZone(instant, NBA_TIME_ZONE)
  const todayDate = parseNbaGameDate(today)
  if (!todayDate) return []
  const budget = budgetConfig(env, now)

  const previousUtcDay = new Date(now - 24 * 60 * 60_000)
  const previousDate = getDateKeyInTimeZone(previousUtcDay, NBA_TIME_ZONE)
  const previousNbaDate = parseNbaGameDate(previousDate)
  const seasonEndYear = parseSeasonEndYear(
    Number(todayDate.slice(0, 4)) + (Number(todayDate.slice(5, 7)) >= 8 ? 1 : 0),
  )
  if (!previousNbaDate || !seasonEndYear) return []

  const targets: NbaRefreshTarget[] = [
    { type: 'games', date: previousNbaDate },
    { type: 'standings', seasonEndYear },
  ]
  if (instant.getUTCDay() === 0 && budget) {
    const month = instant.toISOString().slice(0, 7)
    const plan = getRegularRefreshPlan(month, budget.appLimit)
    const sundayOrdinal = Math.floor((instant.getUTCDate() - 1) / 7) + 1
    if (plan.scheduleRefreshSundayOrdinals.includes(sundayOrdinal)) {
      targets.push({ type: 'schedule' })
    }
  }

  const results: RefreshOutcome[] = []
  for (const target of targets) {
    results.push(await refreshNbaResource(target, env, repository, fetcher, now))
  }
  await repository.cleanupExpired(now)
  return results
}
