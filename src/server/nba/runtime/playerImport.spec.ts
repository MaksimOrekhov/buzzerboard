// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { isStoredPlayers, type StoredPlayers } from '@/entities/nba/playerSnapshotGuards'
import type { BoxScoreCacheRecord, D1Database, GamesCacheRecord, NbaCacheRecord } from './types'
import { boxPlayerLine, combinePlayerGames, verifiedPlayerBox } from './playerGames'
import { readPlayerSnapshot } from './playerSnapshots'

const id = '00000000-0000-0000-0000-000000000001'
const playerId = 'bbs:player:' + id
const baseDate = '2026-11-16'
const gameId = 'bbs:game:synthetic'
const baseAt = '2026-11-17T05:00:00.000Z'
const ref = { date: baseDate, gameId }
const team = (code: string) => ({
  id: 'nba:team:' + code,
  providerId: code,
  abbreviation: code,
  displayName: code,
})
const game = {
  id: gameId,
  provider: 'bbs',
  providerId: 'synthetic',
  nbaGameDate: baseDate,
  seasonEndYear: 2027,
  startsAt: null,
  status: 'final',
  homeTeam: team('BOS'),
  awayTeam: team('NYK'),
  score: { home: 100, away: 90 },
  scoreByPeriod: null,
  venue: null,
}
const line = {
  points: 24,
  rebounds: 5,
  assists: 4,
  offensiveRebounds: null,
  defensiveRebounds: null,
  steals: null,
  blocks: null,
  turnovers: null,
  fouls: null,
  plusMinus: null,
  fieldGoals: { made: null, attempted: null, percentage: null },
  threePointers: { made: null, attempted: null, percentage: null },
  freeThrows: { made: null, attempted: null, percentage: null },
}
const expiry = Date.now() + 86_400_000
const baseKey = 'bbs:nba:games:date=' + baseDate
const boxKey = 'bbs:nba:game-details:id=' + encodeURIComponent(gameId)
const base = {
  provider: 'bbs',
  capability: 'games',
  cacheKey: baseKey,
  data: [game],
  staleUntil: expiry,
} as unknown as Extract<GamesCacheRecord, { capability: 'games' }>
const box = {
  provider: 'bbs',
  capability: 'boxScore',
  cacheKey: boxKey,
  gameId,
  staleUntil: expiry,
  data: {
    game,
    teams: [
      { ...line, team: game.homeTeam, points: 100 },
      { ...line, team: game.awayTeam, points: 90 },
    ],
    players: [
      {
        ...line,
        player: {
          id: playerId,
          provider: 'bbs',
          providerId: id,
          teamId: game.homeTeam.id,
          displayName: 'Synthetic Player',
        },
        starter: true,
        didNotPlay: false,
        minutes: '25:30',
      },
    ],
  },
} as unknown as BoxScoreCacheRecord

it('drops missing, expired and corrected games; independent logs never inherit unverified stats or links', () => {
  const verified = verifiedPlayerBox(base, box, ref, 2027, Date.now())
  expect(verified).not.toBeNull()
  const cached = boxPlayerLine(verified!, playerId)!
  expect(cached).toMatchObject({ gameId, min: 25.5, pts: 24, opponent: 'NYK' })
  const log = { ...cached, gameId: null, pts: 21, matchId: null }
  expect(combinePlayerGames([log], [cached])).toEqual([{ ...cached, pts: 21, gameId: null }])
  expect(combinePlayerGames([{ ...log, matchId: gameId }], [cached])[0]?.gameId).toBeNull()
  expect(combinePlayerGames([{ ...log, pts: 24, matchId: gameId }], [cached])[0]?.gameId).toBe(
    gameId,
  )
  const corrected = {
    ...base,
    data: base.data.map((game) => ({ ...game, score: { home: 101, away: 90 } })),
  }
  for (const candidate of [null, { ...base, staleUntil: 0 }, corrected])
    expect(verifiedPlayerBox(candidate, box, ref, 2027, Date.now())).toBeNull()
  expect(verifiedPlayerBox(base, { ...box, staleUntil: 0 }, ref, 2027, Date.now())).toBeNull()
})

it('reimports into SQLite without dropping enrichment, downgrading observations or accepting bad pages', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bbs-player-test-'))
  const dbPath = join(dir, 'test.sqlite')
  const db = new DatabaseSync(dbPath)
  try {
    db.exec(
      'CREATE TABLE nba_cache(cache_key TEXT PRIMARY KEY, provider TEXT, capability TEXT, stale_until_ms INTEGER, record_json TEXT)',
    )
    db.exec(
      readFileSync(new URL('../../../../migrations/0006_bbs_players.sql', import.meta.url), 'utf8'),
    )
    const keep = db.prepare('INSERT OR REPLACE INTO nba_cache VALUES (?, ?, ?, ?, ?)')
    const save = (row: { cacheKey: string; capability: string; staleUntil: number }) =>
      keep.run(row.cacheKey, 'bbs', row.capability, row.staleUntil, JSON.stringify(row))
    const teamId = (index: number) => '10000000-0000-0000-0000-' + String(index).padStart(12, '0')
    save({
      cacheKey: 'bbs:nba:team-directory:season=2027',
      capability: 'teamDirectory',
      provider: 'bbs',
      staleUntil: expiry,
      data: Array.from({ length: 30 }, (_, index) => ({
        providerTeamId: teamId(index),
        teamId:
          'nba:team:' +
          (index === 0
            ? 'BOS'
            : index === 1
              ? 'NYK'
              : 'X' + String.fromCharCode(65 + Math.floor(index / 26), 65 + (index % 26))),
      })),
    } as { cacheKey: string; capability: string; staleUntil: number })
    save(base)
    save(box)
    const write = (name: string, payload: unknown, at = baseAt) => {
      const filename = join(dir, name + '.json')
      writeFileSync(filename, JSON.stringify(payload))
      utimesSync(filename, new Date(at), new Date(at))
    }
    const directory = {
      data: [{ id, name: 'Synthetic Player', team: { id: teamId(0), league: 'NBA' } }],
      pagination: { offset: 0, total: 1 },
      meta: { filters_applied: { season: 2026, league_scope: { mode: 'requested_season' } } },
    }
    const avg = 'average-2026-' + id
    const profile = 'profile-2026-' + id
    const log = 'log-2026-' + id
    const load = () =>
      JSON.parse(
        db.prepare('SELECT payload FROM nba_player_snapshot').get()!.payload as string,
      ) as StoredPlayers
    const run = () =>
      execFileSync(
        process.execPath,
        ['--experimental-strip-types', 'scripts/bbs-players-import.mjs', dir, dbPath, '2026'],
        { stdio: 'pipe' },
      )
    write('directory-2026-0', directory)
    write(avg, { data: [{ player_id: id, season: 2026, games_played: 3, pts: 21, min: '21:30' }] })
    write(profile, {
      data: {
        player: { id, league: 'NBA', date_of_birth: '2000-01-01', current_team: { id: teamId(0) } },
      },
    })
    write(log, { data: [{ date: baseDate, abbr: 'NYK', pts: 24, match_id: 'synthetic' }] })
    run()
    const initial = load()
    expect(isStoredPlayers(initial)).toBe(true)
    expect(initial.gameRefs[playerId]).toEqual([ref])
    expect(initial.details[playerId]?.games[0]).toMatchObject({ pts: 24, gameId: null })
    const sqliteReader = {
      prepare: (query: string) => ({
        bind: (season: number) => ({
          first: async () => db.prepare(query.replace('?1', '?')).get(season),
        }),
      }),
    } as unknown as D1Database
    const read = () =>
      readPlayerSnapshot(
        sqliteReader,
        {
          async getCache(key) {
            const raw = db.prepare('SELECT record_json FROM nba_cache WHERE cache_key=?').get(key)
            return raw ? (JSON.parse(raw.record_json as string) as NbaCacheRecord) : null
          },
        },
        2027,
        Date.now(),
        playerId,
      )
    expect(await read()).toMatchObject({
      status: 'ready',
      data: { detail: { games: [{ gameId, pts: 24 }] } },
    })
    save({
      ...base,
      data: base.data.map((game) => ({ ...game, score: { home: 101, away: 90 } })),
    } as typeof base)
    expect(await read()).toMatchObject({
      status: 'ready',
      data: { detail: { games: [{ gameId: null, pts: 24 }] } },
    })
    db.prepare('DELETE FROM nba_cache WHERE cache_key=?').run(baseKey)
    expect(await read()).toMatchObject({
      status: 'ready',
      data: { detail: { games: [{ gameId: null, pts: 24 }] } },
    })

    rmSync(join(dir, profile + '.json'))
    rmSync(join(dir, log + '.json'))
    write(
      avg,
      { data: [{ player_id: id, season: 2026, games_played: 4, pts: 23 }] },
      '2026-11-18T05:00:00.000Z',
    )
    save({ ...base, staleUntil: 0 })
    run()
    const newer = load()
    expect(newer.players[0]?.stats?.pts).toBe(23)
    expect(newer.details).toEqual(initial.details)
    expect(newer.coverage.enriched).toBe(1)
    expect(newer.gameRefs).toEqual({})
    write(avg, { data: [{ player_id: id, season: 2026, games_played: 3, pts: 1 }] })
    run()
    expect(load()).toEqual(newer)
    write(
      avg,
      { data: [{ player_id: 'wrong-player', season: 2026, games_played: 99 }] },
      '2026-11-19T05:00:00.000Z',
    )
    write(log, { data: [{ date: '2026-11-31', pts: 99 }] }, '2026-11-19T05:00:00.000Z')
    run()
    expect(load()).toEqual(newer)

    write('directory-2026-0', { ...directory, pagination: { total: 2, offset: 0 } })
    expect(run).toThrow()
    expect(load()).toEqual(newer)
    write('directory-2026-0', {
      ...directory,
      pagination: { total: 2, offset: 0 },
      data: [...directory.data, ...directory.data],
    })
    expect(run).toThrow()
    expect(load()).toEqual(newer)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
