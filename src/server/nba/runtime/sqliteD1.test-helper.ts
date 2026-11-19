import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import type { D1Database, D1PreparedStatement, D1Result } from './types'

export class SqliteTestD1 implements D1Database {
  readonly database = new DatabaseSync(':memory:')
  operations = 0
  snapshotReads = 0
  beforeBatch?: (size: number) => void
  afterStatement?: (size: number, index: number) => void

  constructor() {
    for (const file of [
      '0001_nba_runtime.sql',
      '0002_game_details_cache.sql',
      '0003_bbs_provider.sql',
      '0004_provider_cooldowns.sql',
      '0005_team_season_cache.sql',
      '0006_bbs_players.sql',
      '0007_scheduled_bbs_refresh.sql',
      '0008_bbs_player_refresh.sql',
    ]) {
      this.database.exec(
        readFileSync(new URL(`../../../../migrations/${file}`, import.meta.url), 'utf8'),
      )
    }
  }

  prepare(query: string): D1PreparedStatement {
    const values: (string | number | null)[] = []
    const namedValues = () =>
      Object.fromEntries(values.map((value, index) => [`p${index + 1}`, value])) as Record<
        string,
        string | number | null
      >
    const run = () => {
      const statement = this.database.prepare(query.replace(/\?(\d+)/g, ':p$1'))
      statement.setAllowBareNamedParameters(true)
      const parameters = namedValues()
      if (/^\s*SELECT\b/i.test(query)) return { results: statement.all(parameters) }
      return { changes: Number(statement.run(parameters).changes) }
    }
    const prepared = {
      bind: (...next: unknown[]) => {
        values.splice(0, values.length, ...(next as (string | number | null)[]))
        return prepared
      },
      first: async <T>() => {
        this.operations += 1
        if (query.includes('SELECT payload FROM nba_player_snapshot')) this.snapshotReads += 1
        const statement = this.database.prepare(query.replace(/\?(\d+)/g, ':p$1'))
        statement.setAllowBareNamedParameters(true)
        const parameters = namedValues()
        return (statement.get(parameters) as T | undefined) ?? null
      },
      run: async <T>() => {
        this.operations += 1
        const result = run()
        return /^\s*SELECT\b/i.test(query)
          ? { success: true, results: result.results as T[] }
          : { success: true, meta: { changes: result.changes } }
      },
    }
    return prepared as D1PreparedStatement
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    this.beforeBatch?.(statements.length)
    this.database.exec('BEGIN')
    try {
      const results = []
      for (const [index, statement] of statements.entries()) {
        results.push(await statement.run())
        this.afterStatement?.(statements.length, index)
      }
      this.database.exec('COMMIT')
      return results
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}
