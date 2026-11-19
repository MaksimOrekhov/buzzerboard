// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameId, NbaGameDate, SeasonEndYear, UtcTimestamp } from '@/entities/nba/model'
import { NBA_TEAMS } from '@/entities/nba/teamCatalog'
import type { D1Database, D1PreparedStatement, D1Result, ScheduledBbsProgress } from './types'
import { D1NbaRepository } from './d1Repository'
import { runScheduledBbsRefresh } from './bbsRefresh'
import { standingsCacheKey, teamDirectoryCacheKey, teamSeasonCacheKey } from './cacheKeys'

class SqlitePreparedStatement implements D1PreparedStatement {
  private values: (string | number | null)[] = []

  constructor(
    private readonly owner: SqliteD1,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values as (string | number | null)[]
    return this
  }

  async first<T>() {
    this.owner.operations += 1
    const row = this.statement().get(this.namedValues())
    return (row as T | undefined) ?? null
  }

  async run<T>() {
    this.owner.operations += 1
    const statement = this.statement()
    if (/^\s*SELECT\b/i.test(this.query)) {
      return {
        success: true,
        results: statement.all(this.namedValues()) as T[],
      }
    }
    const result = statement.run(this.namedValues())
    return { success: true, meta: { changes: Number(result.changes) } } as {
      success: boolean
      results?: T[]
      meta?: { changes?: number }
    }
  }

  private sqlWithNamedParameters() {
    return this.query.replace(/\?(\d+)/g, ':p$1')
  }

  private statement() {
    const statement = this.owner.database.prepare(this.sqlWithNamedParameters())
    statement.setAllowBareNamedParameters(true)
    return statement
  }

  private namedValues() {
    return Object.fromEntries(this.values.map((value, index) => [`p${index + 1}`, value]))
  }
}

class SqliteD1 implements D1Database {
  readonly database = new DatabaseSync(':memory:')
  operations = 0

  constructor() {
    this.database.exec(`
      CREATE TABLE nba_credit_usage (
        month TEXT PRIMARY KEY,
        baseline_credits INTEGER NOT NULL CHECK (baseline_credits >= 0),
        app_credits INTEGER NOT NULL CHECK (app_credits >= 0),
        box_score_credits INTEGER NOT NULL DEFAULT 0 CHECK (box_score_credits >= 0)
      );
      CREATE TABLE nba_refresh_locks (
        lock_key TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        lease_expires_at_ms INTEGER NOT NULL
      );
      CREATE TABLE nba_cache (
        cache_key TEXT PRIMARY KEY,
        capability TEXT NOT NULL,
        provider TEXT NOT NULL,
        record_json TEXT NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        stale_until_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
      CREATE TABLE nba_rate_limits (
        rate_key TEXT NOT NULL,
        window_start_ms INTEGER NOT NULL,
        request_count INTEGER NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        PRIMARY KEY (rate_key, window_start_ms)
      );
      CREATE TABLE nba_provider_cooldowns (
        provider TEXT PRIMARY KEY,
        retry_at_ms INTEGER NOT NULL DEFAULT 0,
        error_code TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        remaining INTEGER,
        reset_at_ms INTEGER
      );
      CREATE TABLE nba_scheduled_refresh (
        job_id TEXT PRIMARY KEY,
        progress_json TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
    `)
  }

  prepare(query: string) {
    return new SqlitePreparedStatement(this, query)
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    const results: D1Result[] = []
    for (const statement of statements) results.push(await statement.run())
    return results
  }

  close() {
    this.database.close()
  }
}

const databases: SqliteD1[] = []
const month = '2026-11'

function makeRepository() {
  const database = new SqliteD1()
  databases.push(database)
  return { database, repository: new D1NbaRepository(database) }
}

function seed(database: SqliteD1, appCredits: number, boxScoreCredits: number) {
  database.database
    .prepare(
      'INSERT INTO nba_credit_usage(month, baseline_credits, app_credits, box_score_credits) VALUES (?, ?, ?, ?)',
    )
    .run(month, 27, appCredits, boxScoreCredits)
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

describe('D1 atomic credit reservations', () => {
  it.each(['regular-first', 'box-score-first'] as const)(
    'keeps the shared cap and each allocation valid when reserved %s',
    async (order) => {
      const { repository } = makeRepository()
      if (order === 'regular-first') {
        const regular = await repository.reserveCredits(month, 27, 128, 128, 5, 500)
        const boxScore = await repository.reserveBoxScoreCredits(month, 27, 5, 5, 128, 500)
        expect(regular).toMatchObject({ appCredits: 128, boxScoreCredits: 0 })
        expect(boxScore).toMatchObject({ appCredits: 128, boxScoreCredits: 5 })
      } else {
        const boxScore = await repository.reserveBoxScoreCredits(month, 27, 5, 5, 128, 500)
        const regular = await repository.reserveCredits(month, 27, 128, 128, 5, 500)
        expect(boxScore).toMatchObject({ appCredits: 0, boxScoreCredits: 5 })
        expect(regular).toMatchObject({ appCredits: 128, boxScoreCredits: 5 })
      }
      const usage = await repository.getCreditUsage(month)
      expect(usage).toMatchObject({ baselineCredits: 27, appCredits: 128, boxScoreCredits: 5 })
      expect(usage!.baselineCredits + usage!.appCredits + usage!.boxScoreCredits).toBe(160)
    },
  )

  it('checks the actual shared cap when regular credits are reserved after box-score use', async () => {
    const { database, repository } = makeRepository()
    seed(database, 40, 30)

    expect(await repository.reserveCredits(month, 27, 2, 128, 50, 100)).toMatchObject({
      appCredits: 42,
      boxScoreCredits: 30,
    })
    expect(await repository.reserveCredits(month, 27, 2, 128, 50, 100)).toBeNull()
    expect(await repository.getCreditUsage(month)).toMatchObject({
      appCredits: 42,
      boxScoreCredits: 30,
    })
  })

  it('preserves the full regular allocation when reserving box-score credits after config changes', async () => {
    const { database, repository } = makeRepository()
    seed(database, 6, 0)

    expect(await repository.reserveBoxScoreCredits(month, 27, 5, 5, 128, 159)).toBeNull()
    expect(await repository.getCreditUsage(month)).toMatchObject({
      appCredits: 6,
      boxScoreCredits: 0,
    })
  })

  it('fails closed when persisted box-score use exceeds the changed bucket budget', async () => {
    const { database, repository } = makeRepository()
    seed(database, 6, 5)

    expect(await repository.reserveCredits(month, 27, 2, 128, 4, 500)).toBeNull()
    expect(await repository.reserveBoxScoreCredits(month, 27, 5, 4, 128, 500)).toBeNull()
    expect(await repository.getCreditUsage(month)).toMatchObject({
      appCredits: 6,
      boxScoreCredits: 5,
    })
  })

  it('serializes simultaneous reservations without exceeding either bucket', async () => {
    const { repository } = makeRepository()
    const [regularResults, boxScoreResults] = await Promise.all([
      Promise.all(
        Array.from({ length: 80 }, () => repository.reserveCredits(month, 27, 2, 128, 5, 500)),
      ),
      Promise.all([
        repository.reserveBoxScoreCredits(month, 27, 5, 5, 128, 500),
        repository.reserveBoxScoreCredits(month, 27, 5, 5, 128, 500),
      ]),
    ])
    expect(regularResults.filter(Boolean)).toHaveLength(64)
    expect(boxScoreResults.filter(Boolean)).toHaveLength(1)
    const usage = await repository.getCreditUsage(month)
    expect(usage).toMatchObject({ appCredits: 128, boxScoreCredits: 5 })
    expect(usage!.baselineCredits + usage!.appCredits + usage!.boxScoreCredits).toBeLessThanOrEqual(
      500,
    )
  })
})

describe('D1 atomic BBS guards', () => {
  it('reserves daily and rolling-minute request slots atomically', async () => {
    const { database, repository } = makeRepository()
    const start = Date.parse('2026-11-17T10:00:00.000Z')

    expect(await repository.reserveBbsRequest(start, 2, 1)).toMatchObject({ allowed: true })
    expect(await repository.reserveBbsRequest(start + 1, 2, 1)).toMatchObject({
      allowed: false,
      errorCode: 'rate_limited',
    })
    expect(
      database.database
        .prepare("SELECT request_count FROM nba_rate_limits WHERE rate_key LIKE 'bbs:utc-day:%'")
        .get(),
    ).toEqual({ request_count: 1 })
    expect(await repository.reserveBbsRequest(start + 60_001, 2, 1)).toMatchObject({
      allowed: true,
    })
    expect(await repository.reserveBbsRequest(start + 120_002, 2, 1)).toMatchObject({
      allowed: false,
      errorCode: 'quota_exceeded',
    })
  })

  it('uses shared provider headroom and a fenced renewable cache lock', async () => {
    const { database, repository } = makeRepository()
    const otherIsolate = new D1NbaRepository(database)
    const now = Date.parse('2026-11-17T10:00:00.000Z')
    await repository.recordProviderRemaining('bbs', 30, now + 60_000, now)
    const reservations = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        (index % 2 === 0 ? repository : otherIsolate).reserveProviderBudget('bbs', now + index, 25),
      ),
    )
    expect(reservations.filter((result) => result.allowed)).toHaveLength(5)
    expect(
      reservations
        .filter((result) => !result.allowed)
        .every((result) => result.retryAt === now + 60_000),
    ).toBe(true)

    expect(await repository.tryAcquireLock('bbs:box:test', 'old', now, now + 10)).toBe(true)
    expect(await repository.renewLock('bbs:box:test', 'old', now + 1, now + 100)).toBe(true)
    expect(await repository.tryAcquireLock('bbs:box:test', 'new', now + 101, now + 200)).toBe(true)
    const record = {
      cacheKey: 'bbs:box:test',
      capability: 'boxScore' as const,
      provider: 'bbs' as const,
      gameId: 'bbs:game:test' as never,
      data: null,
      fetchedAt: new Date(now).toISOString() as never,
      providerUpdatedAt: null,
      rejectedRecords: 0,
      expiresAt: now,
      staleUntil: now + 1_000,
      retryAt: null,
      refreshError: null,
    }
    expect(await repository.putCacheIfLockOwned(record, 'bbs:box:test', 'old', now + 102)).toBe(
      false,
    )
    expect(await repository.putCacheIfLockOwned(record, 'bbs:box:test', 'new', now + 102)).toBe(
      true,
    )
  })
})

describe('D1 scheduled BBS progress', () => {
  it('keeps a D1 standings-enrichment tick within the 50-operation Free cap', async () => {
    const { database, repository } = makeRepository()
    const now = Date.parse('2026-11-17T16:00:00.000Z')
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const fetchedAt = new Date(now - 60_000).toISOString() as UtcTimestamp
    const seasonEndYear = 2027 as SeasonEndYear
    const standingsKey = standingsCacheKey('bbs', seasonEndYear)
    const rows = NBA_TEAMS.map((reference) => ({
      team: { ...reference.team, providerId: `provider-${reference.code}` as never },
      seasonEndYear,
      conference: reference.conference,
      record: {
        wins: 10,
        losses: 10,
        conferenceWins: null,
        conferenceLosses: null,
        homeWins: null,
        homeLosses: null,
        awayWins: null,
        awayLosses: null,
        lastTenWins: null,
        pointsFor: null,
        pointsAgainst: null,
        averageMargin: null,
      },
      winPercentage: 0.5,
      officialRank: null,
      playoffSeed: null,
      providerOrder: null,
    }))
    await repository.putCache({
      cacheKey: standingsKey,
      capability: 'standings',
      provider: 'bbs',
      data: rows,
      fetchedAt,
      providerUpdatedAt: null,
      rejectedRecords: 0,
      expiresAt: now + 60_000,
      staleUntil: now + 7 * 24 * 60 * 60_000,
      retryAt: null,
      refreshError: null,
    })
    await repository.putCache({
      cacheKey: teamDirectoryCacheKey('bbs', seasonEndYear),
      capability: 'teamDirectory',
      provider: 'bbs',
      seasonEndYear,
      data: NBA_TEAMS.map((reference) => ({
        teamId: reference.team.id,
        providerTeamId: `provider-${reference.code}` as never,
      })),
      fetchedAt,
      providerUpdatedAt: null,
      rejectedRecords: 0,
      expiresAt: now + 60_000,
      staleUntil: now + 7 * 24 * 60 * 60_000,
      retryAt: null,
      refreshError: null,
    })
    for (const reference of NBA_TEAMS) {
      const profile = {
        team: { ...reference.team, providerId: `provider-${reference.code}` as never },
        seasonEndYear,
        wins: 10,
        losses: 10,
        winPercentage: 0.5,
        overallRank: null,
        conferenceRank: null,
        gamesBack: null,
        streak: null,
        home: { wins: 5, losses: 5, ties: null },
        away: { wins: 5, losses: 5, ties: null },
        stats: {
          gamesPlayed: 20,
          pointsPerGame: null,
          fieldGoalPercentage: null,
          threePointPercentage: null,
          reboundsPerGame: null,
          assistsPerGame: null,
          turnoversPerGame: null,
        },
        lastTen: null,
        leaders: [],
        nextGame: null,
      }
      await repository.putCache({
        cacheKey: teamSeasonCacheKey('bbs', reference.team.id, seasonEndYear),
        capability: 'teamSeason',
        provider: 'bbs',
        teamId: reference.team.id,
        seasonEndYear,
        providerTeamId: `provider-${reference.code}` as never,
        data: profile,
        fetchedAt,
        providerUpdatedAt: null,
        rejectedRecords: 0,
        expiresAt: now + 60_000,
        staleUntil: now + 7 * 24 * 60 * 60_000,
        retryAt: null,
        refreshError: null,
      })
    }
    await repository.putScheduledBbsProgress({
      cycleDate: '2026-11-17' as NbaGameDate,
      cursor: 0,
      pauseUntil: null,
      tasks: [{ task: { type: 'enrichStandings', seasonEndYear }, attempts: 0, retryAt: null }],
    })
    const probeKeys = [standingsKey, teamDirectoryCacheKey('bbs', seasonEndYear)]
    expect((await repository.getCaches(probeKeys)).every(Boolean)).toBe(true)
    database.operations = 0
    await repository.cleanupExpired(now)
    const neverFetch = (async () => {
      throw new Error('synthetic cache-only tick must not fetch')
    }) as typeof fetch
    const result = await runScheduledBbsRefresh(
      { BBS_API_KEY: 'synthetic', BBS_REFRESH_ENABLED: 'true' },
      repository,
      neverFetch,
      now,
    )
    expect(result[0]?.state).toBe('refreshed')
    expect(database.operations).toBe(47)
    expect(database.operations).toBeLessThanOrEqual(50)
    vi.restoreAllMocks()
  })

  it('round trips a safe cursor and clears only its scheduler row', async () => {
    const { database, repository } = makeRepository()
    const progress: ScheduledBbsProgress = {
      cycleDate: '2026-11-18' as NbaGameDate,
      cursor: 0,
      pauseUntil: null,
      tasks: [
        {
          task: { type: 'standings', seasonEndYear: 2027 as SeasonEndYear },
          attempts: 0,
          retryAt: null,
          lastError: {
            phase: 'games_pagination',
            errorCode: 'invalid_response',
            observedAt: 1795017600000,
            expectedCount: 12,
            actualCount: 0,
          },
        },
        {
          task: { type: 'teamSeason', teamCode: 'BOS', seasonEndYear: 2027 as SeasonEndYear },
          attempts: 0,
          retryAt: null,
        },
      ],
      failedTasks: [
        {
          task: {
            type: 'boxScore',
            date: '2026-11-17' as NbaGameDate,
            gameId: 'bbs:game:1' as GameId,
          },
          errorCode: 'cache_miss',
          failedAt: 1795017600000,
          diagnostic: {
            phase: 'box_score_archive_references',
            errorCode: 'cache_miss',
            observedAt: 1795017600000,
            expectedCount: 3,
            actualCount: 1,
          },
        },
      ],
    }

    await repository.putScheduledBbsProgress(progress)
    expect(await repository.getScheduledBbsProgress()).toEqual(progress)
    await repository.putScheduledBbsProgress(null)
    expect(
      database.database.prepare('SELECT COUNT(*) AS count FROM nba_scheduled_refresh').get(),
    ).toEqual({ count: 0 })
  })

  it('fences queue writes atomically against the lease owner', async () => {
    const { repository } = makeRepository()
    const now = Date.parse('2026-11-18T16:00:00.000Z')
    const progress: ScheduledBbsProgress = {
      cycleDate: '2026-11-18' as NbaGameDate,
      cursor: 0,
      pauseUntil: null,
      tasks: [
        {
          task: { type: 'standings', seasonEndYear: 2027 as SeasonEndYear },
          attempts: 0,
          retryAt: null,
        },
      ],
    }
    expect(await repository.tryAcquireLock('bbs:scheduled-queue', 'old', now, now + 100)).toBe(true)
    expect(
      await repository.putScheduledBbsProgressIfLockOwned(
        progress,
        'bbs:scheduled-queue',
        'old',
        now,
      ),
    ).toBe(true)
    expect(
      await repository.tryAcquireLock('bbs:scheduled-queue', 'new', now + 101, now + 200),
    ).toBe(true)
    const overwritten = { ...progress, tasks: [] }
    expect(
      await repository.putScheduledBbsProgressIfLockOwned(
        overwritten,
        'bbs:scheduled-queue',
        'old',
        now + 102,
      ),
    ).toBe(false)
    expect(await repository.getScheduledBbsProgress()).toEqual(progress)
  })

  it('does not silently reset corrupt queue state', async () => {
    const { database, repository } = makeRepository()
    database.database
      .prepare(
        'INSERT INTO nba_scheduled_refresh(job_id, progress_json, updated_at_ms) VALUES (?, ?, ?)',
      )
      .run(
        'bbs-daily',
        JSON.stringify({
          cycleDate: '2026-11-18',
          cursor: 0,
          tasks: [
            {
              task: { type: 'teamSeason', teamCode: 'XXX', seasonEndYear: 2027 },
              attempts: 0,
              retryAt: null,
            },
          ],
          pauseUntil: null,
        }),
        0,
      )

    await expect(repository.getScheduledBbsProgress()).rejects.toThrow('Corrupt')
  })
})
