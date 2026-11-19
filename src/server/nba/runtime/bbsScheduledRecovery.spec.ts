// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import archive from '../../../../docs/fixtures/bbs-standings.sanitized.json'
import gamesFixture from '../../../../docs/fixtures/bbs.synthetic.json'
import type { GameId, NbaGameDate, SeasonEndYear, UtcTimestamp } from '@/entities/nba/model'
import { NBA_TEAMS } from '@/entities/nba/teamCatalog'
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
const teamReference = references.find(({ teamId }) => teamId === bos.team.id)!
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
        const match = {
          ...gamesFixture.data[0]!,
          game_date: date,
          kickoff_utc: `${date}T23:00:00.000Z`,
        }
        return Response.json({ data: [match], pagination: { total: 1 } })
      }
      case '/v1/nba/games/90000001':
        return Response.json({
          data: {
            id: 90000001,
            game_date: previousDate,
            home: { team_id: '1610612738', pts: 112 },
            away: { team_id: '1610612752', pts: 108 },
          },
        })
      case '/v1/nba/games/synthetic-final-match-uuid/box':
        return Response.json({
          data: {
            id: 'synthetic-final-match-uuid',
            home: [{ player_id: 'bos-fixture', player_name: 'Fixture Home', pts: 112 }],
            away: [{ player_id: 'nyk-fixture', player_name: 'Fixture Away', pts: 108 }],
          },
        })
      case `/v1/teams/${teamReference.providerTeamId}/season`:
        return Response.json({
          data: {
            team_meta: { id: teamReference.providerTeamId, abbreviation: 'BOS' },
            season: '2026-27',
            record: '10-10',
          },
        })
      default:
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
      data: { game: { id: boxId }, teams: expect.any(Array), players: expect.any(Array) },
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
    for (let attempts = 1; attempts < 5; attempts++) {
      const next = (await repository.getScheduledBbsProgress())!.tasks[0]!
      expect(next).toMatchObject({ task: standingsTask, attempts })
      expect(
        (await h.tick(Math.max(Date.now() + 10 * minute, next.retryAt!)))[0]?.error?.code,
      ).toBe('invalid_response')
    }
    const failedAt = Date.now()
    expect(await repository.getScheduledBbsProgress()).toEqual({
      cycleDate,
      cursor: 0,
      pauseUntil: null,
      tasks: [],
      failedTasks: [{ task: standingsTask, errorCode: 'invalid_response', failedAt }],
    })
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('standings:invalid_response'))
    expect(h.requests.filter((path) => path === '/v1/standings')).toHaveLength(5)
    expect(await h.tick(failedAt + day / 4)).toEqual([])

    h.response.malformedStandings = false
    expect((await h.tick('2026-11-19T15:00:00Z'))[0]?.state).toBe('refreshed')
    expect((await repository.getScheduledBbsProgress())?.failedTasks).toBeUndefined()
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
    expect((await h.tick('2026-11-18T15:30:00Z'))[0]?.state).toBe('refreshed')
    expect((await h.tick('2026-11-18T15:40:00Z'))[0]?.target).toEqual(standingsTask)
    expect((await repository.getCache(standingsKey))?.data).toHaveLength(30)
  })
})
