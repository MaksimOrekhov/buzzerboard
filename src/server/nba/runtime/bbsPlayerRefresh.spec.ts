// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlayerStats } from '@/entities/nba/players'
import { playerSeason } from '@/entities/nba/players'
import { NBA_TEAMS } from '@/entities/nba/teamCatalog'
import type { NbaRepository, WorkerEnvironment } from './types'
import { runScheduledBbsPlayerRefresh } from './bbsPlayerRefresh'
import { D1NbaRepository } from './d1Repository'
import { runScheduledRefresh } from './refresh'
import type { NbaGameDate, SeasonEndYear } from '@/entities/nba/model'
import { standingsCacheKey } from './cacheKeys'
import { SqliteTestD1 } from './sqliteD1.test-helper'

afterEach(() => vi.restoreAllMocks())

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
    const d1 = new SqliteTestD1()
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
      stats: index < 2 ? stats(8) : null,
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
    const averageAt = { [players[0]!.id]: oldAt, [players[1]!.id]: oldAt }
    const snapshot = {
      version: 2,
      players,
      details,
      gameRefs: Object.fromEntries(players.map(({ id }) => [id, []])),
      directoryAt: new Date(clock - 8 * 86_400_000).toISOString(),
      averageAt,
      coverage: {
        providerRows: 645,
        total: 645,
        checked: 2,
        averages: 2,
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
            providerTeamId: playerUuid(1000 + index),
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
    let resetDirectory = false
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/v1/stored/players') {
        const offset = Number(url.searchParams.get('offset'))
        const total = offset === 200 && !resetDirectory ? 646 : 645
        if (total === 646) resetDirectory = true
        return Response.json({
          data: players.slice(offset, offset + 200).map((player) => ({
            id: player.id.slice('bbs:player:'.length),
            name: player.name,
            team: { id: playerUuid(1000), league: 'NBA' },
          })),
          pagination: { offset, total },
          meta: { filters_applied: { season: 2026, league_scope: { mode: 'requested_season' } } },
        })
      }
      const id = url.pathname.split('/').at(-2)!
      if (url.pathname.endsWith('/season-averages')) {
        calls.set(id, (calls.get(id) ?? 0) + 1)
        const index = players.findIndex((player) => player.id.endsWith(id))
        if (index === 0) return Response.json({ data: [] })
        if (index === 2)
          return Response.json({ data: [{ player_id: id, season: 2026, games_played: 3 }] })
        const wrongOnce = id === playerUuid(14) && calls.get(id) === 1
        return Response.json({ data: [averageRow(wrongOnce ? playerUuid(15) : id, index)] })
      }
      if (url.pathname.endsWith('/profile'))
        return Response.json({
          data: {
            player: {
              id,
              league: 'NBA',
              date_of_birth: '2000-01-01',
              current_team: { id: playerUuid(1000) },
            },
          },
        })
      if (url.pathname.endsWith('/gamelog')) return Response.json({ data: [] })
      throw new Error(`Unexpected synthetic BBS URL: ${url.pathname}`)
    })

    let interruptedDirectory = false
    let interruptedPublication = false
    d1.afterStatement = (size, index) => {
      if (size === 3 && index === 0 && !interruptedDirectory) {
        interruptedDirectory = true
        throw new Error('Synthetic directory transaction interruption')
      }
    }
    d1.beforeBatch = (size) => {
      if (size === 27 && !interruptedPublication) {
        interruptedPublication = true
        d1.database
          .prepare('UPDATE nba_refresh_locks SET token=? WHERE lock_key=?')
          .run('takeover-during-publication', lock.key)
      }
    }
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
      const reads = d1.snapshotReads
      const requests = fetcher.mock.calls.length
      try {
        status = await runScheduledBbsPlayerRefresh(d1, env, repository, fetcher, clock, lock)
      } catch (error) {
        if (String(error).includes('Synthetic directory transaction interruption')) {
          expect(
            d1.database
              .prepare('SELECT COUNT(*) AS total FROM nba_player_refresh_directory_pages')
              .get()?.total,
          ).toBe(4)
          expect(
            d1.database.prepare('SELECT fetched_at FROM nba_player_snapshot').get()?.fetched_at,
          ).toBe(snapshot.directoryAt)
        } else {
          expect(String(error)).toContain('lost its scheduler lease')
          expect(
            d1.database
              .prepare(
                'SELECT COUNT(*) AS total FROM nba_player_refresh_observations WHERE published_at_ms IS NULL',
              )
              .get()?.total,
          ).toBe(25)
        }
        continue
      }
      if (
        status?.phase === 'averages' &&
        fetcher.mock.calls.length > requests &&
        String(fetcher.mock.calls.at(-1)?.[0]).includes('/season-averages')
      )
        expect(d1.snapshotReads).toBe(reads)
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

    expect(status).toMatchObject({
      phase: 'idle',
      total: 645,
      checked: 645,
      updated: 642,
      retained: 2,
      failed: 1,
    })
    expect(interruptedDirectory && interruptedPublication && resetDirectory).toBe(true)
    expect(lock.token).toBe('recovered-lock-after-restart')
    expect([...calls.values()].reduce((sum, count) => sum + count, 0)).toBe(649)
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).includes('/stored/players')),
    ).toHaveLength(6)
    expect(calls.get(playerUuid(14))).toBe(2)
    expect(calls.get(playerUuid(3))).toBe(4)
    expect(saved.players).toHaveLength(645)
    expect(saved.coverage.checked).toBe(644)
    expect(saved.averageAt[players[0]!.id]).toBe(oldAt)
    expect(saved.averageAt[players[1]!.id]).toBe(oldAt)
    expect(saved.players[0]?.stats).toMatchObject({ gp: 8, pts: 18 })
    expect(saved.players[11]?.stats).toMatchObject({ gp: 0, pts: null })
    expect(saved.details[players[0]!.id]?.games).toHaveLength(1)
    expect(saved.details[players[10]!.id]?.profileAt).toBeTruthy()
    expect(JSON.parse(progressJson)).toMatchObject({ phase: 'idle', lastCycleTotal: 645 })
    d1.database.prepare('UPDATE nba_player_refresh_state SET progress_json=?').run(
      JSON.stringify({
        ...JSON.parse(progressJson),
        nextCycleAt: clock + 60_000,
      }),
    )
    const idleReads = d1.snapshotReads
    await runScheduledBbsPlayerRefresh(d1, env, repository, fetcher, clock, lock)
    expect(d1.snapshotReads).toBe(idleReads)
    expect(maxDailyTotal).toBeLessThanOrEqual(150)
    expect(maxStatementsPerTick).toBeLessThanOrEqual(50)
    expect(new TextEncoder().encode(JSON.stringify(saved)).byteLength).toBeLessThan(1_800_000)

    vi.restoreAllMocks()
    d1.database.close()
  })

  it('gives due core work priority and resumes players across UTC midnight with real D1 quota', async () => {
    const d1 = new SqliteTestD1()
    const repository = new D1NbaRepository(d1)
    let now = Date.parse('2026-11-18T23:40:00Z')
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const date = '2026-11-18' as NbaGameDate
    const season = 2027 as SeasonEndYear
    const at = new Date(now).toISOString()
    const player = (index: number) => ({
      id: 'bbs:player:' + playerUuid(index),
      name: 'Player ' + index,
      team: 'BOS',
      position: null,
      number: null,
      height: null,
      weight: null,
      stats: null,
    })
    d1.database.prepare('INSERT INTO nba_player_snapshot VALUES (?,?,?)').run(
      season,
      at,
      JSON.stringify({
        version: 2,
        players: Array.from({ length: 25 }, (_, i) => player(i + 1)),
        details: {},
        gameRefs: {},
        directoryAt: at,
        averageAt: {},
        coverage: {
          providerRows: 25,
          total: 25,
          checked: 0,
          averages: 0,
          enriched: 0,
          boxLinks: 0,
        },
      }),
    )
    await repository.putCache({
      capability: 'standings',
      provider: 'bbs',
      cacheKey: standingsCacheKey('bbs', season),
      data: [],
      fetchedAt: at as never,
      providerUpdatedAt: null,
      rejectedRecords: 0,
      expiresAt: now + 86_400_000,
      staleUntil: now + 86_400_000,
      retryAt: null,
      refreshError: null,
    })
    await repository.putScheduledBbsProgress({
      cycleDate: date,
      cursor: 0,
      pauseUntil: null,
      tasks: [
        { task: { type: 'standings', seasonEndYear: season }, attempts: 0, retryAt: null },
        { task: { type: 'games', date }, attempts: 1, retryAt: Date.parse('2026-11-19T10:00:00Z') },
      ],
    })
    const env = {
      NBA_DB: d1,
      BBS_API_KEY: 'fixture',
      BBS_REFRESH_ENABLED: 'true',
      BBS_PLAYER_REFRESH_ENABLED: 'true',
      BBS_REQUEST_INTERVAL_MS: '0',
    }
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/v1/matches') {
        expect(url.searchParams.get('date')).toBe(date)
        return Response.json({ data: [], pagination: { total: 0 } })
      }
      expect(url.pathname).toMatch(/\/season-averages$/)
      return Response.json({ data: [averageRow(url.pathname.split('/').at(-2)!, 1)] })
    })
    const tick = async () => {
      const before = d1.operations
      const result = await runScheduledRefresh(env, repository, fetcher, now)
      expect(d1.operations - before).toBeLessThanOrEqual(50)
      return result
    }
    expect((await tick())[0]?.target.type).toBe('standings')
    expect(fetcher).not.toHaveBeenCalled()
    now += 10 * 60_000
    await tick()
    expect(fetcher).toHaveBeenCalledTimes(1)
    // Leave two requests in the current UTC bucket for the waiting core task.
    for (let index = 0; index < 147; index++)
      expect(
        (await repository.reserveBbsRequest(now - (150 - index) * 60_000, 150, 10)).allowed,
      ).toBe(true)
    now += 9 * 60_000
    await tick()
    expect(fetcher).toHaveBeenCalledTimes(1)
    const reads = d1.snapshotReads
    now += 30_000
    await tick()
    expect(d1.snapshotReads).toBe(reads)
    expect((await repository.reserveBbsRequest(now, 150, 10)).allowed).toBe(true)
    expect((await repository.reserveBbsRequest(now + 1, 150, 10)).allowed).toBe(true)
    expect(
      d1.database
        .prepare(
          "SELECT request_count FROM nba_rate_limits WHERE rate_key='bbs:utc-day:2026-11-18'",
        )
        .get()?.request_count,
    ).toBe(150)
    now = Date.parse('2026-11-19T00:00:00Z')
    for (let index = 0; index < 24; index++) {
      await tick()
      now += 10 * 60_000
    }
    const payload = String(
      d1.database.prepare('SELECT payload FROM nba_player_snapshot').get()?.payload,
    )
    d1.database.prepare('UPDATE nba_player_snapshot SET payload=?').run('{}')
    await expect(tick()).rejects.toThrow('Invalid existing player snapshot')
    expect(
      d1.database
        .prepare(
          'SELECT COUNT(*) AS total FROM nba_player_refresh_observations WHERE published_at_ms IS NULL',
        )
        .get()?.total,
    ).toBe(25)
    expect(d1.database.prepare('SELECT payload FROM nba_player_snapshot').get()?.payload).toBe('{}')
    d1.database.prepare('UPDATE nba_player_snapshot SET payload=?').run(payload)
    await tick()
    expect(fetcher).toHaveBeenCalledTimes(25)
    expect(
      JSON.parse(
        String(
          d1.database.prepare('SELECT progress_json FROM nba_player_refresh_state').get()
            ?.progress_json,
        ),
      ),
    ).toMatchObject({ cursor: 25, successful: 25 })
    const days = d1.database
      .prepare(
        "SELECT request_count FROM nba_rate_limits WHERE rate_key LIKE 'bbs:utc-day:%' ORDER BY rate_key",
      )
      .all()
    expect(days.map((day) => day.request_count)).toEqual([24])
    now = Date.parse('2026-11-19T10:00:00Z')
    expect((await tick())[0]?.target.type).toBe('games')
    expect((await repository.getScheduledBbsProgress())?.cycleDate).toBe('2026-11-19')
    expect(fetcher).toHaveBeenCalledTimes(26)
    d1.database.close()
  })
})
