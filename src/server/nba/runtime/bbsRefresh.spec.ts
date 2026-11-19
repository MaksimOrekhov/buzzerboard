import fixture from '../../../../docs/fixtures/bbs.synthetic.json'
import { describe, expect, it, vi } from 'vitest'
import type {
  Game,
  NbaGameDate,
  SeasonEndYear,
  TeamSeasonProfile,
  UtcTimestamp,
} from '@/entities/nba/model'
import { NBA_TEAMS } from '@/entities/nba/teamCatalog'
import { normalizeBbsGames } from '@/server/nba/adapters/bbs'
import { normalizeBbsStandings } from '@/server/nba/adapters/bbsTeams'
import type {
  NbaCacheRecord,
  NbaRepository,
  WorkerEnvironment,
  CreditUsage,
  ProviderCooldown,
  ScheduledBbsProgress,
} from '@/server/nba/runtime/types'
import {
  gameDetailsCacheKey,
  gamesCacheKey,
  standingsCacheKey,
  teamDirectoryCacheKey,
  teamSeasonCacheKey,
} from '@/server/nba/runtime/cacheKeys'
import { refreshBbsGames, runScheduledBbsRefresh } from '@/server/nba/runtime/bbsRefresh'
import { createNbaWorker } from '@/server/worker'
import { refreshNbaResource } from './refresh'

const now = Date.parse('2026-11-17T16:00:00.000Z')
const date = '2026-11-15' as NbaGameDate
const environment: WorkerEnvironment = {
  BBS_API_KEY: 'fixture-only-key',
  BBS_REFRESH_ENABLED: 'true',
  BBS_REQUEST_INTERVAL_MS: '0',
  NBA_GAMES_PROVIDER_ORDER: 'bbs',
  NBA_STANDINGS_PROVIDER_ORDER: 'dunkapi',
  DUNKAPI_REFRESH_ENABLED: 'false',
}

class MemoryRepository implements NbaRepository {
  cache = new Map<string, NbaCacheRecord>()
  slots = new Map<string, number>()
  locks = new Map<string, { token: string; expiresAt: number }>()
  providerCooldowns = new Map<string, ProviderCooldown>()
  providerRemaining = new Map<string, { remaining: number; resetAt: number }>()
  bbsRequests: number[] = []
  cleanupCalls = 0
  scheduledBbsProgress: ScheduledBbsProgress | null = null
  async getScheduledBbsProgress() {
    return this.scheduledBbsProgress
  }
  async putScheduledBbsProgress(progress: ScheduledBbsProgress | null) {
    this.scheduledBbsProgress = progress
  }
  async putScheduledBbsProgressIfLockOwned(
    progress: ScheduledBbsProgress,
    lockKey: string,
    token: string,
    now: number,
  ) {
    const lock = this.locks.get(lockKey)
    if (!lock || lock.token !== token || lock.expiresAt <= now) return false
    this.scheduledBbsProgress = progress
    return true
  }
  async getCache(key: string) {
    return this.cache.get(key) ?? null
  }
  async getCaches(keys: readonly string[]) {
    return keys.map((key) => this.cache.get(key) ?? null)
  }
  async putCache(record: NbaCacheRecord) {
    this.cache.set(record.cacheKey, record)
  }
  async deleteCache(key: string) {
    this.cache.delete(key)
  }
  async tryAcquireLock(key: string, token: string, now: number, expiresAt: number) {
    const current = this.locks.get(key)
    if (current && current.expiresAt > now) return false
    this.locks.set(key, { token, expiresAt })
    return true
  }
  async renewLock(key: string, token: string, now: number, expiresAt: number) {
    const current = this.locks.get(key)
    if (!current || current.token !== token || current.expiresAt <= now) return false
    this.locks.set(key, { token, expiresAt })
    return true
  }
  async putCacheIfLockOwned(record: NbaCacheRecord, key: string, token: string, now: number) {
    const current = this.locks.get(key)
    if (!current || current.token !== token || current.expiresAt <= now) return false
    this.cache.set(record.cacheKey, record)
    return true
  }
  async releaseLock(key: string, token: string) {
    if (this.locks.get(key)?.token === token) this.locks.delete(key)
  }
  async getCreditUsage(): Promise<CreditUsage | null> {
    return null
  }
  async reserveCredits(): Promise<CreditUsage | null> {
    return null
  }
  async reserveBoxScoreCredits(): Promise<CreditUsage | null> {
    return null
  }
  async consumeRateSlot(key: string, current: number, windowMs: number, limit: number) {
    const slot = `${key}:${Math.floor(current / windowMs)}`
    const count = this.slots.get(slot) ?? 0
    if (count >= limit) return false
    this.slots.set(slot, count + 1)
    return true
  }
  async reserveBbsRequest(now: number, dailyLimit: number, minuteLimit: number) {
    const dayStart = Math.floor(now / 86_400_000) * 86_400_000
    const daySlot = `bbs:utc-day:${new Date(dayStart).toISOString().slice(0, 10)}`
    const dayCount = this.slots.get(daySlot) ?? 0
    if (dayCount >= dailyLimit)
      return {
        allowed: false,
        retryAt: dayStart + 86_400_000,
        errorCode: 'quota_exceeded' as const,
      }
    const minuteRequests = this.bbsRequests.filter((requestAt) => requestAt > now - 60_000)
    if (minuteRequests.length >= minuteLimit)
      return {
        allowed: false,
        retryAt: minuteRequests[0]! + 60_000,
        errorCode: 'rate_limited' as const,
      }
    this.slots.set(daySlot, dayCount + 1)
    this.bbsRequests.push(now)
    return { allowed: true, retryAt: null, errorCode: null }
  }
  async getProviderCooldown(provider: string) {
    return this.providerCooldowns.get(provider) ?? null
  }
  async setProviderCooldown(provider: string, cooldown: ProviderCooldown) {
    const existing = this.providerCooldowns.get(provider)
    this.providerCooldowns.set(
      provider,
      existing && existing.retryAt > cooldown.retryAt ? existing : cooldown,
    )
  }
  async clearProviderCooldown(provider: string, now: number) {
    const existing = this.providerCooldowns.get(provider)
    if (existing && existing.retryAt <= now) this.providerCooldowns.delete(provider)
  }
  async reserveProviderBudget(provider: string, now: number, headroom: number) {
    const state = this.providerRemaining.get(provider)
    if (state && state.resetAt > now) {
      if (state.remaining <= headroom)
        return { allowed: false, retryAt: state.resetAt, errorCode: 'rate_limited' as const }
      state.remaining -= 1
    }
    return { allowed: true, retryAt: null, errorCode: null }
  }
  async recordProviderRemaining(provider: string, remaining: number, resetAt: number) {
    const existing = this.providerRemaining.get(provider)
    this.providerRemaining.set(provider, {
      remaining:
        existing?.resetAt === resetAt ? Math.min(existing.remaining, remaining) : remaining,
      resetAt,
    })
  }
  async cleanupExpired() {
    this.cleanupCalls += 1
  }
}

function fakeBbsFetch(options: { status?: number; total?: number } = {}) {
  const paths: string[] = []
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    paths.push(url.pathname + url.search)
    if (options.status)
      return new Response('{}', { status: options.status, headers: { 'retry-after': '120' } })
    if (url.pathname === '/v1/matches') {
      const payload = structuredClone(fixture)
      if (options.total !== undefined) payload.pagination.total = options.total
      return new Response(JSON.stringify(payload), { status: 200 })
    }
    if (url.pathname === '/v1/nba/games/90000001') {
      return new Response(
        JSON.stringify({
          data: {
            id: 90000001,
            game_date: '2026-11-15',
            home: { team_id: '1610612738', pts: 112, fgm: 41, fga: 88 },
            away: { team_id: '1610612752', pts: 108, fgm: 40, fga: 90 },
          },
        }),
        { status: 200 },
      )
    }
    if (url.pathname.endsWith('/availability')) {
      return new Response(
        JSON.stringify({
          data: {
            id: Number(url.pathname.split('/').at(-2)),
            home: [{ player_id: 'bos-player-1', played: true }],
            away: [{ player_id: 'nyk-player-1', played: true }],
          },
        }),
        { status: 200 },
      )
    }
    if (url.pathname.endsWith('/box')) {
      return new Response(
        JSON.stringify({
          data: {
            id: 'synthetic-final-match-uuid',
            home: [{ player_id: 'bos-player-1', player_name: 'Synthetic Home Player', pts: 112 }],
            away: [{ player_id: 'nyk-player-1', player_name: 'Synthetic Away Player', pts: 108 }],
          },
        }),
        { status: 200 },
      )
    }
    return new Response('{}', { status: 404 })
  })
  return { fetcher: fetcher as typeof fetch, paths }
}

function busyDayFixture() {
  const archiveTeamIds: Record<string, string> = {
    ATL: '1610612737',
    BOS: '1610612738',
    BKN: '1610612751',
    CHA: '1610612766',
    CHI: '1610612741',
    CLE: '1610612739',
    DAL: '1610612742',
    DEN: '1610612743',
    DET: '1610612765',
    GSW: '1610612744',
    HOU: '1610612745',
    IND: '1610612754',
    LAC: '1610612746',
    LAL: '1610612747',
    MEM: '1610612763',
    MIA: '1610612748',
    MIL: '1610612749',
    MIN: '1610612750',
    NOP: '1610612740',
    NYK: '1610612752',
    OKC: '1610612760',
    ORL: '1610612753',
    PHI: '1610612755',
    PHX: '1610612756',
    POR: '1610612757',
    SAC: '1610612758',
    SAS: '1610612759',
    TOR: '1610612761',
    UTA: '1610612762',
    WAS: '1610612764',
  }
  const teamCodes = [
    'ATL',
    'BKN',
    'BOS',
    'CHA',
    'CHI',
    'CLE',
    'DAL',
    'DEN',
    'DET',
    'GSW',
    'HOU',
    'IND',
    'LAC',
    'LAL',
    'MEM',
    'MIA',
    'MIL',
    'MIN',
    'NOP',
    'NYK',
    'OKC',
    'ORL',
    'PHI',
    'PHX',
    'POR',
    'SAC',
    'SAS',
    'TOR',
    'UTA',
    'WAS',
  ]
  const matches = Array.from({ length: 15 }, (_, index) => {
    const source = structuredClone(fixture.data[0]!) as unknown as {
      id: string
      archive_game_id: number
      home: Record<string, unknown>
      away: Record<string, unknown>
      [key: string]: unknown
    }
    source.id = `synthetic-busy-game-${index + 1}`
    source.archive_game_id = 91000000 + index
    source.home = {
      ...source.home,
      team_id: `bbs-${teamCodes[index * 2]!.toLowerCase()}`,
      archive_team_id: archiveTeamIds[teamCodes[index * 2]!]!,
      abbreviation: teamCodes[index * 2]!,
    }
    source.away = {
      ...source.away,
      team_id: `bbs-${teamCodes[index * 2 + 1]!.toLowerCase()}`,
      archive_team_id: archiveTeamIds[teamCodes[index * 2 + 1]!]!,
      abbreviation: teamCodes[index * 2 + 1]!,
    }
    return source
  })
  return { data: matches, pagination: { total: matches.length, limit: 100, offset: 0 } }
}

function busyDayFetch(options: { teamStatus?: number; boxStatusForFirst?: number } = {}) {
  const paths: string[] = []
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    paths.push(url.pathname)
    if (url.pathname === '/v1/matches') {
      return new Response(JSON.stringify(busyDayFixture()), { status: 200 })
    }
    if (url.pathname.startsWith('/v1/nba/games/') && !url.pathname.endsWith('/box')) {
      const gameIndex = Number(url.pathname.split('/').at(-1)) - 91000000
      const match = busyDayFixture().data[gameIndex]!
      if (gameIndex === 0 && options.teamStatus)
        return new Response('{}', { status: options.teamStatus })
      if (url.pathname.endsWith('/availability')) {
        return new Response(
          JSON.stringify({
            data: {
              id: Number(url.pathname.split('/').at(-2)),
              home: [
                {
                  player_id: `home-${Number(url.pathname.split('/').at(-2)) - 91000000}`,
                  played: true,
                },
              ],
              away: [
                {
                  player_id: `away-${Number(url.pathname.split('/').at(-2)) - 91000000}`,
                  played: true,
                },
              ],
            },
          }),
          { status: 200 },
        )
      }
      return new Response(
        JSON.stringify({
          data: {
            id: Number(url.pathname.split('/').at(-1)),
            home: {
              team_id: match.home.archive_team_id,
              pts: 112,
            },
            away: {
              team_id: match.away.archive_team_id,
              pts: 108,
            },
          },
        }),
        { status: 200 },
      )
    }
    const uuid = url.pathname.split('/').at(-2)!
    const index = Number(uuid.split('-').at(-1)) - 1
    if (index === 0 && options.boxStatusForFirst)
      return new Response('{}', { status: options.boxStatusForFirst })
    return new Response(
      JSON.stringify({
        data: {
          id: uuid,
          home: [{ player_id: `home-${index}`, player_name: 'Synthetic Home Player', pts: 112 }],
          away: [{ player_id: `away-${index}`, player_name: 'Synthetic Away Player', pts: 108 }],
        },
      }),
      { status: 200 },
    )
  })
  return { fetcher: fetcher as typeof fetch, paths }
}

describe('BBS cached refresh flow', () => {
  it('leaves scheduled provider refresh off when production flags are disabled', async () => {
    const repository = new MemoryRepository()
    const fetcher = vi.fn<typeof fetch>()
    const worker = createNbaWorker({ repository, fetcher, now: () => now })
    await worker.scheduled(
      { scheduledTime: now, cron: '*/10 * * * *' } as Parameters<typeof worker.scheduled>[0],
      { ...environment, BBS_REFRESH_ENABLED: 'false', DUNKAPI_REFRESH_ENABLED: 'false' },
      { waitUntil: vi.fn() } as never,
    )
    expect(repository.cleanupCalls).toBe(1)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('loads a complete date and its final box score once, then serves public GETs from D1 only', async () => {
    const repository = new MemoryRepository()
    const { fetcher, paths } = fakeBbsFetch()
    const result = await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      fetcher,
      now,
    )
    expect(result.state).toBe('refreshed')
    expect(paths).toHaveLength(3)
    expect(paths.map((path) => new URL(`https://bbs.test${path}`).pathname)).toEqual([
      '/v1/matches',
      '/v1/nba/games/90000001',
      '/v1/nba/games/synthetic-final-match-uuid/box',
    ])
    const games = repository.cache.get(gamesCacheKey('bbs', date))
    expect(games?.capability).toBe('games')
    if (games?.capability !== 'games') throw new Error('Expected a BBS game snapshot')
    expect(games.providerReferences?.[games.data[0]!.id]).toBe('90000001')
    expect(games.providerReferences?.[`${games.data[0]!.id}:team:home`]).toBe('1610612738')
    expect(games.providerReferences?.[`${games.data[0]!.id}:team:away`]).toBe('1610612752')
    expect(repository.cache.get(gameDetailsCacheKey('bbs', games.data[0]!.id))?.capability).toBe(
      'boxScore',
    )

    const noNetwork = vi.fn<typeof fetch>(() =>
      Promise.reject(new Error('Unexpected upstream request')),
    )
    const worker = createNbaWorker({ repository, fetcher: noNetwork, now: () => now })
    const response = await worker.fetch(
      new Request(`https://app.test/api/games?date=${date}`),
      environment,
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { id: string }[] }
    expect(body.data).toHaveLength(2)
    const details = await worker.fetch(
      new Request(
        `https://app.test/api/games/${encodeURIComponent(body.data[0]!.id)}?date=${date}`,
      ),
      environment,
    )
    expect(details.status).toBe(200)
    const detailsBody = (await details.json()) as {
      boxScoreAvailability: string
      data: { boxScore: { players: { didNotPlay: boolean | null }[] } | null }
    }
    expect(detailsBody.boxScoreAvailability).toBe('available')
    expect(detailsBody.data.boxScore?.players.every((player) => player.didNotPlay === null)).toBe(
      true,
    )
    expect(noNetwork).not.toHaveBeenCalled()
  })

  it('rejects incomplete pagination and does not overwrite a complete cached day', async () => {
    const repository = new MemoryRepository()
    const initial = fakeBbsFetch()
    await refreshBbsGames({ type: 'games', date }, environment, repository, initial.fetcher, now)
    const previous = repository.cache.get(gamesCacheKey('bbs', date))
    if (!previous || previous.capability !== 'games')
      throw new Error('Expected initial fixture snapshot')
    const stale = { ...previous, expiresAt: now - 1 }
    await repository.putCache(stale)
    const incomplete = fakeBbsFetch({ total: 99 })
    const result = await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      incomplete.fetcher,
      now,
    )
    expect(result.state).toBe('deferred')
    expect(repository.cache.get(gamesCacheKey('bbs', date))?.fetchedAt).toBe(previous.fetchedAt)
    expect(incomplete.paths).toHaveLength(1)
  })

  it('keeps manual date refresh bounded to the games list instead of fanning out boxes', async () => {
    const repository = new MemoryRepository()
    const initial = fakeBbsFetch()
    await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      initial.fetcher,
      now,
      false,
    )
    const manual = fakeBbsFetch()
    const result = await refreshNbaResource(
      { type: 'games', date },
      environment,
      repository,
      manual.fetcher,
      now,
    )
    expect(result.state).toBe('up_to_date')
    expect(manual.paths).toHaveLength(0)
  })

  it('stops after a provider 429 without retrying or spending more requests', async () => {
    const repository = new MemoryRepository()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const { fetcher, paths } = fakeBbsFetch({ status: 429 })
    const result = await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      fetcher,
      now,
    )
    expect(result.error?.code).toBe('rate_limited')
    expect(result.retryAfter).toBe(new Date(now + 120_000).toISOString())
    expect(paths).toHaveLength(1)
    vi.restoreAllMocks()
  })

  it('reserves every BBS request against its own daily cap before sending it', async () => {
    const repository = new MemoryRepository()
    const { fetcher, paths } = fakeBbsFetch()
    const result = await refreshBbsGames(
      { type: 'games', date },
      { ...environment, BBS_DAILY_REQUEST_LIMIT: '2' },
      repository,
      fetcher,
      now,
    )
    expect(result.state).toBe('deferred')
    expect(paths).toHaveLength(2)
    expect(
      [...repository.slots.entries()]
        .filter(([key]) => key.includes('bbs:utc-day:'))
        .map(([, count]) => count),
    ).toEqual([2])
    expect(
      [...repository.slots.entries()]
        .filter(([key]) => key.includes('bbs:upstream-minute'))
        .map(([, count]) => count),
    ).toEqual([])
    expect(repository.bbsRequests).toHaveLength(2)
  })

  it('ingests all 15 synthetic final games and full boxes without exceeding a 10/minute bucket', async () => {
    const repository = new MemoryRepository()
    let simulatedNow = now
    vi.spyOn(Date, 'now').mockImplementation(() => simulatedNow)
    const { fetcher, paths } = busyDayFetch()
    const originalFetcher = fetcher
    const pacedFetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetcher(input, init)
      simulatedNow += 7_000
      return response
    }) as typeof fetch
    try {
      const result = await refreshBbsGames(
        { type: 'games', date },
        environment,
        repository,
        pacedFetcher,
        now,
      )
      expect(result.state).toBe('refreshed')
      expect(paths).toHaveLength(31)
      const games = repository.cache.get(gamesCacheKey('bbs', date))
      if (games?.capability !== 'games') throw new Error('Expected all BBS games to be cached')
      expect(games.data).toHaveLength(15)
      expect(games.data.every((game) => game.status === 'final')).toBe(true)
      expect(
        games.data.every(
          (game) =>
            repository.cache.get(gameDetailsCacheKey('bbs', game.id))?.capability === 'boxScore',
        ),
      ).toBe(true)
      const minuteBuckets = [...repository.slots.entries()].filter(([key]) =>
        key.includes('bbs:upstream-minute'),
      )
      expect(minuteBuckets.every(([, count]) => count <= 10)).toBe(true)
      expect(
        [...repository.slots.entries()]
          .filter(([key]) => key.includes('bbs:utc-day:'))
          .map(([, count]) => count),
      ).toEqual([31])
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('keeps a bad game isolated and continues caching the other games', async () => {
    const repository = new MemoryRepository()
    let simulatedNow = now
    vi.spyOn(Date, 'now').mockImplementation(() => simulatedNow)
    const { fetcher: unpaced, paths } = busyDayFetch({ boxStatusForFirst: 404 })
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await unpaced(input, init)
      simulatedNow += 7_000
      return response
    }) as typeof fetch
    const result = await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      fetcher,
      now,
    )
    const list = repository.cache.get(gamesCacheKey('bbs', date))
    if (list?.capability !== 'games') throw new Error('Expected fresh game list')
    const first = repository.cache.get(gameDetailsCacheKey('bbs', list.data[0]!.id))
    const rest = list.data
      .slice(1)
      .map((game) => repository.cache.get(gameDetailsCacheKey('bbs', game.id)))
    expect(result.error?.code).toBe('not_found')
    expect(paths).toHaveLength(31)
    expect(first).toMatchObject({
      capability: 'boxScore',
      data: null,
      refreshError: { code: 'not_found' },
    })
    expect(rest.every((box) => box?.capability === 'boxScore' && box.data !== null)).toBe(true)
    vi.restoreAllMocks()
  })

  it('retains a compatible stale box through a cached failure and recovers after its cooldown', async () => {
    const repository = new MemoryRepository()
    let simulatedNow = now
    vi.spyOn(Date, 'now').mockImplementation(() => simulatedNow)
    await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      fakeBbsFetch().fetcher,
      now,
    )
    const games = repository.cache.get(gamesCacheKey('bbs', date))
    if (games?.capability !== 'games') throw new Error('Expected game list')
    const game = games.data[0]!
    const key = gameDetailsCacheKey('bbs', game.id)
    const oldBox = repository.cache.get(key)
    if (oldBox?.capability !== 'boxScore' || !oldBox.data) throw new Error('Expected old box')
    await repository.putCache({ ...oldBox, expiresAt: now - 1, retryAt: null, refreshError: null })

    const bad = fakeBbsFetch({ status: 404 })
    const failed = await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      bad.fetcher,
      now,
    )
    const afterFailure = repository.cache.get(key)
    expect(failed.error?.code).toBe('not_found')
    expect(afterFailure).toMatchObject({
      capability: 'boxScore',
      data: oldBox.data,
      refreshError: { code: 'not_found' },
    })

    const duringCooldown = fakeBbsFetch()
    await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      duringCooldown.fetcher,
      now,
    )
    expect(duringCooldown.paths).toHaveLength(0)
    simulatedNow += 15 * 60_000 + 1
    const recovered = fakeBbsFetch()
    const recoveredResult = await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      recovered.fetcher,
      simulatedNow,
    )
    expect(recoveredResult.state).toBe('refreshed')
    expect(recovered.paths).toHaveLength(2)
    vi.restoreAllMocks()
  })

  it('stops a date on provider outage, preserves its list, and shares the cooldown with other targets', async () => {
    const repository = new MemoryRepository()
    const simulatedNow = now
    vi.spyOn(Date, 'now').mockImplementation(() => simulatedNow)
    const { fetcher, paths } = busyDayFetch({ teamStatus: 503 })
    const result = await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      fetcher,
      now,
    )
    const list = repository.cache.get(gamesCacheKey('bbs', date))
    expect(result.error?.code).toBe('upstream_unavailable')
    expect(paths).toHaveLength(2)
    expect(list?.capability).toBe('games')
    expect(repository.cache.size).toBe(16)
    const before = paths.length
    const anotherDate = await refreshBbsGames(
      { type: 'games', date: '2026-11-16' as NbaGameDate },
      environment,
      repository,
      fetcher,
      simulatedNow,
    )
    expect(anotherDate.error?.code).toBe('upstream_unavailable')
    expect(paths).toHaveLength(before)
    vi.restoreAllMocks()
  })

  it('recovers after a per-game lock expires without writing from the stale owner', async () => {
    const repository = new MemoryRepository()
    let simulatedNow = now
    vi.spyOn(Date, 'now').mockImplementation(() => simulatedNow)
    const initial = fakeBbsFetch()
    const delayed = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await initial.fetcher(input, init)
      if (new URL(String(input)).pathname === '/v1/nba/games/90000001') simulatedNow += 31_000
      return response
    }) as typeof fetch
    const interrupted = await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      delayed,
      simulatedNow,
    )
    const games = repository.cache.get(gamesCacheKey('bbs', date))
    if (games?.capability !== 'games') throw new Error('Expected persisted game list')
    expect(interrupted.error?.code).toBe('refresh_in_progress')
    expect(repository.cache.get(gameDetailsCacheKey('bbs', games.data[0]!.id))).toBeUndefined()

    simulatedNow += 31_000
    const recovery = await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      fakeBbsFetch().fetcher,
      simulatedNow,
    )
    expect(recovery.state).toBe('refreshed')
    expect(repository.cache.get(gameDetailsCacheKey('bbs', games.data[0]!.id))?.capability).toBe(
      'boxScore',
    )
    vi.restoreAllMocks()
  })

  it('serializes concurrent workers and refreshes the UTC daily counter at midnight', async () => {
    const repository = new MemoryRepository()
    const { fetcher, paths } = fakeBbsFetch()
    const concurrent = await Promise.all([
      refreshBbsGames({ type: 'games', date }, environment, repository, fetcher, now),
      refreshBbsGames({ type: 'games', date }, environment, repository, fetcher, now),
    ])
    expect(concurrent.map((result) => result.state).sort()).toEqual(['in_progress', 'refreshed'])
    expect(paths).toHaveLength(3)

    const midnightRepository = new MemoryRepository()
    const emptyFixture = { data: [], pagination: { total: 0, limit: 100, offset: 0 } }
    const midnightFetch = vi.fn(
      async () => new Response(JSON.stringify(emptyFixture), { status: 200 }),
    ) as typeof fetch
    const once = { ...environment, BBS_DAILY_REQUEST_LIMIT: '1' }
    const beforeMidnight = Date.parse('2026-11-17T23:59:59.000Z')
    const afterMidnight = Date.parse('2026-11-18T00:00:01.000Z')
    vi.spyOn(Date, 'now').mockReturnValue(beforeMidnight)
    try {
      await refreshBbsGames(
        { type: 'games', date: '2026-11-17' as NbaGameDate },
        once,
        midnightRepository,
        midnightFetch,
        beforeMidnight,
      )
      vi.spyOn(Date, 'now').mockReturnValue(afterMidnight)
      const nextDay = await refreshBbsGames(
        { type: 'games', date: '2026-11-18' as NbaGameDate },
        once,
        midnightRepository,
        midnightFetch,
        afterMidnight,
      )
      expect(nextDay.state).toBe('refreshed')
      expect(midnightFetch).toHaveBeenCalledTimes(2)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('atomically prevents concurrent dates from exceeding one daily request', async () => {
    const repository = new MemoryRepository()
    const emptyFixture = { data: [], pagination: { total: 0, limit: 100, offset: 0 } }
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify(emptyFixture), { status: 200 }),
    ) as typeof fetch
    const capped = { ...environment, BBS_DAILY_REQUEST_LIMIT: '1' }
    const results = await Promise.all([
      refreshBbsGames(
        { type: 'games', date: '2026-11-17' as NbaGameDate },
        capped,
        repository,
        fetcher,
        now,
      ),
      refreshBbsGames(
        { type: 'games', date: '2026-11-18' as NbaGameDate },
        capped,
        repository,
        fetcher,
        now,
      ),
    ])
    expect(results.filter((result) => result.state === 'refreshed')).toHaveLength(1)
    expect(results.filter((result) => result.error?.code === 'quota_exceeded')).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('stops after a provider 403 without retrying', async () => {
    const repository = new MemoryRepository()
    const { fetcher, paths } = fakeBbsFetch({ status: 403 })
    const result = await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      fetcher,
      now,
    )
    expect(result.error?.code).toBe('forbidden')
    expect(paths).toHaveLength(1)
  })

  it('honors an HTTP-date Retry-After and stops scheduled targets on provider auth failure', async () => {
    const repository = new MemoryRepository()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const retryAt = new Date(now + 90_000).toUTCString()
    const dateFetcher = vi.fn(
      async () => new Response('{}', { status: 429, headers: { 'retry-after': retryAt } }),
    ) as typeof fetch
    const limited = await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      dateFetcher,
      now,
    )
    expect(limited.retryAfter).toBe(new Date(retryAt).toISOString())

    const authRepository = new MemoryRepository()
    const { fetcher, paths } = fakeBbsFetch({ status: 403 })
    const scheduled = await runScheduledBbsRefresh(environment, authRepository, fetcher, now)
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0]?.error?.code).toBe('cache_miss')
    expect(paths).toHaveLength(0)
    const directory = await runScheduledBbsRefresh(environment, authRepository, fetcher, now)
    expect(directory[0]?.error?.code).toBe('forbidden')
    expect(paths).toHaveLength(1)
    vi.restoreAllMocks()
  })

  it('persists one refresh task at a time and resumes the same task after a provider failure', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const repository = new MemoryRepository()
    const standingsKey = standingsCacheKey('bbs', 2027 as SeasonEndYear)
    repository.cache.set(standingsKey, {
      cacheKey: standingsKey,
      capability: 'standings',
      provider: 'bbs',
      data: [],
      fetchedAt: new Date(now - 1_000).toISOString() as UtcTimestamp,
      providerUpdatedAt: null,
      rejectedRecords: 0,
      expiresAt: now + 60_000,
      staleUntil: now + 7 * 24 * 60 * 60_000,
      retryAt: null,
      refreshError: null,
    })
    const first = fakeBbsFetch()
    const completed = await runScheduledBbsRefresh(environment, repository, first.fetcher, now)
    expect(completed[0]?.state).toBe('up_to_date')
    expect(first.paths).toHaveLength(0)
    expect(repository.scheduledBbsProgress?.cursor).toBe(0)
    expect(repository.scheduledBbsProgress?.tasks[0]?.task.type).toBe('teamDirectory')

    const failed = fakeBbsFetch({ status: 403 })
    const deferred = await runScheduledBbsRefresh(environment, repository, failed.fetcher, now)
    expect(deferred[0]?.error?.code).toBe('forbidden')
    expect(failed.paths).toHaveLength(1)
    expect(repository.scheduledBbsProgress?.cursor).toBe(0)
    vi.restoreAllMocks()
  })

  it('starts at 10:00 New York time across daylight-saving changes', async () => {
    const repository = new MemoryRepository()
    let simulatedNow = Date.parse('2026-11-17T14:59:00.000Z')
    vi.spyOn(Date, 'now').mockImplementation(() => simulatedNow)
    const fetcher = vi.fn(async () => new Response('{}', { status: 500 })) as typeof fetch
    const beforeWinterWindow = Date.parse('2026-11-17T14:59:00.000Z')
    expect(
      await runScheduledBbsRefresh(environment, repository, fetcher, beforeWinterWindow),
    ).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
    const afterWinterWindow = Date.parse('2026-11-17T15:00:00.000Z')
    simulatedNow = afterWinterWindow
    expect(
      await runScheduledBbsRefresh(environment, repository, fetcher, afterWinterWindow),
    ).toHaveLength(1)

    const dstRepository = new MemoryRepository()
    const beforeDstWindow = Date.parse('2026-03-08T13:59:00.000Z')
    simulatedNow = beforeDstWindow
    expect(
      await runScheduledBbsRefresh(environment, dstRepository, fetcher, beforeDstWindow),
    ).toEqual([])
    simulatedNow = Date.parse('2026-03-08T14:00:00.000Z')
    expect(
      await runScheduledBbsRefresh(environment, dstRepository, fetcher, simulatedNow),
    ).toHaveLength(1)
    vi.restoreAllMocks()
  })

  it('does not spend player quota before the new core queue is scheduled', async () => {
    const beforeWindow = Date.parse('2026-11-18T14:59:00.000Z')
    vi.spyOn(Date, 'now').mockReturnValue(beforeWindow)
    const repository = new MemoryRepository()
    repository.scheduledBbsProgress = {
      cycleDate: '2026-11-17' as NbaGameDate,
      cursor: 0,
      pauseUntil: null,
      tasks: [],
    }
    const prepare = vi.fn()
    const fetcher = vi.fn(async () => new Response('{}')) as typeof fetch

    await runScheduledBbsRefresh(
      {
        ...environment,
        BBS_PLAYER_REFRESH_ENABLED: 'true',
        NBA_DB: { prepare } as never,
      },
      repository,
      fetcher,
      beforeWindow,
    )

    expect(prepare).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('defers one local item while advancing independent queued work and preserves de-duplicated retry state on rollover', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const repository = new MemoryRepository()
    const standingsKey = standingsCacheKey('bbs', 2027 as SeasonEndYear)
    repository.cache.set(standingsKey, {
      cacheKey: standingsKey,
      capability: 'standings',
      provider: 'bbs',
      data: [],
      fetchedAt: new Date(now - 1_000).toISOString() as UtcTimestamp,
      providerUpdatedAt: null,
      rejectedRecords: 0,
      expiresAt: now + 60_000,
      staleUntil: now + 7 * 24 * 60 * 60_000,
      retryAt: null,
      refreshError: null,
    })
    repository.scheduledBbsProgress = {
      cycleDate: '2026-11-17' as NbaGameDate,
      cursor: 0,
      pauseUntil: null,
      tasks: [
        {
          task: { type: 'teamSeason', teamCode: 'BOS', seasonEndYear: 2027 as SeasonEndYear },
          attempts: 0,
          retryAt: null,
        },
        {
          task: { type: 'standings', seasonEndYear: 2027 as SeasonEndYear },
          attempts: 0,
          retryAt: null,
        },
      ],
    }
    const fetcher = fakeBbsFetch().fetcher
    const localFailure = await runScheduledBbsRefresh(environment, repository, fetcher, now)
    expect(localFailure[0]?.error?.code).toBe('cache_miss')
    expect(repository.scheduledBbsProgress?.tasks[0]?.task.type).toBe('standings')
    expect(repository.scheduledBbsProgress?.tasks.at(-1)?.attempts).toBe(1)
    const independent = await runScheduledBbsRefresh(environment, repository, fetcher, now)
    expect(independent[0]?.state).toBe('up_to_date')

    const rollover = Date.parse('2026-11-18T16:00:00.000Z')
    await runScheduledBbsRefresh(environment, repository, fetcher, rollover)
    const items = repository.scheduledBbsProgress?.tasks ?? []
    const keys = items.map((item) => JSON.stringify(item.task))
    expect(new Set(keys).size).toBe(keys.length)
    expect(
      items.find((item) => item.task.type === 'teamSeason' && item.task.teamCode === 'BOS')
        ?.attempts,
    ).toBe(1)
    vi.restoreAllMocks()
  })

  it('finishes seven-day catch-up and three realistic 15-game days without refetching unchanged box scores', async () => {
    let tick = Date.parse('2026-11-17T15:00:00.000Z')
    vi.spyOn(Date, 'now').mockImplementation(() => tick)
    const repository = new MemoryRepository()
    const start = tick
    const expiresAt = start + 7 * 24 * 60 * 60_000
    const base = {
      provider: 'bbs' as const,
      fetchedAt: new Date(start - 60_000).toISOString() as UtcTimestamp,
      providerUpdatedAt: null,
      rejectedRecords: 0,
      expiresAt,
      staleUntil: expiresAt,
      retryAt: null,
      refreshError: null,
    }
    repository.cache.set(standingsCacheKey('bbs', 2027 as SeasonEndYear), {
      ...base,
      cacheKey: standingsCacheKey('bbs', 2027 as SeasonEndYear),
      capability: 'standings',
      data: [],
    })
    repository.cache.set(teamDirectoryCacheKey('bbs', 2027 as SeasonEndYear), {
      ...base,
      cacheKey: teamDirectoryCacheKey('bbs', 2027 as SeasonEndYear),
      capability: 'teamDirectory',
      seasonEndYear: 2027 as SeasonEndYear,
      data: NBA_TEAMS.map((team) => ({
        teamId: team.team.id,
        providerTeamId: `synthetic-${team.code}` as never,
      })),
    })
    const profile = { seasonEndYear: 2027 } as unknown as TeamSeasonProfile
    for (const team of NBA_TEAMS) {
      const key = teamSeasonCacheKey('bbs', team.team.id, 2027 as SeasonEndYear)
      repository.cache.set(key, {
        ...base,
        cacheKey: key,
        capability: 'teamSeason',
        teamId: team.team.id,
        seasonEndYear: 2027 as SeasonEndYear,
        providerTeamId: `synthetic-${team.code}`,
        data: profile,
      })
    }

    const archives = new Map<number, { home: string; away: string; uuid: string }>()
    const gamesByUuid = new Map<string, Game>()
    const matchesByDay = new Map<string, readonly Record<string, unknown>[]>()
    const sourceMatches = busyDayFixture().data
    for (let dayOffset = -7; dayOffset <= 9; dayOffset += 1) {
      const day = new Date(Date.UTC(2026, 10, 17 + dayOffset))
        .toISOString()
        .slice(0, 10) as NbaGameDate
      const dateNumber = Number(day.replaceAll('-', ''))
      const matches = sourceMatches.map((fixtureMatch, index) => {
        const match = structuredClone(fixtureMatch) as unknown as {
          [key: string]: unknown
          home: Record<string, unknown>
          away: Record<string, unknown>
        }
        const uuid = `synthetic-${day}-${index + 1}`
        const archiveId = dateNumber * 100 + index
        match.id = uuid
        match.archive_game_id = archiveId
        match.game_date = day
        match.kickoff_utc = `${day}T23:00:00.000Z`
        match.status = 'finished'
        archives.set(archiveId, {
          home: String(match.home.archive_team_id),
          away: String(match.away.archive_team_id),
          uuid,
        })
        return match
      })
      matchesByDay.set(day, matches)
      const normalized = normalizeBbsGames(
        { data: { matches } },
        { fetchedAt: base.fetchedAt, stale: false },
      )
      const providerReferences: Record<string, string> = {}
      for (const match of matches) {
        const id = `bbs:game:${match.id}`
        providerReferences[id] = String(match.archive_game_id)
        providerReferences[`${id}:team:home`] = String(match.home.archive_team_id)
        providerReferences[`${id}:team:away`] = String(match.away.archive_team_id)
      }
      for (const game of normalized.data) gamesByUuid.set(String(game.providerId), game)
      const key = gamesCacheKey('bbs', day)
      repository.cache.set(key, {
        ...base,
        cacheKey: key,
        capability: 'games',
        data: normalized.data,
        providerReferences,
      })
      for (const game of normalized.data.slice(0, 8)) {
        const boxKey = gameDetailsCacheKey('bbs', game.id)
        repository.cache.set(boxKey, {
          ...base,
          cacheKey: boxKey,
          capability: 'boxScore',
          gameId: game.id,
          data: { game, teams: [], players: [] } as never,
        })
      }
    }

    const fetchedBoxUuids: string[] = []
    let matchRecheckCount = 0
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/v1/matches') {
        matchRecheckCount += 1
        const matches = matchesByDay.get(url.searchParams.get('date') ?? '') ?? []
        return new Response(
          JSON.stringify({ data: { matches, pagination: { total: matches.length } } }),
          { status: 200 },
        )
      }
      const archiveId = Number(url.pathname.split('/').at(-1))
      const archive = archives.get(archiveId)
      if (archive && !url.pathname.endsWith('/box'))
        return new Response(
          JSON.stringify({
            data: {
              id: archiveId,
              home: { team_id: archive.home, pts: 112 },
              away: { team_id: archive.away, pts: 108 },
            },
          }),
          { status: 200 },
        )
      if (url.pathname.endsWith('/box')) {
        const uuid = url.pathname.split('/').at(-2)!
        fetchedBoxUuids.push(uuid)
        return new Response(
          JSON.stringify({
            data: {
              id: uuid,
              home: [{ player_id: `${uuid}-home`, player_name: 'Synthetic Home', pts: 112 }],
              away: [{ player_id: `${uuid}-away`, player_name: 'Synthetic Away', pts: 108 }],
            },
          }),
          { status: 200 },
        )
      }
      throw new Error(`Unexpected synthetic provider URL: ${url.pathname}`)
    }) as typeof fetch

    const completedTargets = new Map<string, number>()
    const runTick = async () => {
      const outcomes = await runScheduledBbsRefresh(environment, repository, fetcher, tick)
      for (const result of outcomes)
        completedTargets.set(
          result.target.type,
          (completedTargets.get(result.target.type) ?? 0) + 1,
        )
    }
    const runUntil = async (cycleDate: NbaGameDate, deadline: number) => {
      while (tick < deadline) {
        tick += 10 * 60_000
        await runTick()
        if (
          repository.scheduledBbsProgress?.cycleDate === cycleDate &&
          repository.scheduledBbsProgress.tasks.length === 0
        )
          return
      }
      throw new Error(
        `Queue did not finish ${cycleDate} before ${new Date(deadline).toISOString()}: ${repository.scheduledBbsProgress?.cycleDate}/${repository.scheduledBbsProgress?.tasks.length} ${JSON.stringify(repository.scheduledBbsProgress?.tasks.slice(0, 3))}; failed boxes=${JSON.stringify(
          Array.from(repository.cache.values())
            .filter((row) => row.capability === 'boxScore' && row.refreshError)
            .slice(0, 3)
            .map((row) => row.refreshError?.code),
        )}`,
      )
    }
    const secondCycle = Date.parse('2026-11-18T15:00:00.000Z')
    await runUntil('2026-11-17' as NbaGameDate, secondCycle)
    tick = secondCycle
    await runTick()
    await runUntil('2026-11-18' as NbaGameDate, Date.parse('2026-11-19T15:00:00.000Z'))
    tick = Date.parse('2026-11-19T15:00:00.000Z')
    await runTick()
    await runUntil('2026-11-19' as NbaGameDate, Date.parse('2026-11-20T15:00:00.000Z'))

    expect(fetchedBoxUuids).toHaveLength(63)
    expect(new Set(fetchedBoxUuids).size).toBe(63)
    expect(matchRecheckCount).toBeGreaterThanOrEqual(3)
    expect(fetcher).toHaveBeenCalledTimes(126 + matchRecheckCount)
    expect(repository.scheduledBbsProgress?.tasks).toEqual([])
    expect(gamesByUuid.size).toBe(17 * 15)
    expect(completedTargets.get('teamSeason')).toBeGreaterThanOrEqual(90)
    expect(completedTargets.get('standings')).toBeGreaterThanOrEqual(6)
    vi.restoreAllMocks()
  })

  it('resumes saved work after midnight before opening the new daily plan', async () => {
    let tick = Date.parse('2026-11-18T05:00:00.000Z')
    vi.spyOn(Date, 'now').mockImplementation(() => tick)
    const repository = new MemoryRepository()
    const cacheKey = teamSeasonCacheKey('bbs', NBA_TEAMS[0]!.team.id, 2027 as SeasonEndYear)
    const expiresAt = tick + 24 * 60 * 60_000
    repository.cache.set(cacheKey, {
      cacheKey,
      capability: 'teamSeason',
      provider: 'bbs',
      teamId: NBA_TEAMS[0]!.team.id,
      seasonEndYear: 2027 as SeasonEndYear,
      providerTeamId: `synthetic-${NBA_TEAMS[0]!.code}`,
      data: { seasonEndYear: 2027 } as unknown as TeamSeasonProfile,
      fetchedAt: new Date(tick).toISOString() as UtcTimestamp,
      providerUpdatedAt: null,
      rejectedRecords: 0,
      expiresAt,
      staleUntil: expiresAt,
      retryAt: null,
      refreshError: null,
    })
    const task = {
      type: 'teamSeason' as const,
      teamCode: NBA_TEAMS[0]!.code,
      seasonEndYear: 2027 as SeasonEndYear,
    }
    repository.scheduledBbsProgress = {
      cycleDate: '2026-11-17' as NbaGameDate,
      tasks: [{ task, attempts: 1, retryAt: tick + 10 * 60_000 }],
      cursor: 0,
      pauseUntil: null,
    }
    const fetcher = vi.fn<typeof fetch>()

    await runScheduledBbsRefresh(environment, repository, fetcher, tick)
    expect(repository.scheduledBbsProgress?.tasks).toHaveLength(1)
    tick += 10 * 60_000
    await runScheduledBbsRefresh(environment, repository, fetcher, tick)

    expect(repository.scheduledBbsProgress?.cycleDate).toBe('2026-11-17')
    expect(repository.scheduledBbsProgress?.tasks).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('fills standings splits only from a matching, season-compatible team-season snapshot', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const repository = new MemoryRepository()
    const timestamp = new Date(now - 1_000).toISOString() as UtcTimestamp
    const seasonEndYear = 2027 as SeasonEndYear
    const providerId = (code: string) => `synthetic-${code}` as never
    const standingsPayload = {
      data: {
        season: '2026',
        standings: [
          {
            conference: 'East',
            rows: NBA_TEAMS.filter((team) => team.conference === 'east').map((team, index) => ({
              team_id: providerId(team.code),
              abbreviation: team.code,
              wins: team.code === 'BOS' ? 31 : team.code === 'NYK' ? 15 : 0,
              losses: team.code === 'BOS' ? 15 : team.code === 'NYK' ? 31 : 0,
              conference_rank: index + 1,
            })),
          },
          {
            conference: 'West',
            rows: NBA_TEAMS.filter((team) => team.conference === 'west').map((team, index) => ({
              team_id: providerId(team.code),
              abbreviation: team.code,
              wins: 0,
              losses: 0,
              conference_rank: index + 1,
            })),
          },
        ],
      },
    }
    const standingsKey = standingsCacheKey('bbs', seasonEndYear)
    const rows = normalizeBbsStandings(standingsPayload, seasonEndYear)
    const base = {
      provider: 'bbs' as const,
      fetchedAt: timestamp,
      providerUpdatedAt: null,
      rejectedRecords: 0,
      expiresAt: now + 60_000,
      staleUntil: now + 7 * 24 * 60 * 60_000,
      retryAt: null,
      refreshError: null,
    }
    repository.cache.set(standingsKey, {
      ...base,
      cacheKey: standingsKey,
      capability: 'standings',
      data: rows,
    })
    repository.cache.set(teamDirectoryCacheKey('bbs', seasonEndYear), {
      ...base,
      cacheKey: teamDirectoryCacheKey('bbs', seasonEndYear),
      capability: 'teamDirectory',
      seasonEndYear,
      data: NBA_TEAMS.map((team) => ({
        teamId: team.team.id,
        providerTeamId: providerId(team.code),
      })),
    })
    for (const team of NBA_TEAMS) {
      const wins = team.code === 'BOS' ? 31 : team.code === 'NYK' ? 15 : 0
      const losses = team.code === 'BOS' ? 15 : team.code === 'NYK' ? 31 : 0
      const profile: TeamSeasonProfile = {
        team: { ...team.team, providerId: providerId(team.code) },
        seasonEndYear,
        wins,
        losses,
        winPercentage: wins + losses ? wins / (wins + losses) : null,
        overallRank: null,
        conferenceRank: null,
        gamesBack: null,
        streak: null,
        home:
          team.code === 'BOS' ? { wins: 18, losses: 5, ties: null } : { wins, losses, ties: null },
        away:
          team.code === 'BOS'
            ? { wins: 13, losses: 10, ties: null }
            : { wins: 0, losses: 0, ties: null },
        stats: {
          gamesPlayed: null,
          pointsPerGame: null,
          fieldGoalPercentage: null,
          threePointPercentage: null,
          reboundsPerGame: null,
          assistsPerGame: null,
          turnoversPerGame: null,
        },
        lastTen:
          team.code === 'BOS'
            ? Array.from({ length: 10 }, (_, index) => ({
                gameId: null,
                nbaGameDate: date,
                opponentCode: 'NYK',
                result: index < 7 ? ('W' as const) : ('L' as const),
                pointsFor: 110,
                pointsAgainst: 100,
                venue: null,
              }))
            : null,
        leaders: [],
        nextGame: null,
      }
      const key = teamSeasonCacheKey('bbs', team.team.id, seasonEndYear)
      repository.cache.set(key, {
        ...base,
        cacheKey: key,
        capability: 'teamSeason',
        teamId: team.team.id,
        seasonEndYear,
        providerTeamId: providerId(team.code),
        data: profile,
      })
    }
    repository.scheduledBbsProgress = {
      cycleDate: '2026-11-17' as NbaGameDate,
      cursor: 0,
      pauseUntil: null,
      tasks: [{ task: { type: 'enrichStandings', seasonEndYear }, attempts: 0, retryAt: null }],
    }

    const result = await runScheduledBbsRefresh(
      environment,
      repository,
      fakeBbsFetch().fetcher,
      now,
    )
    expect(result[0]?.state).toBe('refreshed')
    const refreshed = repository.cache.get(standingsKey)
    expect(
      refreshed?.capability === 'standings' &&
        refreshed.data.find((row) => row.team.abbreviation === 'BOS')?.record,
    ).toMatchObject({ homeWins: 18, homeLosses: 5, awayWins: 13, awayLosses: 10, lastTenWins: 7 })
    vi.restoreAllMocks()
  })

  it('preserves provider quota headroom when the tightest remaining bucket reaches 25', async () => {
    const repository = new MemoryRepository()
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { 'x-ratelimit-remaining': '25' },
        }),
    ) as typeof fetch
    const result = await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      fetcher,
      now,
    )
    expect(result.state).toBe('deferred')
    expect(result.error?.code).toBe('rate_limited')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(repository.cache.get(gamesCacheKey('bbs', date))?.capability).toBe('games')
  })

  it('uses generic remaining as the conservative floor across daily and minute quota', async () => {
    const repository = new MemoryRepository()
    const { fetcher, paths } = fakeBbsFetch()
    const withMinuteCounter = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetcher(input, init)
      const body = await response.text()
      return new Response(body, {
        status: response.status,
        headers: { 'x-ratelimit-remaining': '99' },
      })
    }) as typeof fetch
    const result = await refreshBbsGames(
      { type: 'games', date },
      environment,
      repository,
      withMinuteCounter,
      now + 24 * 60 * 60_000,
    )
    expect(result.state).toBe('refreshed')
    expect(paths).toHaveLength(3)
  })
})
