import fixtures from '../../docs/fixtures/nba-normalization-fixtures.json'
import gameDetailsFixture from '../../docs/fixtures/game-details.synthetic.json'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  Game,
  NbaApiError,
  NbaGameDate,
  SeasonEndYear,
  UtcTimestamp,
} from '@/entities/nba/model'
import { dunkApiAdapter } from '@/server/nba/adapters/dunkApi'
import { normalizeDunkGameDetails } from '@/server/nba/adapters/gameDetails'
import { normalizeBbsTeamSeason } from '@/server/nba/adapters/bbsTeams'
import { findNbaTeam } from '@/entities/nba/teamCatalog'
import {
  gameDetailsCacheKey,
  gamesCacheKey,
  scheduleCacheKey,
  standingsCacheKey,
  teamSeasonCacheKey,
} from '@/server/nba/runtime/cacheKeys'
import type {
  CreditUsage,
  NbaCacheRecord,
  NbaRepository,
  TeamSeasonCacheRecord,
  WorkerEnvironment,
} from '@/server/nba/runtime/types'
import {
  getRegularRefreshPlan,
  refreshNbaResource,
  runScheduledRefresh,
} from '@/server/nba/runtime/refresh'
import { createNbaWorker } from '@/server/worker'

const now = Date.parse('2026-11-16T12:00:00.000Z')
const context = { fetchedAt: new Date(now).toISOString(), stale: false }
const usageMonth = '2026-11'
const gameDate = '2026-11-16' as NbaGameDate
const seasonEndYear = 2027 as SeasonEndYear
const gameFixture = fixtures.dunkapi.gamesResponse.data.games[1]
const completedGameFixture = fixtures.dunkapi.gamesResponse.data.games[0]

class MemoryNbaRepository implements NbaRepository {
  readonly cache = new Map<string, NbaCacheRecord>()
  readonly locks = new Map<string, { token: string; expiresAt: number }>()
  readonly windows = new Map<string, { count: number; expiresAt: number }>()
  readonly bbsRequests: number[] = []
  readonly providerControls = new Map<
    string,
    {
      retryAt: number
      errorCode: NbaApiError['code']
      remaining?: number | null
      resetAt?: number | null
    }
  >()
  readonly usage = new Map<string, CreditUsage>()

  async getCache(cacheKey: string) {
    return this.cache.get(cacheKey) ?? null
  }

  async putCache(record: NbaCacheRecord) {
    this.cache.set(record.cacheKey, record)
  }

  async deleteCache(cacheKey: string) {
    this.cache.delete(cacheKey)
  }

  async tryAcquireLock(lockKey: string, token: string, currentTime: number, expiresAt: number) {
    const current = this.locks.get(lockKey)
    if (current && current.expiresAt > currentTime) return false
    this.locks.set(lockKey, { token, expiresAt })
    return true
  }

  async renewLock(lockKey: string, token: string, currentTime: number, expiresAt: number) {
    const current = this.locks.get(lockKey)
    if (!current || current.token !== token || current.expiresAt <= currentTime) return false
    this.locks.set(lockKey, { token, expiresAt })
    return true
  }

  async putCacheIfLockOwned(record: NbaCacheRecord, lockKey: string, token: string, now: number) {
    const current = this.locks.get(lockKey)
    if (!current || current.token !== token || current.expiresAt <= now) return false
    this.cache.set(record.cacheKey, record)
    return true
  }

  async releaseLock(lockKey: string, token: string) {
    if (this.locks.get(lockKey)?.token === token) this.locks.delete(lockKey)
  }

  async getCreditUsage(month: string) {
    return this.usage.get(month) ?? null
  }

  async reserveCredits(
    month: string,
    baselineCredits: number,
    credits: number,
    regularAppLimit: number,
    boxScoreLimit: number,
    monthlyLimit: number,
  ) {
    const current = this.usage.get(month)
    if (current && current.baselineCredits !== baselineCredits) return null
    const appCredits = (current?.appCredits ?? 0) + credits
    const boxScoreCredits = current?.boxScoreCredits ?? 0
    if (
      appCredits > regularAppLimit ||
      boxScoreCredits > boxScoreLimit ||
      baselineCredits + appCredits + boxScoreCredits > monthlyLimit
    )
      return null
    const updated = {
      month,
      baselineCredits,
      appCredits,
      boxScoreCredits: current?.boxScoreCredits ?? 0,
    }
    this.usage.set(month, updated)
    return updated
  }

  async reserveBoxScoreCredits(
    month: string,
    baselineCredits: number,
    credits: number,
    boxScoreLimit: number,
    regularAppLimit: number,
    monthlyLimit: number,
  ) {
    const current = this.usage.get(month)
    if (current && current.baselineCredits !== baselineCredits) return null
    const boxScoreCredits = (current?.boxScoreCredits ?? 0) + credits
    if (
      (current?.appCredits ?? 0) > regularAppLimit ||
      boxScoreCredits > boxScoreLimit ||
      baselineCredits + (current?.appCredits ?? 0) + boxScoreCredits > monthlyLimit ||
      baselineCredits + regularAppLimit + boxScoreCredits > monthlyLimit
    )
      return null
    const updated = {
      month,
      baselineCredits,
      appCredits: current?.appCredits ?? 0,
      boxScoreCredits,
    }
    this.usage.set(month, updated)
    return updated
  }

  async consumeRateSlot(key: string, currentTime: number, windowMs: number, limit: number) {
    const windowStart = Math.floor(currentTime / windowMs) * windowMs
    const windowKey = `${key}:${windowStart}`
    const current = this.windows.get(windowKey)
    if (current && current.count >= limit) return false
    this.windows.set(windowKey, {
      count: (current?.count ?? 0) + 1,
      expiresAt: windowStart + windowMs,
    })
    return true
  }

  async reserveBbsRequest(currentTime: number, dailyLimit: number, minuteLimit: number) {
    const dayStart = Math.floor(currentTime / 86_400_000) * 86_400_000
    const dayKey = `bbs-day:${dayStart}`
    const currentDay = this.windows.get(dayKey)?.count ?? 0
    if (currentDay >= dailyLimit)
      return {
        allowed: false,
        retryAt: dayStart + 86_400_000,
        errorCode: 'quota_exceeded' as const,
      }
    const minute = this.bbsRequests.filter((time) => time > currentTime - 60_000)
    if (minute.length >= minuteLimit)
      return { allowed: false, retryAt: minute[0]! + 60_000, errorCode: 'rate_limited' as const }
    this.windows.set(dayKey, { count: currentDay + 1, expiresAt: dayStart + 86_400_000 })
    this.bbsRequests.push(currentTime)
    return { allowed: true, retryAt: null, errorCode: null }
  }

  async getProviderCooldown(provider: string) {
    return this.providerControls.get(provider) ?? null
  }

  async setProviderCooldown(
    provider: string,
    cooldown: { retryAt: number; errorCode: NbaApiError['code'] },
  ) {
    const existing = this.providerControls.get(provider)
    this.providerControls.set(
      provider,
      existing && existing.retryAt > cooldown.retryAt ? existing : cooldown,
    )
  }

  async clearProviderCooldown(provider: string, currentTime: number) {
    const current = this.providerControls.get(provider)
    if (current && current.retryAt <= currentTime) this.providerControls.delete(provider)
  }

  async reserveProviderBudget(provider: string, currentTime: number, headroom: number) {
    const state = this.providerControls.get(provider)
    if (
      state?.remaining !== null &&
      state?.remaining !== undefined &&
      state.resetAt &&
      state.resetAt > currentTime
    ) {
      if (state.remaining <= headroom)
        return { allowed: false, retryAt: state.resetAt, errorCode: state.errorCode }
      state.remaining -= 1
    }
    return { allowed: true, retryAt: null, errorCode: null }
  }

  async recordProviderRemaining(
    provider: string,
    remaining: number,
    resetAt: number,
    updatedAt: number,
  ) {
    const state = this.providerControls.get(provider)
    this.providerControls.set(provider, {
      retryAt: state?.retryAt ?? 0,
      errorCode: state?.errorCode ?? 'rate_limited',
      remaining:
        state?.resetAt === resetAt && state.remaining !== null && state.remaining !== undefined
          ? Math.min(state.remaining, remaining)
          : remaining,
      resetAt,
    })
    void updatedAt
  }

  async cleanupExpired(currentTime: number) {
    for (const [key, value] of this.cache) {
      if (value.staleUntil <= currentTime) this.cache.delete(key)
    }
    for (const [key, value] of this.locks) {
      if (value.expiresAt <= currentTime) this.locks.delete(key)
    }
    for (const [key, value] of this.windows) {
      if (value.expiresAt <= currentTime) this.windows.delete(key)
    }
  }
}

function createGameRecord(
  date: string,
  expiresAt = now + 60_000,
  refreshError: NbaApiError | null = null,
): Extract<NbaCacheRecord, { capability: 'games' }> {
  const normalizer = dunkApiAdapter.capabilities.games
  if (!normalizer) throw new Error('DunkAPI games normalizer missing')
  const snapshot = normalizer.normalize({ games: [gameFixture] }, context)
  return {
    cacheKey: gamesCacheKey('dunkapi', date),
    capability: 'games',
    provider: 'dunkapi',
    data: snapshot.data,
    fetchedAt: snapshot.meta.fetchedAt,
    providerUpdatedAt: null,
    rejectedRecords: 0,
    expiresAt,
    staleUntil: now + 7 * 24 * 60 * 60_000,
    retryAt: null,
    refreshError,
  }
}

function createCompletedGameRecord() {
  const normalizer = dunkApiAdapter.capabilities.games
  if (!normalizer) throw new Error('DunkAPI games normalizer missing')
  const snapshot = normalizer.normalize({ games: [completedGameFixture] }, context)
  return {
    cacheKey: gamesCacheKey('dunkapi', '2026-11-15'),
    capability: 'games' as const,
    provider: 'dunkapi' as const,
    data: snapshot.data,
    fetchedAt: snapshot.meta.fetchedAt,
    providerUpdatedAt: null,
    rejectedRecords: 0,
    expiresAt: now + 60_000,
    staleUntil: now + 7 * 24 * 60 * 60_000,
    retryAt: null,
    refreshError: null,
  }
}

function createBoxScoreRecord(game: Game) {
  return {
    cacheKey: gameDetailsCacheKey('dunkapi', game.id),
    capability: 'boxScore' as const,
    gameId: game.id,
    provider: 'dunkapi' as const,
    data: normalizeDunkGameDetails(gameDetailsFixture, game),
    fetchedAt: context.fetchedAt as UtcTimestamp,
    providerUpdatedAt: null,
    rejectedRecords: 0,
    expiresAt: now + 60_000,
    staleUntil: now + 7 * 24 * 60 * 60_000,
    retryAt: null,
    refreshError: null,
  }
}

function createScheduleRecord(
  from: string,
  through: string,
  data: readonly Game[] = [],
): NbaCacheRecord {
  return {
    cacheKey: scheduleCacheKey('dunkapi'),
    capability: 'schedule',
    provider: 'dunkapi',
    data,
    coverage: {
      from: from as NbaGameDate,
      through: through as NbaGameDate,
    },
    fetchedAt: context.fetchedAt as UtcTimestamp,
    providerUpdatedAt: null,
    rejectedRecords: 0,
    expiresAt: now + 60_000,
    staleUntil: now + 14 * 24 * 60 * 60_000,
    retryAt: null,
    refreshError: null,
  }
}

const env: WorkerEnvironment = {
  DUNKAPI_REFRESH_ENABLED: 'true',
  DUNKAPI_API_KEY: 'server-test-key',
  MANUAL_REFRESH_TOKEN: 'server-admin-test-token',
  DUNKAPI_MONTHLY_CREDIT_LIMIT: '500',
  DUNKAPI_APP_MONTHLY_CREDIT_BUDGET: '128',
  DUNKAPI_CREDITS_USED_BASELINE: '27',
  DUNKAPI_CREDIT_BASELINE_MONTH: usageMonth,
  DUNKAPI_BOX_SCORE_MONTHLY_CREDIT_BUDGET: '5',
  NBA_GAMES_PROVIDER_ORDER: 'dunkapi',
  NBA_STANDINGS_PROVIDER_ORDER: 'dunkapi',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function createWorker(repository: MemoryNbaRepository, fetcher = vi.fn<typeof fetch>()) {
  return createNbaWorker({
    repository,
    fetcher,
    now: () => now,
    requestId: () => 'test-request-id',
  })
}

afterEach(() => vi.restoreAllMocks())

describe('NBA Worker cache API', () => {
  it('reports health only when the bound D1 can answer a read-only query', async () => {
    const worker = createWorker(new MemoryNbaRepository())
    const database = {
      prepare: vi.fn(() => ({ first: vi.fn().mockResolvedValue({ ok: 1 }) })),
    }
    const response = await worker.fetch(new Request('https://buzzerboard.test/api/health'), {
      ...env,
      NBA_DB: database as never,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(database.prepare).toHaveBeenCalledWith('SELECT 1 AS ok')
  })

  it('fails closed when the health check cannot reach D1', async () => {
    const worker = createWorker(new MemoryNbaRepository())
    const database = {
      prepare: vi.fn(() => ({ first: vi.fn().mockRejectedValue(new Error('private detail')) })),
    }
    const response = await worker.fetch(new Request('https://buzzerboard.test/api/health'), {
      ...env,
      NBA_DB: database as never,
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'unavailable' })
  })

  it('serves game detail fallback from the D1 game snapshot without making an upstream request', async () => {
    const repository = new MemoryNbaRepository()
    repository.cache.set(gamesCacheKey('dunkapi', '2026-11-15'), createCompletedGameRecord())
    const fetcher = vi.fn<typeof fetch>()
    const worker = createWorker(repository, fetcher)
    const response = await worker.fetch(
      new Request(
        'https://buzzerboard.test/api/games/dunkapi%3Agame%3Adunk-game-001?date=2026-11-15',
      ),
      env,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        game: { id: 'dunkapi:game:dunk-game-001', score: { home: 112, away: 108 } },
        boxScore: null,
      },
      boxScoreAvailability: 'unavailable',
      meta: { source: 'dunkapi' },
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each(['score', 'date', 'teams', 'status'] as const)(
    'returns the corrected base game without an incompatible box score after a %s correction',
    async (field) => {
      const repository = new MemoryNbaRepository()
      const originalRecord = createCompletedGameRecord()
      const originalGame = originalRecord.data[0] as Game
      repository.cache.set(
        gameDetailsCacheKey('dunkapi', originalGame.id),
        createBoxScoreRecord(originalGame),
      )

      const requestDate = field === 'date' ? '2026-11-16' : '2026-11-15'
      const correctedGame: Game =
        field === 'score'
          ? {
              ...originalGame,
              score: { ...originalGame.score, home: originalGame.score.home! + 1 },
            }
          : field === 'date'
            ? { ...originalGame, nbaGameDate: requestDate as NbaGameDate }
            : field === 'teams'
              ? {
                  ...originalGame,
                  homeTeam: {
                    ...originalGame.homeTeam,
                    id: 'nba:team:ORL' as Game['homeTeam']['id'],
                  },
                }
              : { ...originalGame, status: 'scheduled' }
      repository.cache.set(gamesCacheKey('dunkapi', requestDate), {
        ...originalRecord,
        cacheKey: gamesCacheKey('dunkapi', requestDate),
        data: [correctedGame],
      })
      const fetcher = vi.fn<typeof fetch>()
      const worker = createWorker(repository, fetcher)
      const response = await worker.fetch(
        new Request(
          `https://buzzerboard.test/api/games/${encodeURIComponent(originalGame.id)}?date=${requestDate}`,
        ),
        env,
      )
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload).toMatchObject({
        data: { game: { nbaGameDate: requestDate }, boxScore: null },
        boxScoreAvailability: 'snapshot_mismatch',
        boxScoreMeta: null,
      })
      expect(fetcher).not.toHaveBeenCalled()
    },
  )

  it('safely rejects a malformed nested cached box score and keeps the base game available', async () => {
    const repository = new MemoryNbaRepository()
    const gameRecord = createCompletedGameRecord()
    const game = gameRecord.data[0] as Game
    repository.cache.set(gamesCacheKey('dunkapi', '2026-11-15'), gameRecord)
    repository.cache.set(gameDetailsCacheKey('dunkapi', game.id), {
      ...createBoxScoreRecord(game),
      data: { game: null, teams: 'broken', players: null },
    } as unknown as NbaCacheRecord)
    const fetcher = vi.fn<typeof fetch>()
    const worker = createWorker(repository, fetcher)

    const response = await worker.fetch(
      new Request(
        `https://buzzerboard.test/api/games/${encodeURIComponent(game.id)}?date=2026-11-15`,
      ),
      env,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { game: { id: game.id }, boxScore: null },
      boxScoreAvailability: 'snapshot_mismatch',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects a detail request when the requested date does not identify the cached game', async () => {
    const repository = new MemoryNbaRepository()
    repository.cache.set(gamesCacheKey('dunkapi', '2026-11-15'), createCompletedGameRecord())
    const worker = createWorker(repository)

    const response = await worker.fetch(
      new Request(
        'https://buzzerboard.test/api/games/dunkapi%3Agame%3Adunk-game-001?date=2026-11-16',
      ),
      env,
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { code: 'cache_miss' } })
  })

  it('requires the manual token and leaves the box-score budget disabled by default', async () => {
    const repository = new MemoryNbaRepository()
    repository.cache.set(gamesCacheKey('dunkapi', '2026-11-15'), createCompletedGameRecord())
    const fetcher = vi.fn<typeof fetch>()
    const worker = createWorker(repository, fetcher)
    const path = 'https://buzzerboard.test/api/games/dunkapi%3Agame%3Adunk-game-001/refresh'
    const body = JSON.stringify({ date: '2026-11-15' })

    const unauthorized = await worker.fetch(
      new Request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
      env,
    )
    expect(unauthorized.status).toBe(401)
    const disabled = await worker.fetch(
      new Request(path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer server-admin-test-token',
        },
        body,
      }),
      env,
    )
    expect(disabled.status).toBe(503)
    expect(fetcher).not.toHaveBeenCalled()
    expect(repository.usage.size).toBe(0)
  })

  it('refreshes one validated box score, then serves repeated reads without additional credit or provider calls', async () => {
    const repository = new MemoryNbaRepository()
    repository.cache.set(gamesCacheKey('dunkapi', '2026-11-15'), createCompletedGameRecord())
    repository.usage.set(usageMonth, {
      month: usageMonth,
      baselineCredits: 27,
      appCredits: 128,
      boxScoreCredits: 0,
    })
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(gameDetailsFixture))
    const worker = createWorker(repository, fetcher)
    const path = 'https://buzzerboard.test/api/games/dunkapi%3Agame%3Adunk-game-001'
    const write = await worker.fetch(
      new Request(`${path}/refresh`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer server-admin-test-token',
        },
        body: JSON.stringify({ date: '2026-11-15' }),
      }),
      {
        ...env,
        DUNKAPI_BOX_SCORE_REFRESH_ENABLED: 'true',
        DUNKAPI_BOX_SCORE_MONTHLY_CREDIT_BUDGET: '5',
      },
    )

    expect(write.status).toBe(200)
    expect(await write.json()).toMatchObject({
      state: 'refreshed',
      target: { gameId: 'dunkapi:game:dunk-game-001' },
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://mcp.dunkapi.com/v1/get_game')
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ league: 'nba', game_id: 'dunk-game-001' }),
    )
    expect(repository.usage.get(usageMonth)).toMatchObject({
      baselineCredits: 27,
      appCredits: 128,
      boxScoreCredits: 5,
    })

    const read = await worker.fetch(new Request(`${path}?date=2026-11-15`), env)
    expect(read.status).toBe(200)
    expect(await read.json()).toMatchObject({
      data: {
        boxScore: {
          teams: [{ points: 108 }, { points: 112 }],
          players: expect.arrayContaining([
            expect.objectContaining({ points: 24 }),
            expect.objectContaining({ didNotPlay: true }),
          ]),
        },
      },
      boxScoreMeta: { isStale: false },
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(repository.usage.get(usageMonth)?.boxScoreCredits).toBe(5)
  })
  it('serves a fresh shared cache snapshot without contacting a provider', async () => {
    const repository = new MemoryNbaRepository()
    repository.cache.set(gamesCacheKey('dunkapi', '2026-11-16'), createGameRecord('2026-11-16'))
    const fetcher = vi.fn<typeof fetch>()
    const worker = createWorker(repository, fetcher)
    const response = await worker.fetch(
      new Request('https://buzzerboard.test/api/games?date=2026-11-16'),
      env,
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      meta: { source: 'dunkapi', fetchedAt: context.fetchedAt, isStale: false },
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('serves stale cache with its last sanitized refresh error and never refreshes on GET', async () => {
    const repository = new MemoryNbaRepository()
    repository.cache.set(
      gamesCacheKey('dunkapi', '2026-11-16'),
      createGameRecord('2026-11-16', now - 1, {
        code: 'timeout',
        message: 'Поставщик данных NBA не ответил вовремя.',
        retryable: true,
        provider: 'dunkapi',
        upstreamStatus: null,
      }),
    )
    const fetcher = vi.fn<typeof fetch>()
    const worker = createWorker(repository, fetcher)
    const response = await worker.fetch(
      new Request('https://buzzerboard.test/api/games?date=2026-11-16'),
      env,
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('warning')).toContain('Response is stale')
    expect(payload).toMatchObject({ meta: { isStale: true, refreshError: { code: 'timeout' } } })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('returns a typed error on cache miss instead of calling an upstream provider', async () => {
    const repository = new MemoryNbaRepository()
    const fetcher = vi.fn<typeof fetch>()
    const worker = createWorker(repository, fetcher)
    const response = await worker.fetch(
      new Request('https://buzzerboard.test/api/standings?seasonEndYear=2027'),
      env,
    )
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload).toMatchObject({ error: { code: 'cache_miss', provider: 'dunkapi' } })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('serves the 30-team directory and individual BBS profiles from D1 only', async () => {
    const repository = new MemoryNbaRepository()
    const reference = findNbaTeam('BOS')!
    const normalized = normalizeBbsTeamSeason(
      {
        team_meta: { id: 'synthetic-bbs-team-id', abbreviation: 'BOS', name: 'Boston Celtics' },
        season: '2026-27',
        record: '31-15',
        standings: { overall_rank: 3, conference_rank: null, games_back: 2 },
        home_away_splits: { home: { wins: 18, losses: 5 }, away: null },
        season_stats: {
          games_played: 46,
          ppg: 118.3,
          fg_pct: 47.1,
          three_pt_pct: 37.1,
          reb_pg: 44.2,
          ast_pg: 28.4,
          tov_pg: 12.1,
        },
        last_10: null,
        top_players: [],
        next_game: {
          match_id: 'synthetic-next-game',
          kickoff_utc: '2026-11-19T00:30:00.000Z',
          is_home: true,
          opponent: 'NYK',
        },
      },
      reference,
      seasonEndYear,
    )
    const record: TeamSeasonCacheRecord = {
      cacheKey: teamSeasonCacheKey('bbs', reference.team.id, seasonEndYear),
      capability: 'teamSeason',
      provider: 'bbs',
      teamId: reference.team.id,
      seasonEndYear,
      providerTeamId: normalized.providerTeamId,
      data: normalized.data,
      fetchedAt: context.fetchedAt as UtcTimestamp,
      providerUpdatedAt: null,
      rejectedRecords: 0,
      expiresAt: now + 60_000,
      staleUntil: now + 7 * 24 * 60 * 60_000,
      retryAt: null,
      refreshError: null,
    }
    repository.cache.set(record.cacheKey, record)
    const date = '2026-11-18' as NbaGameDate
    const gamesKey = gamesCacheKey('bbs', date)
    const {
      data: [baseGame],
    } = createGameRecord(date)
    const nextGame: Game = {
      ...baseGame!,
      id: 'bbs:game:synthetic-next-game' as Game['id'],
      provider: 'bbs',
      providerId: 'synthetic-next-game' as Game['providerId'],
      nbaGameDate: date,
      startsAt: '2026-11-19T00:30:00.000Z' as UtcTimestamp,
      status: 'scheduled',
      seasonEndYear,
      homeTeam: reference.team,
      awayTeam: findNbaTeam('NYK')!.team,
      score: { home: null, away: null },
    }
    const gameRecord = {
      ...createGameRecord(date),
      cacheKey: gamesKey,
      provider: 'bbs' as const,
      data: [nextGame],
    }
    repository.cache.set(gamesKey, gameRecord)
    const fetcher = vi.fn<typeof fetch>()
    const worker = createWorker(repository, fetcher)

    const directoryResponse = await worker.fetch(
      new Request('https://buzzerboard.test/api/teams?seasonEndYear=2027'),
      env,
    )
    const directory = await directoryResponse.json()
    expect(directoryResponse.status).toBe(200)
    expect(directory.data).toHaveLength(30)
    expect(directory.coverage).toEqual({ available: 1, total: 30 })
    expect(directory.data.find((entry: { code: string }) => entry.code === 'BOS')).toMatchObject({
      team: { id: 'nba:team:BOS', providerId: null },
      season: { wins: 31, losses: 15, overallRank: 3, stats: { pointsPerGame: 118.3 } },
    })

    const profileResponse = await worker.fetch(
      new Request('https://buzzerboard.test/api/teams/BOS?seasonEndYear=2027'),
      env,
    )
    expect(profileResponse.status).toBe(200)
    const profilePayload = await profileResponse.json()
    expect(profilePayload).toMatchObject({
      data: {
        team: { id: 'nba:team:BOS', providerId: null },
        winPercentage: 31 / 46,
        nextGame: {
          gameId: nextGame.id,
          nbaGameDate: date,
          startsAt: nextGame.startsAt,
          opponentCode: 'NYK',
          isHome: true,
        },
      },
      meta: { source: 'bbs', isStale: false },
    })
    expect(profilePayload.data.stats.fieldGoalPercentage).toBeCloseTo(0.471)
    const linkedGameResponse = await worker.fetch(
      new Request(`https://buzzerboard.test/api/games/${nextGame.id}?date=${date}`),
      env,
    )
    expect(linkedGameResponse.status).toBe(200)

    for (const [reason, variant] of Object.entries({
      stale: { ...gameRecord, expiresAt: now },
      finished: { ...gameRecord, data: [{ ...nextGame, status: 'final' as const }] },
      past: { ...gameRecord, data: [{ ...nextGame, startsAt: context.fetchedAt as UtcTimestamp }] },
      wrongDate: { ...gameRecord, data: [{ ...nextGame, nbaGameDate: gameDate }] },
      wrongSeason: { ...gameRecord, data: [{ ...nextGame, seasonEndYear: null }] },
      wrongTeam: { ...gameRecord, data: [{ ...nextGame, homeTeam: findNbaTeam('ATL')!.team }] },
      wrongOpponent: { ...gameRecord, data: [{ ...nextGame, awayTeam: findNbaTeam('ATL')!.team }] },
      wrongVenue: {
        ...gameRecord,
        data: [{ ...nextGame, homeTeam: nextGame.awayTeam, awayTeam: nextGame.homeTeam }],
      },
    })) {
      repository.cache.set(gamesKey, variant)
      const response = await worker.fetch(
        new Request('https://buzzerboard.test/api/teams/BOS?seasonEndYear=2027'),
        env,
      )
      expect((await response.json()).data.nextGame, reason).toBeNull()
    }
    repository.cache.delete(gamesKey)
    const response = await worker.fetch(
      new Request('https://buzzerboard.test/api/teams/BOS?seasonEndYear=2027'),
      env,
    )
    expect((await response.json()).data.nextGame).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('returns an empty day only when the exact-date snapshot confirms no games', async () => {
    const repository = new MemoryNbaRepository()
    const exactDate = createGameRecord('2026-11-18')
    repository.cache.set(gamesCacheKey('dunkapi', '2026-11-18'), { ...exactDate, data: [] })
    const fetcher = vi.fn<typeof fetch>()
    const worker = createWorker(repository, fetcher)
    const response = await worker.fetch(
      new Request('https://buzzerboard.test/api/games?date=2026-11-18'),
      env,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: [], meta: { source: 'dunkapi' } })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('serves matching schedule games within the recorded request window', async () => {
    const repository = new MemoryNbaRepository()
    const cachedGame = createGameRecord('2026-11-18').data[0] as Game
    repository.cache.set(
      scheduleCacheKey('dunkapi'),
      createScheduleRecord('2026-11-16', '2026-11-22', [
        { ...cachedGame, nbaGameDate: '2026-11-18' as NbaGameDate },
      ]),
    )
    const fetcher = vi.fn<typeof fetch>()
    const worker = createWorker(repository, fetcher)
    const response = await worker.fetch(
      new Request('https://buzzerboard.test/api/games?date=2026-11-18'),
      env,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: [{ nbaGameDate: '2026-11-18' }] })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not treat missing schedule rows inside its request window as a confirmed empty day', async () => {
    const repository = new MemoryNbaRepository()
    repository.cache.set(
      scheduleCacheKey('dunkapi'),
      createScheduleRecord('2026-11-16', '2026-11-22'),
    )
    const fetcher = vi.fn<typeof fetch>()
    const worker = createWorker(repository, fetcher)
    const response = await worker.fetch(
      new Request('https://buzzerboard.test/api/games?date=2026-11-18'),
      env,
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: { code: 'cache_miss', provider: 'dunkapi' },
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('returns cache_miss outside the schedule coverage instead of a false empty day', async () => {
    const repository = new MemoryNbaRepository()
    repository.cache.set(
      scheduleCacheKey('dunkapi'),
      createScheduleRecord('2026-11-16', '2026-11-22'),
    )
    const fetcher = vi.fn<typeof fetch>()
    const worker = createWorker(repository, fetcher)
    const response = await worker.fetch(
      new Request('https://buzzerboard.test/api/games?date=2026-11-23'),
      env,
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: { code: 'cache_miss', provider: 'dunkapi' },
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('validates NBA dates and season years before reading the cache', async () => {
    const worker = createWorker(new MemoryNbaRepository())

    const badDate = await worker.fetch(
      new Request('https://buzzerboard.test/api/games?date=2026-02-30'),
      env,
    )
    const badSeason = await worker.fetch(
      new Request('https://buzzerboard.test/api/standings?seasonEndYear=20x7'),
      env,
    )
    expect(badDate.status).toBe(400)
    expect(badSeason.status).toBe(400)
  })

  it('keeps news unavailable until a provider is selected', async () => {
    const worker = createWorker(new MemoryNbaRepository())
    const response = await worker.fetch(new Request('https://buzzerboard.test/api/news'), env)

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: { code: 'not_configured', provider: null },
    })
  })
})

describe('protected NBA revalidation', () => {
  it('rejects missing or incorrect manual credentials without spending credits', async () => {
    const repository = new MemoryNbaRepository()
    const fetcher = vi.fn<typeof fetch>()
    const worker = createWorker(repository, fetcher)
    const response = await worker.fetch(
      new Request('https://buzzerboard.test/api/revalidate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer wrong' },
        body: JSON.stringify({ resource: { type: 'games', date: '2026-11-16' } }),
      }),
      env,
    )

    expect(response.status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
    expect(repository.usage.size).toBe(0)
  })

  it('uses a server-only key, reserves cost, normalizes the response, and caches it', async () => {
    const repository = new MemoryNbaRepository()
    const source = fixtures.dunkapi.gamesResponse.data.games[1]
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: { games: [source] } }))
    const worker = createWorker(repository, fetcher)
    const response = await worker.fetch(
      new Request('https://buzzerboard.test/api/revalidate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer server-admin-test-token',
        },
        body: JSON.stringify({ resource: { type: 'games', date: '2026-11-16' } }),
      }),
      env,
    )
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toMatchObject({ state: 'refreshed', isStale: false, error: null })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://mcp.dunkapi.com/v1/list_games')
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-api-key': 'server-test-key' })
    expect(fetcher.mock.calls[0]?.[1]?.body).toContain('"date":"2026-11-16"')
    expect(repository.usage.get(usageMonth)).toMatchObject({ baselineCredits: 27, appCredits: 2 })
    const cached = await repository.getCache(gamesCacheKey('dunkapi', '2026-11-16'))
    expect(cached).toMatchObject({ capability: 'games', data: [{ status: 'scheduled' }] })
    expect(JSON.stringify(result)).not.toContain('server-test-key')
    expect(JSON.stringify(result)).not.toContain('server-admin-test-token')
  })

  it('fails closed at the app credit cap before any network call', async () => {
    const repository = new MemoryNbaRepository()
    repository.usage.set(usageMonth, {
      month: usageMonth,
      baselineCredits: 27,
      appCredits: 128,
      boxScoreCredits: 0,
    })
    const fetcher = vi.fn<typeof fetch>()
    const result = await refreshNbaResource(
      { type: 'games', date: gameDate },
      env,
      repository,
      fetcher,
      now,
    )

    expect(result.error?.code).toBe('quota_exceeded')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fails closed for regular and box-score refreshes when the changed shared allocations exceed the cap', async () => {
    const repository = new MemoryNbaRepository()
    repository.cache.set(gamesCacheKey('dunkapi', '2026-11-15'), createCompletedGameRecord())
    const fetcher = vi.fn<typeof fetch>()
    const incompatibleBudget = {
      ...env,
      DUNKAPI_MONTHLY_CREDIT_LIMIT: '159',
    }

    const regular = await refreshNbaResource(
      { type: 'games', date: '2026-11-15' as NbaGameDate },
      incompatibleBudget,
      new MemoryNbaRepository(),
      fetcher,
      now,
    )
    const worker = createWorker(repository, fetcher)
    const boxScore = await worker.fetch(
      new Request('https://buzzerboard.test/api/games/dunkapi%3Agame%3Adunk-game-001/refresh', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer server-admin-test-token',
        },
        body: JSON.stringify({ date: '2026-11-15' }),
      }),
      { ...incompatibleBudget, DUNKAPI_BOX_SCORE_REFRESH_ENABLED: 'true' },
    )

    expect(regular.error?.code).toBe('not_configured')
    expect(boxScore.status).toBe(503)
    expect(await boxScore.json()).toMatchObject({ error: { code: 'not_configured' } })
    expect(fetcher).not.toHaveBeenCalled()
    expect(repository.usage.size).toBe(0)
  })

  it('fails closed when the monthly baseline is stale or refresh is disabled', async () => {
    const repository = new MemoryNbaRepository()
    const fetcher = vi.fn<typeof fetch>()
    const staleMonth = { ...env, DUNKAPI_CREDIT_BASELINE_MONTH: '2026-10' }
    const disabled = { ...env, DUNKAPI_REFRESH_ENABLED: 'false' }

    const staleMonthResult = await refreshNbaResource(
      { type: 'standings', seasonEndYear },
      staleMonth,
      repository,
      fetcher,
      now,
    )
    const disabledResult = await refreshNbaResource(
      { type: 'standings', seasonEndYear },
      disabled,
      repository,
      fetcher,
      now,
    )

    expect(staleMonthResult.error?.code).toBe('not_configured')
    expect(disabledResult.error?.code).toBe('not_configured')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('marks stale cached data and preserves a safe error after an upstream timeout', async () => {
    const repository = new MemoryNbaRepository()
    repository.cache.set(
      gamesCacheKey('dunkapi', '2026-11-16'),
      createGameRecord('2026-11-16', now - 1),
    )
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('private upstream detail'))
    const result = await refreshNbaResource(
      { type: 'games', date: gameDate },
      env,
      repository,
      fetcher,
      now,
    )

    expect(result.state).toBe('deferred')
    expect(result.isStale).toBe(true)
    expect(result.error?.code).toBe('timeout')
    expect(JSON.stringify(result)).not.toContain('private upstream detail')
    expect(repository.cache.get(gamesCacheKey('dunkapi', '2026-11-16'))?.refreshError?.code).toBe(
      'timeout',
    )
  })

  it('counts an invalid JSON response and does not retry it', async () => {
    const repository = new MemoryNbaRepository()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{invalid json', { status: 200 }))
    const result = await refreshNbaResource(
      { type: 'games', date: gameDate },
      env,
      repository,
      fetcher,
      now,
    )

    expect(result.error?.code).toBe('invalid_response')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(repository.usage.get(usageMonth)?.appCredits).toBe(2)
  })

  it('coalesces concurrent refreshes for the same cache key', async () => {
    const repository = new MemoryNbaRepository()
    const source = fixtures.dunkapi.gamesResponse.data.games[1]
    let resolveFetch: ((response: Response) => void) | undefined
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )

    const first = refreshNbaResource(
      { type: 'games', date: gameDate },
      env,
      repository,
      fetcher,
      now,
    )
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    const concurrent = await refreshNbaResource(
      { type: 'games', date: gameDate },
      env,
      repository,
      fetcher,
      now,
    )
    resolveFetch?.(jsonResponse({ data: { games: [source] } }))
    const completed = await first

    expect(concurrent.state).toBe('in_progress')
    expect(completed.state).toBe('refreshed')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(repository.usage.get(usageMonth)?.appCredits).toBe(2)
  })
})

describe('scheduled NBA refresh', () => {
  it.each([
    { month: '2026-01', daysInMonth: 31, sundays: 4, scheduleRefreshes: 2 },
    { month: '2026-03', daysInMonth: 31, sundays: 5, scheduleRefreshes: 2 },
    { month: '2026-04', daysInMonth: 30, sundays: 4, scheduleRefreshes: 4 },
    { month: '2026-11', daysInMonth: 30, sundays: 5, scheduleRefreshes: 4 },
  ])(
    'keeps the regular refresh plan within 128 credits for $month ($daysInMonth days, $sundays Sundays)',
    ({ month, daysInMonth, sundays, scheduleRefreshes }) => {
      const plan = getRegularRefreshPlan(month, 128)

      expect(plan.daysInMonth).toBe(daysInMonth)
      expect(plan.sundayOrdinals).toHaveLength(sundays)
      expect(plan.scheduleRefreshSundayOrdinals).toHaveLength(scheduleRefreshes)
      expect(plan.plannedCredits).toBeLessThanOrEqual(128)
      expect(plan.plannedCredits).toBe(128)
    },
  )

  it('refreshes the previous NBA date and standings daily, with schedule weekly', async () => {
    const repository = new MemoryNbaRepository()
    const fetchedEndpoints: string[] = []
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      fetchedEndpoints.push(url)
      if (url.endsWith('/get_standings')) return jsonResponse(fixtures.dunkapi.standingsResponse)
      if (url.endsWith('/get_schedule')) return jsonResponse(fixtures.dunkapi.gamesResponse)
      return jsonResponse({
        data: {
          games: [
            {
              ...gameFixture,
              date: '2026-11-21',
              starts_at: '2026-11-22T01:00:00.000Z',
            },
          ],
        },
      })
    })
    const sunday = Date.parse('2026-11-22T10:30:00.000Z')
    await runScheduledRefresh(env, repository, fetcher, sunday)

    expect(fetchedEndpoints).toEqual([
      'https://mcp.dunkapi.com/v1/list_games',
      'https://mcp.dunkapi.com/v1/get_standings',
      'https://mcp.dunkapi.com/v1/get_schedule',
    ])
    expect(repository.usage.get(usageMonth)?.appCredits).toBe(6)
    expect(await repository.getCache(standingsCacheKey('dunkapi', seasonEndYear))).not.toBeNull()
    expect(await repository.getCache(scheduleCacheKey('dunkapi'))).toMatchObject({
      coverage: { from: '2026-11-22', through: '2026-11-28' },
    })
  })

  it('skips an unbudgeted Sunday schedule refresh without affecting daily updates', async () => {
    const repository = new MemoryNbaRepository()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/get_standings')) return jsonResponse(fixtures.dunkapi.standingsResponse)
      return jsonResponse({ data: { games: [gameFixture] } })
    })
    const marchEnv = {
      ...env,
      DUNKAPI_CREDIT_BASELINE_MONTH: '2026-03',
      DUNKAPI_CREDITS_USED_BASELINE: '0',
    }

    await runScheduledRefresh(marchEnv, repository, fetcher, Date.parse('2026-03-29T10:30:00.000Z'))

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls.map(([input]) => String(input))).not.toContain(
      'https://mcp.dunkapi.com/v1/get_schedule',
    )
    expect(repository.usage.get('2026-03')?.appCredits).toBe(4)
  })

  it('does not publish a provider live status in the non-live product', async () => {
    const repository = new MemoryNbaRepository()
    const source = {
      ...gameFixture,
      status: 'live',
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ data: { games: [source] } }))
    await refreshNbaResource({ type: 'games', date: gameDate }, env, repository, fetcher, now)

    const cached = repository.cache.get(gamesCacheKey('dunkapi', '2026-11-16'))
    expect(cached?.capability === 'games' ? cached.data[0] : null).toMatchObject({
      status: 'unknown',
    })
  })
})
