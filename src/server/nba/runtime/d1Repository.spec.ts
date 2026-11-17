// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type { D1Database, D1PreparedStatement, D1Result } from './types'
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
