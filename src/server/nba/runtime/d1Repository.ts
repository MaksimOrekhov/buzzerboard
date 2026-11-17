import type { NbaCacheRecord, NbaRepository, ProviderCooldown } from '@/server/nba/runtime/types'
import type { NbaProviderId } from '@/entities/nba/model'
import type { D1Database } from '@/server/nba/runtime/types'
import type { Game } from '@/entities/nba/model'
import { parseNbaGameDate } from '@/server/nba/adapters/normalizers/primitives'
import { isGameBoxScoreForGame, isGameRecord } from '@/shared/api/nba/gameDetailsGuards'

function isGameDateCoverage(value: unknown): value is { from: string; through: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const coverage = value as Record<string, unknown>
  const from = parseNbaGameDate(coverage.from)
  const through = parseNbaGameDate(coverage.through)
  return from !== null && through !== null && from <= through
}

function isNullableCount(value: unknown): boolean {
  return value === null || (Number.isSafeInteger(value) && Number(value) >= 0)
}

function isTeamSeasonData(value: unknown, teamId: string, seasonEndYear: number): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const profile = value as Record<string, unknown>
  const team = profile.team
  const stats = profile.stats
  if (!team || typeof team !== 'object' || !stats || typeof stats !== 'object') return false
  const teamRecord = team as Record<string, unknown>
  const statsRecord = stats as Record<string, unknown>
  const nullableNumber = (item: unknown) =>
    item === null || (typeof item === 'number' && Number.isFinite(item))
  return (
    teamRecord.id === teamId &&
    Number(profile.seasonEndYear) === seasonEndYear &&
    isNullableCount(profile.wins) &&
    isNullableCount(profile.losses) &&
    nullableNumber(profile.winPercentage) &&
    nullableNumber(profile.overallRank) &&
    nullableNumber(profile.conferenceRank) &&
    nullableNumber(profile.gamesBack) &&
    nullableNumber(statsRecord.gamesPlayed) &&
    nullableNumber(statsRecord.pointsPerGame) &&
    nullableNumber(statsRecord.fieldGoalPercentage) &&
    nullableNumber(statsRecord.threePointPercentage) &&
    nullableNumber(statsRecord.reboundsPerGame) &&
    nullableNumber(statsRecord.assistsPerGame) &&
    nullableNumber(statsRecord.turnoversPerGame) &&
    (profile.lastTen === null || Array.isArray(profile.lastTen)) &&
    Array.isArray(profile.leaders) &&
    (profile.nextGame === null || typeof profile.nextGame === 'object')
  )
}

function isTeamDirectoryData(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 30) return false
  const teamIds = new Set<string>()
  const providerIds = new Set<string>()
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    const row = entry as Record<string, unknown>
    if (
      typeof row.teamId !== 'string' ||
      !row.teamId.startsWith('nba:team:') ||
      typeof row.providerTeamId !== 'string' ||
      teamIds.has(row.teamId) ||
      providerIds.has(row.providerTeamId)
    )
      return false
    teamIds.add(row.teamId)
    providerIds.add(row.providerTeamId)
    return true
  })
}

function isCacheRecord(value: unknown): value is NbaCacheRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.cacheKey === 'string' &&
    (record.capability === 'games' ||
      record.capability === 'standings' ||
      record.capability === 'schedule' ||
      record.capability === 'boxScore' ||
      record.capability === 'teamSeason' ||
      record.capability === 'teamDirectory') &&
    (record.provider === 'dunkapi' || record.provider === 'espn' || record.provider === 'bbs') &&
    (record.capability === 'boxScore'
      ? typeof record.gameId === 'string' &&
        (record.data === null || isValidBoxScoreData(record.data, record.gameId))
      : record.capability === 'teamSeason'
        ? record.provider === 'bbs' &&
          typeof record.teamId === 'string' &&
          typeof record.providerTeamId === 'string' &&
          Number.isSafeInteger(record.seasonEndYear) &&
          isTeamSeasonData(record.data, record.teamId, Number(record.seasonEndYear))
        : record.capability === 'teamDirectory'
          ? record.provider === 'bbs' &&
            Number.isSafeInteger(record.seasonEndYear) &&
            isTeamDirectoryData(record.data)
          : Array.isArray(record.data)) &&
    (record.providerReferences === undefined ||
      (record.provider === 'bbs' &&
        typeof record.providerReferences === 'object' &&
        record.providerReferences !== null &&
        !Array.isArray(record.providerReferences) &&
        Object.values(record.providerReferences).every((value) => typeof value === 'string'))) &&
    typeof record.fetchedAt === 'string' &&
    (record.providerUpdatedAt === null || typeof record.providerUpdatedAt === 'string') &&
    typeof record.rejectedRecords === 'number' &&
    typeof record.expiresAt === 'number' &&
    typeof record.staleUntil === 'number' &&
    (record.retryAt === null || typeof record.retryAt === 'number') &&
    (record.refreshError === null || typeof record.refreshError === 'object') &&
    (record.capability !== 'schedule' || isGameDateCoverage(record.coverage))
  )
}

function isValidBoxScoreData(value: unknown, gameId: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const game = (value as Record<string, unknown>).game
  return isGameRecord(game) && game.id === gameId && isGameBoxScoreForGame(value, game as Game)
}

export class D1NbaRepository implements NbaRepository {
  constructor(private readonly database: D1Database) {}

  async getCache(cacheKey: string): Promise<NbaCacheRecord | null> {
    const row = await this.database
      .prepare('SELECT record_json FROM nba_cache WHERE cache_key = ?1')
      .bind(cacheKey)
      .first<{ record_json: string }>()
    if (!row || typeof row.record_json !== 'string') return null

    try {
      const parsed: unknown = JSON.parse(row.record_json)
      return isCacheRecord(parsed) && parsed.cacheKey === cacheKey ? parsed : null
    } catch {
      return null
    }
  }

  async putCache(record: NbaCacheRecord): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO nba_cache (cache_key, capability, provider, record_json, expires_at_ms, stale_until_ms, updated_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(cache_key) DO UPDATE SET
           capability = excluded.capability,
           provider = excluded.provider,
           record_json = excluded.record_json,
           expires_at_ms = excluded.expires_at_ms,
           stale_until_ms = excluded.stale_until_ms,
           updated_at_ms = excluded.updated_at_ms`,
      )
      .bind(
        record.cacheKey,
        record.capability,
        record.provider,
        JSON.stringify(record),
        record.expiresAt,
        record.staleUntil,
        Date.now(),
      )
      .run()
  }

  async deleteCache(cacheKey: string): Promise<void> {
    await this.database.prepare('DELETE FROM nba_cache WHERE cache_key = ?1').bind(cacheKey).run()
  }

  async tryAcquireLock(
    lockKey: string,
    token: string,
    now: number,
    expiresAt: number,
  ): Promise<boolean> {
    const row = await this.database
      .prepare(
        `INSERT INTO nba_refresh_locks (lock_key, token, lease_expires_at_ms)
         VALUES (?1, ?2, ?4)
         ON CONFLICT(lock_key) DO UPDATE SET
           token = excluded.token,
           lease_expires_at_ms = excluded.lease_expires_at_ms
         WHERE nba_refresh_locks.lease_expires_at_ms <= ?3
         RETURNING token`,
      )
      .bind(lockKey, token, now, expiresAt)
      .first<{ token: string }>()
    return row?.token === token
  }

  async releaseLock(lockKey: string, token: string): Promise<void> {
    await this.database
      .prepare('DELETE FROM nba_refresh_locks WHERE lock_key = ?1 AND token = ?2')
      .bind(lockKey, token)
      .run()
  }

  async renewLock(lockKey: string, token: string, now: number, expiresAt: number) {
    const result = await this.database
      .prepare(
        `UPDATE nba_refresh_locks SET lease_expires_at_ms = ?4
         WHERE lock_key = ?1 AND token = ?2 AND lease_expires_at_ms > ?3`,
      )
      .bind(lockKey, token, now, expiresAt)
      .run()
    return result.meta?.changes === 1
  }

  async putCacheIfLockOwned(record: NbaCacheRecord, lockKey: string, token: string, now: number) {
    const result = await this.database
      .prepare(
        `INSERT INTO nba_cache
          (cache_key, capability, provider, record_json, expires_at_ms, stale_until_ms, updated_at_ms)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
         WHERE EXISTS (
           SELECT 1 FROM nba_refresh_locks
           WHERE lock_key = ?8 AND token = ?9 AND lease_expires_at_ms > ?7
         )
         ON CONFLICT(cache_key) DO UPDATE SET
           capability = excluded.capability,
           provider = excluded.provider,
           record_json = excluded.record_json,
           expires_at_ms = excluded.expires_at_ms,
           stale_until_ms = excluded.stale_until_ms,
           updated_at_ms = excluded.updated_at_ms
         WHERE EXISTS (
           SELECT 1 FROM nba_refresh_locks
           WHERE lock_key = ?8 AND token = ?9 AND lease_expires_at_ms > ?7
         )`,
      )
      .bind(
        record.cacheKey,
        record.capability,
        record.provider,
        JSON.stringify(record),
        record.expiresAt,
        record.staleUntil,
        now,
        lockKey,
        token,
      )
      .run()
    return result.meta?.changes === 1
  }

  async getCreditUsage(month: string) {
    return this.database
      .prepare(
        'SELECT month, baseline_credits AS baselineCredits, app_credits AS appCredits, box_score_credits AS boxScoreCredits FROM nba_credit_usage WHERE month = ?1',
      )
      .bind(month)
      .first<{
        month: string
        baselineCredits: number
        appCredits: number
        boxScoreCredits: number
      }>()
  }

  async reserveCredits(
    month: string,
    baselineCredits: number,
    credits: number,
    monthlyAppLimit: number,
    boxScoreLimit: number,
    monthlyLimit: number,
  ) {
    return this.database
      .prepare(
        `INSERT INTO nba_credit_usage (month, baseline_credits, app_credits, box_score_credits)
         SELECT ?1, ?2, ?3, 0 WHERE ?3 <= ?4 AND ?2 + ?3 <= ?6
         ON CONFLICT(month) DO UPDATE SET app_credits = app_credits + excluded.app_credits
         WHERE nba_credit_usage.baseline_credits = excluded.baseline_credits
           AND nba_credit_usage.app_credits + excluded.app_credits <= ?4
           AND nba_credit_usage.box_score_credits <= ?5
           AND nba_credit_usage.baseline_credits + nba_credit_usage.app_credits
             + nba_credit_usage.box_score_credits + excluded.app_credits <= ?6
         RETURNING month, baseline_credits AS baselineCredits, app_credits AS appCredits, box_score_credits AS boxScoreCredits`,
      )
      .bind(month, baselineCredits, credits, monthlyAppLimit, boxScoreLimit, monthlyLimit)
      .first<{
        month: string
        baselineCredits: number
        appCredits: number
        boxScoreCredits: number
      }>()
  }

  async reserveBoxScoreCredits(
    month: string,
    baselineCredits: number,
    credits: number,
    boxScoreLimit: number,
    regularAppLimit: number,
    monthlyLimit: number,
  ) {
    return this.database
      .prepare(
        `INSERT INTO nba_credit_usage (month, baseline_credits, app_credits, box_score_credits)
         SELECT ?1, ?2, 0, ?3
         WHERE ?3 <= ?4 AND ?2 + ?3 + ?5 <= ?6
         ON CONFLICT(month) DO UPDATE SET box_score_credits = box_score_credits + excluded.box_score_credits
         WHERE nba_credit_usage.baseline_credits = excluded.baseline_credits
           AND nba_credit_usage.app_credits <= ?5
           AND nba_credit_usage.box_score_credits + excluded.box_score_credits <= ?4
           AND nba_credit_usage.baseline_credits + nba_credit_usage.app_credits
             + nba_credit_usage.box_score_credits + excluded.box_score_credits <= ?6
           AND nba_credit_usage.baseline_credits + ?5
             + nba_credit_usage.box_score_credits + excluded.box_score_credits <= ?6
         RETURNING month, baseline_credits AS baselineCredits, app_credits AS appCredits, box_score_credits AS boxScoreCredits`,
      )
      .bind(month, baselineCredits, credits, boxScoreLimit, regularAppLimit, monthlyLimit)
      .first<{
        month: string
        baselineCredits: number
        appCredits: number
        boxScoreCredits: number
      }>()
  }

  async consumeRateSlot(
    key: string,
    now: number,
    windowMs: number,
    limit: number,
  ): Promise<boolean> {
    const windowStart = Math.floor(now / windowMs) * windowMs
    const expiresAt = windowStart + windowMs
    const row = await this.database
      .prepare(
        `INSERT INTO nba_rate_limits (rate_key, window_start_ms, request_count, expires_at_ms)
         VALUES (?1, ?2, 1, ?3)
         ON CONFLICT(rate_key, window_start_ms) DO UPDATE SET request_count = request_count + 1
         WHERE nba_rate_limits.request_count < ?4
         RETURNING request_count`,
      )
      .bind(key, windowStart, expiresAt, limit)
      .first<{ request_count: number }>()
    return row !== null
  }

  async reserveBbsRequest(now: number, dailyLimit: number, minuteLimit: number) {
    const dayStart = Math.floor(now / (24 * 60 * 60_000)) * (24 * 60 * 60_000)
    const minuteExpiry = now + 60_000
    const dayKey = `bbs:utc-day:${new Date(dayStart).toISOString().slice(0, 10)}`
    const result = await this.database
      .prepare(
        `INSERT INTO nba_rate_limits (rate_key, window_start_ms, request_count, expires_at_ms)
         SELECT ?1, ?2, 1, ?3
         WHERE COALESCE((SELECT request_count FROM nba_rate_limits WHERE rate_key = ?1 AND window_start_ms = ?2), 0) < ?4
           AND COALESCE((SELECT SUM(request_count) FROM nba_rate_limits WHERE rate_key = ?5 AND expires_at_ms > ?9), 0) < ?7
         UNION ALL
         SELECT ?5, ?6, 1, ?8
         WHERE COALESCE((SELECT request_count FROM nba_rate_limits WHERE rate_key = ?1 AND window_start_ms = ?2), 0) < ?4
           AND COALESCE((SELECT SUM(request_count) FROM nba_rate_limits WHERE rate_key = ?5 AND expires_at_ms > ?9), 0) < ?7
         ON CONFLICT(rate_key, window_start_ms) DO UPDATE
           SET request_count = nba_rate_limits.request_count + 1
         RETURNING rate_key`,
      )
      .bind(
        dayKey,
        dayStart,
        dayStart + 24 * 60 * 60_000,
        dailyLimit,
        'bbs:upstream-minute',
        now,
        minuteLimit,
        minuteExpiry,
        now,
      )
      .run<{ rate_key: string }>()
    if ((result.meta?.changes ?? result.results?.length ?? 0) === 2)
      return { allowed: true, retryAt: null, errorCode: null } as const

    const day = await this.database
      .prepare(
        'SELECT request_count FROM nba_rate_limits WHERE rate_key = ?1 AND window_start_ms = ?2',
      )
      .bind(dayKey, dayStart)
      .first<{ request_count: number }>()
    if ((day?.request_count ?? 0) >= dailyLimit)
      return {
        allowed: false,
        retryAt: dayStart + 24 * 60 * 60_000,
        errorCode: 'quota_exceeded',
      } as const
    const minute = await this.database
      .prepare(
        'SELECT MIN(expires_at_ms) AS retryAt FROM nba_rate_limits WHERE rate_key = ?1 AND expires_at_ms > ?2',
      )
      .bind('bbs:upstream-minute', now)
      .first<{ retryAt: number | null }>()
    return {
      allowed: false,
      retryAt: minute?.retryAt ?? now + 60_000,
      errorCode: 'rate_limited',
    } as const
  }

  async getProviderCooldown(provider: NbaProviderId): Promise<ProviderCooldown | null> {
    return this.database
      .prepare(
        'SELECT retry_at_ms AS retryAt, error_code AS errorCode, remaining, reset_at_ms AS resetAt FROM nba_provider_cooldowns WHERE provider = ?1',
      )
      .bind(provider)
      .first<ProviderCooldown>()
  }

  async setProviderCooldown(provider: string, cooldown: ProviderCooldown, now: number) {
    await this.database
      .prepare(
        `INSERT INTO nba_provider_cooldowns (provider, retry_at_ms, error_code, updated_at_ms)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(provider) DO UPDATE SET
           retry_at_ms = MAX(nba_provider_cooldowns.retry_at_ms, excluded.retry_at_ms),
           error_code = CASE WHEN excluded.retry_at_ms >= nba_provider_cooldowns.retry_at_ms THEN excluded.error_code ELSE nba_provider_cooldowns.error_code END,
           updated_at_ms = excluded.updated_at_ms`,
      )
      .bind(provider, cooldown.retryAt, cooldown.errorCode, now)
      .run()
  }

  async clearProviderCooldown(provider: NbaProviderId, now: number) {
    await this.database
      .prepare(
        "UPDATE nba_provider_cooldowns SET retry_at_ms = 0, error_code = 'unknown', updated_at_ms = ?2 WHERE provider = ?1 AND retry_at_ms <= ?2",
      )
      .bind(provider, now)
      .run()
  }

  async reserveProviderBudget(provider: NbaProviderId, now: number, headroom: number) {
    const reserved = await this.database
      .prepare(
        `UPDATE nba_provider_cooldowns
         SET remaining = remaining - 1, updated_at_ms = ?2
         WHERE provider = ?1 AND reset_at_ms > ?2 AND remaining > ?3
         RETURNING remaining`,
      )
      .bind(provider, now, headroom)
      .first<{ remaining: number }>()
    if (reserved) return { allowed: true, retryAt: null, errorCode: null }
    const state = await this.getProviderCooldown(provider)
    const resetAt = state?.resetAt
    if (
      state?.remaining !== null &&
      state?.remaining !== undefined &&
      resetAt !== null &&
      resetAt !== undefined &&
      resetAt > now &&
      state.remaining <= headroom
    )
      return {
        allowed: false,
        retryAt: resetAt,
        errorCode:
          state.errorCode === 'quota_exceeded'
            ? ('quota_exceeded' as const)
            : ('rate_limited' as const),
      }
    return { allowed: true, retryAt: null, errorCode: null }
  }

  async recordProviderRemaining(
    provider: NbaProviderId,
    remaining: number,
    resetAt: number,
    now: number,
  ) {
    await this.database
      .prepare(
        `INSERT INTO nba_provider_cooldowns
          (provider, retry_at_ms, error_code, updated_at_ms, remaining, reset_at_ms)
         VALUES (?1, 0, 'rate_limited', ?2, ?3, ?4)
         ON CONFLICT(provider) DO UPDATE SET
           remaining = CASE
             WHEN nba_provider_cooldowns.reset_at_ms = excluded.reset_at_ms
               THEN MIN(COALESCE(nba_provider_cooldowns.remaining, excluded.remaining), excluded.remaining)
             ELSE excluded.remaining
           END,
           reset_at_ms = excluded.reset_at_ms,
           updated_at_ms = excluded.updated_at_ms`,
      )
      .bind(provider, now, remaining, resetAt)
      .run()
  }

  async cleanupExpired(now: number): Promise<void> {
    await this.database.batch([
      this.database.prepare('DELETE FROM nba_cache WHERE stale_until_ms <= ?1').bind(now),
      this.database
        .prepare('DELETE FROM nba_refresh_locks WHERE lease_expires_at_ms <= ?1')
        .bind(now),
      this.database.prepare('DELETE FROM nba_rate_limits WHERE expires_at_ms <= ?1').bind(now),
      this.database
        .prepare('DELETE FROM nba_credit_usage WHERE month < ?1')
        .bind(new Date(now).toISOString().slice(0, 7)),
    ])
  }
}
