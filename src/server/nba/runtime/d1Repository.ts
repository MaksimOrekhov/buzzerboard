import type { NbaCacheRecord, NbaRepository } from '@/server/nba/runtime/types'
import type { D1Database } from '@/server/nba/runtime/types'

function isCacheRecord(value: unknown): value is NbaCacheRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.cacheKey === 'string' &&
    (record.capability === 'games' ||
      record.capability === 'standings' ||
      record.capability === 'schedule') &&
    (record.provider === 'dunkapi' || record.provider === 'espn') &&
    Array.isArray(record.data) &&
    typeof record.fetchedAt === 'string' &&
    (record.providerUpdatedAt === null || typeof record.providerUpdatedAt === 'string') &&
    typeof record.rejectedRecords === 'number' &&
    typeof record.expiresAt === 'number' &&
    typeof record.staleUntil === 'number' &&
    (record.retryAt === null || typeof record.retryAt === 'number') &&
    (record.refreshError === null || typeof record.refreshError === 'object')
  )
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

  async getCreditUsage(month: string) {
    return this.database
      .prepare(
        'SELECT month, baseline_credits AS baselineCredits, app_credits AS appCredits FROM nba_credit_usage WHERE month = ?1',
      )
      .bind(month)
      .first<{ month: string; baselineCredits: number; appCredits: number }>()
  }

  async reserveCredits(
    month: string,
    baselineCredits: number,
    credits: number,
    monthlyAppLimit: number,
  ) {
    return this.database
      .prepare(
        `INSERT INTO nba_credit_usage (month, baseline_credits, app_credits)
         SELECT ?1, ?2, ?3 WHERE ?3 <= ?4
         ON CONFLICT(month) DO UPDATE SET app_credits = app_credits + excluded.app_credits
         WHERE nba_credit_usage.baseline_credits = excluded.baseline_credits
           AND nba_credit_usage.app_credits + excluded.app_credits <= ?4
         RETURNING month, baseline_credits AS baselineCredits, app_credits AS appCredits`,
      )
      .bind(month, baselineCredits, credits, monthlyAppLimit)
      .first<{ month: string; baselineCredits: number; appCredits: number }>()
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
