// @vitest-environment node
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import type { PlayerStats } from '@/entities/nba/players'
import { playerSeason } from '@/entities/nba/players'
import { NBA_TEAMS } from '@/entities/nba/teamCatalog'
import type {
  NbaRepository,
  WorkerEnvironment,
  D1Database,
  D1PreparedStatement,
  D1Result,
} from './types'
import { runScheduledBbsPlayerRefresh } from './bbsPlayerRefresh'

class PlayerRefreshSqlite implements D1Database {
  readonly database = new DatabaseSync(':memory:')
  operations = 0

  constructor() {
    for (const file of [
      '0001_nba_runtime.sql',
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
    this.database.exec('BEGIN')
    try {
      const results = await Promise.all(statements.map((statement) => statement.run()))
      this.database.exec('COMMIT')
      this.operations += Math.max(0, statements.length - results.length)
      return results
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

function playerUuid(index: number) {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
}

function stats(gp: number): PlayerStats {
  return {
    gp,
    min: gp ? 28 : null,
    pts: gp ? 18 : null,
    reb: gp ? 5 : null,
    ast: gp ? 4 : null,
    fgm: gp ? 7 : null,
    fga: gp ? 14 : null,
    fg: gp ? 0.5 : null,
    threeM: gp ? 2 : null,
    threeA: gp ? 6 : null,
    three: gp ? 1 / 3 : null,
    ftm: gp ? 2 : null,
    fta: gp ? 3 : null,
    ft: gp ? 2 / 3 : null,
    stl: gp ? 1 : null,
    blk: gp ? 1 : null,
    oreb: gp ? 1 : null,
    dreb: gp ? 4 : null,
    tov: gp ? 2 : null,
    pf: gp ? 2 : null,
  }
}

function averageRow(id: string, index: number) {
  return {
    player_id: id,
    season: 2026,
    games_played: index % 11 === 0 ? 0 : 3,
    min: index % 11 === 0 ? null : '28:00',
    pts: index % 11 === 0 ? null : 18,
    reb: index % 11 === 0 ? null : 5,
    ast: index % 11 === 0 ? null : 4,
    fgm: index % 11 === 0 ? null : 7,
    fga: index % 11 === 0 ? null : 14,
    fg_pct: index % 11 === 0 ? null : 0.5,
    fg3m: index % 11 === 0 ? null : 2,
    fg3a: index % 11 === 0 ? null : 6,
    fg3_pct: index % 11 === 0 ? null : 1 / 3,
    ftm: index % 11 === 0 ? null : 2,
    fta: index % 11 === 0 ? null : 3,
    ft_pct: index % 11 === 0 ? null : 2 / 3,
    stl: index % 11 === 0 ? null : 1,
    blk: index % 11 === 0 ? null : 1,
    oreb: index % 11 === 0 ? null : 1,
    dreb: index % 11 === 0 ? null : 4,
    turnover: index % 11 === 0 ? null : 2,
    pf: index % 11 === 0 ? null : 2,
  }
}

describe('scheduled BBS player refresh', () => {
  it('resumes all 645 synthetic player averages across quota days and preserves prior enrichment', async () => {
    const d1 = new PlayerRefreshSqlite()
    let clock = Date.parse('2026-11-18T20:00:00.000Z')
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    const lock = { key: 'bbs:scheduled-queue', token: 'synthetic-lock' }
    d1.database
      .prepare('INSERT INTO nba_refresh_locks (lock_key,token,lease_expires_at_ms) VALUES (?,?,?)')
      .run(lock.key, lock.token, clock + 30_000)

    const players = Array.from({ length: 645 }, (_, index) => ({
      id: `bbs:player:${playerUuid(index + 1)}`,
      name: `Player ${index + 1}`,
      team: 'BOS',
      position: 'G',
      number: String(index + 1),
      height: null,
      weight: null,
      stats: index === 0 ? stats(8) : null,
    }))
    const oldAt = new Date(clock - 10 * 86_400_000).toISOString()
    const details = Object.fromEntries(
      players.slice(0, 10).map(({ id }) => [
        id,
        {
          birthDate: null,
          currentTeam: 'BOS',
          profileAt: oldAt,
          logAt: oldAt,
          games: [
            {
              date: '2026-11-10',
              opponent: 'NYK',
              gameId: null,
              matchId: 'bbs:game:old',
              pts: 17,
              reb: 5,
              ast: 4,
              min: 28,
            },
          ],
        },
      ]),
    )
    const averageAt = { [players[0]!.id]: oldAt }
    const snapshot = {
      version: 2,
      players,
      details,
      gameRefs: Object.fromEntries(players.map(({ id }) => [id, []])),
      directoryAt: new Date(clock - 60_000).toISOString(),
      averageAt,
      coverage: {
        providerRows: 645,
        total: 645,
        checked: 1,
        averages: 1,
        enriched: 10,
        boxLinks: 0,
      },
    }
    d1.database
      .prepare(
        'INSERT INTO nba_player_snapshot (season_end_year,fetched_at,payload) VALUES (?,?,?)',
      )
      .run(playerSeason, snapshot.directoryAt, JSON.stringify(snapshot))

    const calls = new Map<string, number>()
    let dayKey = ''
    let dayRequests = 0
    let maxDailyTotal = 0
    const repository = {
      async getProviderCooldown() {
        return null
      },
      async clearProviderCooldown() {},
      async renewLock(key: string, token: string, _now: number, expiresAt: number) {
        return (
          Number(
            d1.database
              .prepare(
                'UPDATE nba_refresh_locks SET lease_expires_at_ms=? WHERE lock_key=? AND token=?',
              )
              .run(expiresAt, key, token).changes,
          ) === 1
        )
      },
      async reserveBbsRequest() {
        if (dayRequests >= 150)
          return {
            allowed: false,
            retryAt: clock + 86_400_000,
            errorCode: 'quota_exceeded' as const,
          }
        dayRequests += 1
        maxDailyTotal = Math.max(maxDailyTotal, dayRequests)
        return { allowed: true, retryAt: null, errorCode: null }
      },
      async reserveProviderBudget(_provider: string, _now: number, headroom: number) {
        return headroom === 25
          ? { allowed: true, retryAt: null, errorCode: null }
          : { allowed: false, retryAt: clock + 60_000, errorCode: 'rate_limited' as const }
      },
      async setProviderCooldown() {},
      async recordProviderRemaining() {},
      async getCache() {
        return {
          capability: 'teamDirectory',
          data: NBA_TEAMS.map((team, index) => ({
            providerTeamId: `synthetic-team-${index}`,
            teamId: team.team.id,
          })),
        }
      },
      async getCaches(keys: readonly string[]) {
        return keys.map(() => null)
      },
    } as unknown as NbaRepository
    const env: WorkerEnvironment = {
      BBS_API_KEY: 'synthetic-only',
      BBS_REFRESH_ENABLED: 'true',
      BBS_PLAYER_REFRESH_ENABLED: 'true',
      BBS_DAILY_REQUEST_LIMIT: '150',
      BBS_PER_MINUTE_REQUEST_LIMIT: '10',
      BBS_REQUEST_HEADROOM: '25',
      BBS_REQUEST_INTERVAL_MS: '0',
    }
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      const id = url.pathname.split('/').at(-2)!
      if (url.pathname.endsWith('/season-averages')) {
        calls.set(id, (calls.get(id) ?? 0) + 1)
        const index = players.findIndex((player) => player.id.endsWith(id))
        if (index === 0) return Response.json({ data: [] })
        const wrongOnce = id === playerUuid(14) && calls.get(id) === 1
        return Response.json({ data: [averageRow(wrongOnce ? playerUuid(15) : id, index)] })
      }
      if (url.pathname.endsWith('/profile'))
        return Response.json({
          data: { player: { id, league: 'NBA', date_of_birth: null, current_team: null } },
        })
      if (url.pathname.endsWith('/gamelog')) return Response.json({ data: [] })
      throw new Error(`Unexpected synthetic BBS URL: ${url.pathname}`)
    }) as typeof fetch

    let status: Awaited<ReturnType<typeof runScheduledBbsPlayerRefresh>> = null
    let maxStatementsPerTick = 0
    for (let tick = 0; tick < 1_500; tick += 1) {
      clock += 10 * 60_000
      if (tick === 250) lock.token = 'recovered-lock-after-restart'
      const utcDay = new Date(clock).toISOString().slice(0, 10)
      if (utcDay !== dayKey) {
        dayKey = utcDay
        dayRequests = 70 // Simulate core match/team/standings requests already reserved first.
        maxDailyTotal = Math.max(maxDailyTotal, dayRequests)
      }
      d1.database
        .prepare('UPDATE nba_refresh_locks SET token=?,lease_expires_at_ms=? WHERE lock_key=?')
        .run(lock.token, clock + 30_000, lock.key)
      const before = d1.operations
      status = await runScheduledBbsPlayerRefresh(d1, env, repository, fetcher, clock, lock)
      maxStatementsPerTick = Math.max(maxStatementsPerTick, d1.operations - before)
      if (status?.phase === 'idle' && status.lastCompletedAt) break
    }

    const saved = JSON.parse(
      d1.database
        .prepare('SELECT payload FROM nba_player_snapshot WHERE season_end_year=?')
        .get(playerSeason)!.payload as string,
    ) as typeof snapshot
    const progressJson = d1.database
      .prepare('SELECT progress_json FROM nba_player_refresh_state WHERE season_end_year=?')
      .get(playerSeason)!.progress_json as string

    expect(status).toMatchObject({ phase: 'idle', total: 645, updated: 645 })
    expect(lock.token).toBe('recovered-lock-after-restart')
    expect(fetcher).toHaveBeenCalledTimes(648) // 645 averages, one isolated retry, and profile + gamelog.
    expect(calls.get(playerUuid(14))).toBe(2)
    expect(saved.players).toHaveLength(645)
    expect(saved.coverage.checked).toBe(645)
    expect(saved.averageAt[players[0]!.id]).not.toBe(oldAt)
    expect(saved.players[0]?.stats).toMatchObject({ gp: 8, pts: 18 })
    expect(saved.players[11]?.stats).toMatchObject({ gp: 0, pts: null })
    expect(saved.details[players[0]!.id]?.games).toHaveLength(1)
    expect(saved.details[players[10]!.id]?.profileAt).toBeTruthy()
    expect(JSON.parse(progressJson)).toMatchObject({ phase: 'idle', lastCycleTotal: 645 })
    expect(maxDailyTotal).toBeLessThanOrEqual(150)
    expect(maxStatementsPerTick).toBeLessThanOrEqual(50)
    expect(new TextEncoder().encode(JSON.stringify(saved)).byteLength).toBeLessThan(1_800_000)

    vi.restoreAllMocks()
    d1.database.close()
  })
})
