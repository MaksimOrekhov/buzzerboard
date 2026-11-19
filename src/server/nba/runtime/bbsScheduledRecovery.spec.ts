// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import archive from '../../../../docs/fixtures/bbs-standings.sanitized.json'
import gamesFixture from '../../../../docs/fixtures/bbs.synthetic.json'
import type {
  GameBoxScore,
  GameId,
  NbaGameDate,
  SeasonEndYear,
  UtcTimestamp,
} from '@/entities/nba/model'
import { NBA_TEAMS } from '@/entities/nba/teamCatalog'
import { normalizeBbsGames } from '@/server/nba/adapters/bbs'
import { getDateKeyInTimeZone, NBA_TIME_ZONE } from '@/shared/utils/nbaDate'
import { normalizeBbsStandings, normalizeBbsTeamDirectory } from '@/server/nba/adapters/bbsTeams'
import {
  gameDetailsCacheKey,
  gamesCacheKey,
  standingsCacheKey,
  teamDirectoryCacheKey,
  teamSeasonCacheKey,
} from './cacheKeys'
import { D1NbaRepository } from './d1Repository'
import { runScheduledRefresh } from './refresh'
import { SqliteTestD1 } from './sqliteD1.test-helper'
import { scheduledBbsTaskKey, type ScheduledBbsProgress, type ScheduledBbsTask } from './types'

const minute = 60_000
const day = 24 * 60 * minute
const seasonEndYear = 2027 as SeasonEndYear
const cycleDate = '2026-11-18' as NbaGameDate
const previousDate = '2026-11-17' as NbaGameDate
const standingsTask = { type: 'standings', seasonEndYear } as const
const directoryTask = { type: 'teamDirectory', seasonEndYear } as const
const standingsKey = standingsCacheKey('bbs', seasonEndYear)
const directoryKey = teamDirectoryCacheKey('bbs', seasonEndYear)
const references = normalizeBbsTeamDirectory(archive.standings, archive.directory, seasonEndYear)
const bos = NBA_TEAMS.find((team) => team.code === 'BOS')!
const boxId = 'bbs:game:synthetic-final-match-uuid' as GameId

afterEach(() => vi.restoreAllMocks())

function work(task: ScheduledBbsTask, retryAt: number | null = null) {
  return { task, attempts: 0, retryAt }
}

function legacyQueue(pauseUntil: number): ScheduledBbsProgress {
  const dates = Array.from(
    { length: 15 },
    (_, offset) => `2026-11-${11 + offset}` as NbaGameDate,
  ).filter((date) => date !== previousDate)
  return {
    cycleDate,
    cursor: 0,
    pauseUntil,
    tasks: [
      work(standingsTask),
      work(directoryTask),
      work({ type: 'games', date: previousDate }),
      work({ type: 'lateGames', date: previousDate }, Date.parse('2026-11-18T17:00:00Z')),
      ...dates.map((date) => work({ type: 'games', date })),
      ...NBA_TEAMS.map(({ code }) => work({ type: 'teamSeason', seasonEndYear, teamCode: code })),
      work({ type: 'enrichStandings', seasonEndYear }),
    ],
  }
}

function busyDayMatches(date: NbaGameDate, gameCount: number, final: boolean) {
  const providerReferences: Record<string, string> = {}
  const teams = NBA_TEAMS.slice(0, gameCount * 2)
  const matches = Array.from({ length: gameCount }, (_, index) => {
    const home = teams[index * 2]!
    const away = teams[index * 2 + 1]!
    const homeReference = references.find(({ teamId }) => teamId === home.team.id)!
    const awayReference = references.find(({ teamId }) => teamId === away.team.id)!
    const matchId = `cycle-${date.replaceAll('-', '')}-${index + 1}`
    const archiveGameId = String(95_000_000 + Number(date.slice(-2)) * 100 + index)
    const archiveHomeId = String(100_000_000 + index * 2)
    const archiveAwayId = String(100_000_001 + index * 2)
    const match = structuredClone(gamesFixture.data[0]!) as unknown as Record<string, unknown>
    const homeSide = structuredClone(match.home as Record<string, unknown>)
    const awaySide = structuredClone(match.away as Record<string, unknown>)
    Object.assign(match, {
      id: matchId,
      archive_game_id: archiveGameId,
      season: 2026,
      game_date: date,
      kickoff_utc: `${date}T23:00:00.000Z`,
      status: final ? 'finished' : 'scheduled',
    })
    Object.assign(homeSide, {
      team_id: homeReference.providerTeamId,
      archive_team_id: archiveHomeId,
      abbreviation: home.code,
      name: home.name,
      score: final ? 110 + index : null,
    })
    Object.assign(awaySide, {
      team_id: awayReference.providerTeamId,
      archive_team_id: archiveAwayId,
      abbreviation: away.code,
      name: away.name,
      score: final ? 100 + index : null,
    })
    match.home = homeSide
    match.away = awaySide
    const gameId = `bbs:game:${matchId}`
    providerReferences[gameId] = archiveGameId
    providerReferences[`${gameId}:team:home`] = archiveHomeId
    providerReferences[`${gameId}:team:away`] = archiveAwayId
    return match
  })
  return { matches, providerReferences }
}

function harness(initialTime: string) {
  let now = Date.parse(initialTime)
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const d1 = new SqliteTestD1()
  const repository = new D1NbaRepository(d1)
  const env = {
    NBA_DB: d1,
    BBS_API_KEY: 'fixture-only',
    BBS_API_BASE_URL: 'https://fixture.invalid',
    BBS_REFRESH_ENABLED: 'true',
    BBS_PLAYER_REFRESH_ENABLED: 'false',
    BBS_REQUEST_INTERVAL_MS: '0',
    BBS_DAILY_REQUEST_LIMIT: '150',
    BBS_PER_MINUTE_REQUEST_LIMIT: '10',
    BBS_REQUEST_HEADROOM: '25',
  }
  const operationCounts: number[] = []
  const requests: string[] = []
  const response = {
    standingsStatus: 200,
    malformedStandings: false,
    directoryHasStandingsAliases: true,
    gamesMissingArchiveReferences: false,
    realisticBusyDays: false,
  }
  const findBusyMatch = (key: 'id' | 'archive_game_id', value: string) => {
    for (let dayOfMonth = 11; dayOfMonth <= 25; dayOfMonth += 1) {
      const date = `2026-11-${String(dayOfMonth).padStart(2, '0')}` as NbaGameDate
      const count = [12, 13, 14, 15, 12, 13, 14][(dayOfMonth - 11) % 7]!
      const matches = busyDayMatches(date, count, true).matches
      const match = matches.find((entry) => String(entry[key]) === value)
      if (match) return match
    }
    return null
  }
  const fetcher = async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    expect(url.hostname).toBe('fixture.invalid')
    requests.push(url.pathname)
    switch (url.pathname) {
      case '/v1/standings': {
        if (response.standingsStatus === 429)
          return Response.json({}, { status: 429, headers: { 'retry-after': '1200' } })
        const payload = structuredClone(archive.standings)
        if (response.malformedStandings) payload.data.standings[0]!.rows[0]!.wins = 100
        return Response.json(payload, { headers: { 'x-ratelimit-remaining': '99' } })
      }
      case '/v1/teams':
        return Response.json(
          response.directoryHasStandingsAliases
            ? archive.directory
            : { data: archive.directory.data.map(({ id, short_name }) => ({ id, short_name })) },
        )
      case '/v1/matches': {
        const date = url.searchParams.get('date')
        if (response.realisticBusyDays && date) {
          const nbaDate = date as NbaGameDate
          const today = getDateKeyInTimeZone(new Date(now), NBA_TIME_ZONE)
          const dayOfMonth = Number(date.slice(-2))
          const gameCount = date < today ? [12, 13, 14, 15, 12, 13, 14][(dayOfMonth - 11) % 7]! : 12
          const { matches } = busyDayMatches(nbaDate, gameCount, date < today)
          return Response.json({ data: matches, pagination: { total: matches.length } })
        }
        const match = {
          ...gamesFixture.data[0]!,
          game_date: date,
          kickoff_utc: `${date}T23:00:00.000Z`,
        }
        if (response.gamesMissingArchiveReferences) {
          delete (match as Record<string, unknown>).archive_game_id
          delete (match.home as Record<string, unknown>).archive_team_id
          delete (match.away as Record<string, unknown>).archive_team_id
        }
        return Response.json({ data: [match], pagination: { total: 1 } })
      }
      default:
        if (url.pathname.startsWith('/v1/nba/games/') && url.pathname.endsWith('/box')) {
          const matchId = decodeURIComponent(url.pathname.split('/').at(-2)!)
          const match = response.realisticBusyDays
            ? findBusyMatch('id', matchId)
            : gamesFixture.data[0]
          if (!match) throw new Error(`Missing fixture match ${matchId}`)
          return Response.json({
            data: {
              id: matchId,
              home: [{ player_id: `home-${matchId}`, player_name: 'Fixture Home' }],
              away: [{ player_id: `away-${matchId}`, player_name: 'Fixture Away' }],
            },
          })
        }
        if (url.pathname.startsWith('/v1/nba/games/')) {
          const archiveId = decodeURIComponent(url.pathname.split('/').at(-1)!)
          const match = response.realisticBusyDays
            ? findBusyMatch('archive_game_id', archiveId)
            : gamesFixture.data[0]
          if (!match) throw new Error(`Missing fixture archive game ${archiveId}`)
          const home = match.home as Record<string, unknown>
          const away = match.away as Record<string, unknown>
          return Response.json({
            data: {
              id: archiveId,
              game_date: response.realisticBusyDays ? match.game_date : previousDate,
              home: { team_id: home.archive_team_id, pts: home.score },
              away: { team_id: away.archive_team_id, pts: away.score },
            },
          })
        }
        if (url.pathname.startsWith('/v1/teams/') && url.pathname.endsWith('/season')) {
          const providerId = decodeURIComponent(url.pathname.split('/').at(-2)!)
          const reference = references.find((entry) => entry.providerTeamId === providerId)
          const team = reference && NBA_TEAMS.find((entry) => entry.team.id === reference.teamId)
          if (!reference || !team) throw new Error(`Missing fixture team ${providerId}`)
          return Response.json({
            data: {
              team_meta: { id: providerId, abbreviation: team.code },
              season: '2026-27',
              record: '10-10',
            },
          })
        }
        throw new Error(`Unexpected fixture request ${url.pathname}`)
    }
  }
  const tick = (time: string | number = now) => {
    now = typeof time === 'string' ? Date.parse(time) : time
    const before = d1.operations
    return runScheduledRefresh(env, repository, fetcher, now).finally(() => {
      const count = d1.operations - before
      operationCounts.push(count)
      expect(count).toBeLessThanOrEqual(50)
    })
  }
  const timestamp = (time: number) => new Date(time).toISOString() as UtcTimestamp
  const cacheBase = (expiresAt: number) => ({
    provider: 'bbs' as const,
    fetchedAt: timestamp(now - day),
    providerUpdatedAt: null,
    rejectedRecords: 0,
    expiresAt,
    staleUntil: now + 5 * day,
    retryAt: null,
    refreshError: null,
  })
  const seedDirectory = (options: { legacy?: boolean; expired?: boolean } = {}) =>
    repository.putCache({
      ...cacheBase(options.expired ? now - minute : now + 2 * day),
      cacheKey: directoryKey,
      capability: 'teamDirectory',
      seasonEndYear,
      data: options.legacy
        ? references.map(({ teamId, standingsTeamId }) => ({
            teamId,
            providerTeamId: standingsTeamId!,
          }))
        : references,
    })
  const seedStandings = async () => {
    const previous = {
      ...cacheBase(now - minute),
      cacheKey: standingsKey,
      capability: 'standings' as const,
      data: normalizeBbsStandings(archive.standings, seasonEndYear, references),
    }
    await repository.putCache(previous)
    return previous
  }
  const seedQueue = (progress: ScheduledBbsProgress) =>
    d1.database
      .prepare("INSERT INTO nba_scheduled_refresh VALUES ('bbs-daily', ?, ?)")
      .run(JSON.stringify(progress), now)
  const ledger = () =>
    d1.database
      .prepare(
        "SELECT rate_key, request_count FROM nba_rate_limits WHERE rate_key LIKE 'bbs:utc-day:%' ORDER BY rate_key",
      )
      .all()
  return {
    d1,
    repository,
    requests,
    response,
    operationCounts,
    tick,
    seedDirectory,
    seedStandings,
    seedQueue,
    ledger,
  }
}

describe('production-shaped BBS queue recovery through the outer scheduler', () => {
  it('completes a realistic 15-date catch-up across UTC midnight and starts the next ET plan', async () => {
    const startText = '2026-11-18T23:50:00Z'
    const start = Date.parse(startText)
    const h = harness(startText)
    h.response.realisticBusyDays = true
    await h.seedDirectory()

    const dateCounts = [12, 13, 14, 15, 12, 13, 14]
    const missingBoxKeys = new Set<string>()
    const nullLine = { made: null, attempted: null, percentage: null }
    for (let dayOfMonth = 11; dayOfMonth <= 17; dayOfMonth += 1) {
      const date = `2026-11-${String(dayOfMonth).padStart(2, '0')}` as NbaGameDate
      const gameCount = dateCounts[(dayOfMonth - 11) % dateCounts.length]!
      const { matches, providerReferences } = busyDayMatches(date, gameCount, true)
      const fetchedAt = new Date(start - day).toISOString() as UtcTimestamp
      const snapshot = normalizeBbsGames(
        { data: { matches, pagination: { total: matches.length } } },
        { fetchedAt, stale: true },
      )
      await h.repository.putCache({
        cacheKey: gamesCacheKey('bbs', date),
        capability: 'games',
        provider: 'bbs',
        data: snapshot.data,
        providerReferences,
        fetchedAt,
        providerUpdatedAt: null,
        rejectedRecords: snapshot.meta.rejectedRecords,
        expiresAt: start - 1,
        staleUntil: start + 7 * day,
        retryAt: null,
        refreshError: null,
      })
      for (const [index, game] of snapshot.data.entries()) {
        if (missingBoxKeys.has(`${date}:${index + 1}`)) continue
        const score = game.score
        const box: GameBoxScore = {
          game,
          teams: [
            {
              team: game.homeTeam,
              points: score.home,
              fieldGoals: nullLine,
              threePointers: nullLine,
              freeThrows: nullLine,
              rebounds: null,
              offensiveRebounds: null,
              defensiveRebounds: null,
              assists: null,
              steals: null,
              blocks: null,
              turnovers: null,
              fouls: null,
              plusMinus: null,
            },
            {
              team: game.awayTeam,
              points: score.away,
              fieldGoals: nullLine,
              threePointers: nullLine,
              freeThrows: nullLine,
              rebounds: null,
              offensiveRebounds: null,
              defensiveRebounds: null,
              assists: null,
              steals: null,
              blocks: null,
              turnovers: null,
              fouls: null,
              plusMinus: null,
            },
          ],
          players: [],
        }
        await h.repository.putCache({
          cacheKey: gameDetailsCacheKey('bbs', game.id),
          capability: 'boxScore',
          gameId: game.id,
          provider: 'bbs',
          data: box,
          fetchedAt,
          providerUpdatedAt: null,
          rejectedRecords: 0,
          expiresAt: start + 2 * day,
          staleUntil: start + 30 * day,
          retryAt: null,
          refreshError: null,
        })
      }
    }

    for (let reservation = 0; reservation < 149; reservation += 1) {
      const reserved = await h.repository.reserveBbsRequest(
        start - (149 - reservation) * minute,
        150,
        10,
      )
      expect(reserved.allowed).toBe(true)
    }
    h.response.standingsStatus = 429
    const blocked = await h.tick(start)
    expect(blocked[0]?.error?.code).toBe('rate_limited')
    expect(h.ledger()).toEqual([{ rate_key: 'bbs:utc-day:2026-11-18', request_count: 150 }])
    const retryAtMidnight = Date.parse('2026-11-19T00:00:00Z')
    expect(await h.tick(retryAtMidnight)).toEqual([])
    expect((await h.repository.getScheduledBbsProgress())?.pauseUntil).toBe(
      Date.parse('2026-11-19T00:10:00Z'),
    )

    h.response.standingsStatus = 200
    let tickAt = Date.parse('2026-11-19T00:10:00Z')
    await h.tick(tickAt)
    tickAt += 10 * minute
    for (let tick = 0; tick < 100; tick += 1) {
      const progress = await h.repository.getScheduledBbsProgress()
      if (progress?.cycleDate === cycleDate && progress.tasks.length === 0) break
      await h.tick(tickAt)
      tickAt += 10 * minute
    }

    const completed = (await h.repository.getScheduledBbsProgress())!
    expect(completed.cycleDate).toBe(cycleDate)
    expect(completed.tasks).toEqual([])
    expect(completed.failedTasks).toBeUndefined()
    expect(tickAt).toBeLessThan(Date.parse('2026-11-19T15:00:00Z'))
    expect(h.operationCounts.length).toBeGreaterThan(45)
    expect(Math.max(...h.operationCounts)).toBeLessThanOrEqual(50)
    expect(h.requests.filter((path) => path === '/v1/matches').length).toBe(16)
    expect(
      h.d1.database
        .prepare(
          "SELECT COUNT(*) AS count FROM nba_cache WHERE capability='games' AND provider='bbs'",
        )
        .get(),
    ).toEqual({ count: 15 })
    expect(
      h.d1.database
        .prepare(
          "SELECT COUNT(*) AS count FROM nba_cache WHERE capability='boxScore' AND provider='bbs'",
        )
        .get(),
    ).toEqual({ count: dateCounts.reduce((total, count) => total + count, 0) })
    expect((await h.repository.getCache(standingsKey))?.data).toHaveLength(30)
    expect(h.ledger()).toHaveLength(1)
    expect(h.ledger()[0]!.request_count).toBeLessThan(150)

    const nextPlan = await h.tick('2026-11-19T15:00:00Z')
    expect(nextPlan[0]?.state).toBe('up_to_date')
    expect((await h.repository.getScheduledBbsProgress())?.cycleDate).toBe('2026-11-19')
    expect((await h.repository.getScheduledBbsProgress())?.tasks.length).toBeGreaterThan(0)
  })

  it('resumes the 49 stored tasks after UTC reset and an expired lease, preserving retry state at the next ET plan', async () => {
    const h = harness('2026-11-18T23:50:00Z')
    const { repository } = h
    const midnight = Date.parse('2026-11-19T00:00:00Z')
    const latestRetry = Date.parse('2026-11-19T18:00:00Z')
    const progress = legacyQueue(midnight)
    expect(progress.tasks).toHaveLength(49)
    h.seedQueue(progress)
    await h.seedDirectory({ legacy: true })
    await repository.reserveBbsRequest(midnight - 11 * minute, 150, 10)
    expect(await h.tick()).toEqual([])
    expect(await repository.getScheduledBbsProgress()).toEqual(progress)
    await repository.tryAcquireLock(
      'bbs:scheduled-queue',
      'old-worker-lease',
      midnight - minute,
      midnight + minute,
    )
    expect(await h.tick(midnight)).toEqual([])
    expect(h.requests).toEqual([])
    expect(h.ledger()).toEqual([])

    expect((await h.tick(midnight + 10 * minute))[0]).toMatchObject({
      target: standingsTask,
      state: 'refreshed',
    })
    expect(await repository.getScheduledBbsProgress()).toEqual({
      ...progress,
      pauseUntil: null,
      tasks: progress.tasks.slice(1),
    })
    expect((await repository.getCache(standingsKey))?.data).toHaveLength(30)
    expect(h.ledger()).toEqual([{ rate_key: 'bbs:utc-day:2026-11-19', request_count: 1 }])
    expect(h.requests).toEqual(['/v1/standings'])

    const saved = (await repository.getScheduledBbsProgress())!
    const waiting = {
      ...work({ type: 'teamSeason', seasonEndYear, teamCode: 'BOS' }, latestRetry),
      attempts: 2,
    }
    await repository.putScheduledBbsProgress({
      ...saved,
      tasks: saved.tasks.map((item) =>
        scheduledBbsTaskKey(item.task) === scheduledBbsTaskKey(waiting.task) ? waiting : item,
      ),
    })
    await h.tick('2026-11-19T15:00:00Z')
    const rolled = (await repository.getScheduledBbsProgress())!
    expect(rolled.cycleDate).toBe('2026-11-19')
    expect(rolled.tasks).toContainEqual(waiting)
    expect(new Set(rolled.tasks.map(({ task }) => scheduledBbsTaskKey(task))).size).toBe(
      rolled.tasks.length,
    )
    expect(
      rolled.tasks.some(({ task }) => task.type === 'games' && task.date === '2026-11-11'),
    ).toBe(false)
    expect(
      rolled.tasks.some(({ task }) => task.type === 'games' && task.date === '2026-11-19'),
    ).toBe(true)
  })

  it.each(['missing', 'expired'])(
    'bootstraps a %s crosswalk with one standings and one directory request',
    async (kind) => {
      const h = harness('2026-11-18T15:00:00Z')
      if (kind === 'expired') await h.seedDirectory({ expired: true })
      expect((await h.tick())[0]).toMatchObject({
        target: standingsTask,
        error: { code: 'cache_miss' },
      })
      expect(h.requests).toEqual([])
      expect((await h.repository.getScheduledBbsProgress())?.pauseUntil).toBeNull()

      expect((await h.tick('2026-11-18T15:10:00Z'))[0]).toMatchObject({
        target: directoryTask,
        state: 'refreshed',
      })
      expect((await h.tick('2026-11-18T15:20:00Z'))[0]).toMatchObject({
        target: standingsTask,
        state: 'up_to_date',
      })
      expect(h.requests).toEqual(['/v1/standings', '/v1/teams'])
      expect(h.ledger()).toEqual([{ rate_key: 'bbs:utc-day:2026-11-18', request_count: 2 }])
      expect((await h.repository.getCache(directoryKey))?.data).toEqual(references)
      expect((await h.repository.getCache(standingsKey))?.data).toHaveLength(30)
    },
  )

  it('reuses previously verified distinct IDs when the directory no longer advertises the standings alias', async () => {
    const h = harness('2026-11-18T15:00:00Z')
    await h.seedDirectory({ expired: true })
    await h.seedStandings()
    h.response.directoryHasStandingsAliases = false
    expect((await h.tick())[0]?.error?.code).toBe('cache_miss')
    expect((await h.tick('2026-11-18T15:10:00Z'))[0]?.state).toBe('refreshed')
    expect((await h.repository.getCache(directoryKey))?.data).toEqual(references)
    expect((await h.tick('2026-11-18T15:20:00Z'))[0]?.state).toBe('refreshed')
    expect(h.requests).toEqual(['/v1/teams', '/v1/standings'])
  })

  it('retains the previous standings and lets games, final boxes and teams finish before bounded retries exhaust', async () => {
    const h = harness('2026-11-18T15:00:00Z')
    const { repository } = h
    await h.seedDirectory()
    const previous = await h.seedStandings()
    h.seedQueue({
      cycleDate,
      cursor: 0,
      pauseUntil: null,
      tasks: [
        work(standingsTask),
        work({ type: 'games', date: previousDate }),
        work({ type: 'teamSeason', teamCode: 'BOS', seasonEndYear }),
        work({ type: 'enrichStandings', seasonEndYear }),
      ],
    })
    h.response.malformedStandings = true
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await h.tick())[0]?.error).toMatchObject({ code: 'invalid_response' })
    expect(await repository.getCache(standingsKey)).toMatchObject({
      data: previous.data,
      fetchedAt: previous.fetchedAt,
      refreshError: { code: 'invalid_response' },
    })
    expect((await repository.getScheduledBbsProgress())?.pauseUntil).toBeNull()
    await h.tick('2026-11-18T15:10:00Z')
    expect((await repository.getCache(gamesCacheKey('bbs', previousDate)))?.data).toHaveLength(1)
    await h.tick('2026-11-18T15:20:00Z')
    expect(await repository.getCache(gameDetailsCacheKey('bbs', boxId))).toMatchObject({
      capability: 'boxScore',
      data: null,
      refreshError: { code: 'invalid_response' },
    })
    await h.tick('2026-11-18T15:30:00Z')
    expect(
      await repository.getCache(teamSeasonCacheKey('bbs', bos.team.id, seasonEndYear)),
    ).toMatchObject({
      capability: 'teamSeason',
      teamId: bos.team.id,
    })
    await h.tick('2026-11-18T15:40:00Z')
    expect(Math.max(...h.operationCounts)).toBe(47)
    for (let retry = 0; retry < 60; retry += 1) {
      const current = (await repository.getScheduledBbsProgress())!
      if (current.failedTasks?.some(({ task }) => task.type === 'standings')) break
      const nextRetryAt = current.tasks[0]?.retryAt ?? Date.now()
      await h.tick(Math.max(Date.now() + 10 * minute, nextRetryAt))
    }
    const failedAt = Date.now()
    const exhausted = (await repository.getScheduledBbsProgress())!
    expect(exhausted.failedTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task: standingsTask,
          errorCode: 'invalid_response',
          failedAt,
          diagnostic: expect.objectContaining({ phase: 'standings' }),
        }),
      ]),
    )
    expect(
      warning.mock.calls.some(([message]) => {
        if (typeof message !== 'string') return false
        try {
          return JSON.parse(message).phase === 'standings'
        } catch {
          return false
        }
      }),
    ).toBe(true)
    expect(h.requests.filter((path) => path === '/v1/standings')).toHaveLength(5)
    expect(
      (await h.tick(failedAt + day / 4)).some(({ target }) => target.type === 'standings'),
    ).toBe(false)

    h.response.malformedStandings = false
    expect((await h.tick('2026-11-19T15:00:00Z'))[0]?.state).toBe('refreshed')
    expect(
      (await repository.getScheduledBbsProgress())?.failedTasks?.some(
        ({ task }) => task.type === 'standings',
      ),
    ).toBe(false)
    expect((await repository.getCache(standingsKey))?.refreshError).toBeNull()
  })

  it('holds all provider work for a genuine 429 until Retry-After across midnight', async () => {
    const h = harness('2026-11-18T23:50:00Z')
    const { repository } = h
    await h.seedDirectory()
    h.seedQueue({
      cycleDate,
      cursor: 0,
      pauseUntil: null,
      tasks: [work(standingsTask), work({ type: 'games', date: previousDate })],
    })
    h.response.standingsStatus = 429
    expect((await h.tick())[0]?.error).toMatchObject({ code: 'rate_limited', upstreamStatus: 429 })
    const blocked = (await repository.getScheduledBbsProgress())!
    expect(blocked.pauseUntil).toBe(Date.parse('2026-11-19T00:10:00Z'))
    expect(blocked.tasks[0]?.attempts).toBe(0)
    expect((await repository.getProviderCooldown('bbs'))?.retryAt).toBe(blocked.pauseUntil)
    expect(await h.tick('2026-11-19T00:00:00Z')).toEqual([])
    expect(h.requests).toEqual(['/v1/standings'])
    expect(await repository.getScheduledBbsProgress()).toEqual(blocked)
    h.response.standingsStatus = 200
    expect((await h.tick('2026-11-19T00:10:00Z'))[0]?.state).toBe('refreshed')
    expect(h.ledger()).toEqual([{ rate_key: 'bbs:utc-day:2026-11-19', request_count: 1 }])
    expect((await repository.getScheduledBbsProgress())?.tasks).toEqual(blocked.tasks.slice(1))
  })

  it('stores a per-game archive-reference failure without rejecting the date or requeueing a loop', async () => {
    const h = harness('2026-11-18T15:00:00Z')
    h.response.gamesMissingArchiveReferences = true
    h.seedQueue({
      cycleDate,
      cursor: 0,
      pauseUntil: null,
      tasks: [work({ type: 'games', date: previousDate }), work(standingsTask)],
    })

    const result = await h.tick()
    const progress = (await h.repository.getScheduledBbsProgress())!

    expect(result[0]).toMatchObject({ state: 'refreshed', error: null })
    expect(await h.repository.getCache(gamesCacheKey('bbs', previousDate))).toMatchObject({
      capability: 'games',
      data: [expect.objectContaining({ status: 'final' })],
    })
    expect(progress.tasks.map(({ task }) => task)).toEqual([standingsTask])
    expect(progress.failedTasks).toMatchObject([
      {
        task: { type: 'boxScore', date: previousDate, gameId: boxId },
        errorCode: 'cache_miss',
        diagnostic: {
          phase: 'box_score_archive_references',
          expectedCount: 3,
          actualCount: 0,
        },
      },
    ])
    expect(h.requests).toEqual(['/v1/matches'])
  })

  it('preserves the work item across storage failure and does not count an unavailable resource lease as a provider attempt', async () => {
    const h = harness('2026-11-18T15:00:00Z')
    const { repository } = h
    await h.seedDirectory()
    const progress = {
      cycleDate,
      cursor: 0,
      pauseUntil: null,
      tasks: [work(standingsTask), work({ type: 'games', date: previousDate })],
    }
    h.seedQueue(progress)
    const storageError = Object.assign(new Error('D1 simulated write failure'), {
      code: 'SQLITE_IOERR',
    })
    vi.spyOn(repository, 'putCacheIfLockOwned').mockRejectedValueOnce(storageError)
    await expect(h.tick()).rejects.toBe(storageError)
    expect(await repository.getScheduledBbsProgress()).toEqual(progress)
    expect(await repository.getProviderCooldown('bbs')).toMatchObject({ retryAt: 0 })
    expect(await repository.getCache(standingsKey)).toBeNull()
    expect(
      await repository.tryAcquireLock(
        'bbs:standings:season=2027',
        'other-worker',
        Date.now(),
        Date.now() + 15 * minute,
      ),
    ).toBe(true)
    expect((await h.tick('2026-11-18T15:10:00Z'))[0]?.state).toBe('in_progress')
    expect((await repository.getScheduledBbsProgress())?.tasks.at(-1)).toMatchObject({
      task: standingsTask,
      attempts: 0,
    })
    expect((await h.tick('2026-11-18T15:20:00Z'))[0]?.target.type).toBe('games')
    let recoveredStandings = false
    for (let tick = 0; tick < 10; tick += 1) {
      const results = await h.tick(Date.parse('2026-11-18T15:30:00Z') + tick * 10 * minute)
      if (results.some(({ target }) => target.type === 'standings')) {
        recoveredStandings = true
        break
      }
    }
    expect(recoveredStandings).toBe(true)
    expect((await repository.getCache(standingsKey))?.data).toHaveLength(30)
  })
})
