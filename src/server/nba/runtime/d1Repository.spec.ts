// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type { NbaGameDate, SeasonEndYear } from '@/entities/nba/model'
import type { D1Database, D1PreparedStatement, D1Result, ScheduledBbsProgress } from './types'
import { D1NbaRepository } from './d1Repository'

class SqlitePreparedStatement implements D1PreparedStatement {
  private values: (string | number | null)[] = []

  constructor(
    private readonly database: DatabaseSync,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values as (string | number | null)[]
    return this
  }

  async first<T>() {
    const row = this.statement().get(this.namedValues())
    return (row as T | undefined) ?? null
  }

  async run<T>() {
    const result = this.statement().run(this.namedValues())
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
    const statement = this.database.prepare(this.sqlWithNamedParameters())
    statement.setAllowBareNamedParameters(true)
    return statement
  }

  private namedValues() {
    return Object.fromEntries(this.values.map((value, index) => [`p${index + 1}`, value]))
  }
}

class SqliteD1 implements D1Database {
  readonly database = new DatabaseSync(':memory:')

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
    return new SqlitePreparedStatement(this.database, query)
  }

  async batch(): Promise<D1Result[]> {
    throw new Error('batch is not used by credit reservation tests')
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
  it('round trips a safe cursor and clears only its scheduler row', async () => {
    const { database, repository } = makeRepository()
    const progress: ScheduledBbsProgress = {
      cycleDate: '2026-11-18' as NbaGameDate,
      cursor: 1,
      tasks: [
        { type: 'standings', seasonEndYear: 2027 as SeasonEndYear },
        { type: 'teamSeason', teamCode: 'BOS', seasonEndYear: 2027 as SeasonEndYear },
      ],
    }

    await repository.putScheduledBbsProgress(progress)
    expect(await repository.getScheduledBbsProgress()).toEqual(progress)
    await repository.putScheduledBbsProgress(null)
    expect(
      database.database.prepare('SELECT COUNT(*) AS count FROM nba_scheduled_refresh').get(),
    ).toEqual({ count: 0 })
  })

  it('rejects corrupt cursor state and non-canonical team tasks', async () => {
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
          tasks: [{ type: 'teamSeason', teamCode: 'XXX', seasonEndYear: 2027 }],
        }),
        0,
      )

    expect(await repository.getScheduledBbsProgress()).toBeNull()
  })
})
