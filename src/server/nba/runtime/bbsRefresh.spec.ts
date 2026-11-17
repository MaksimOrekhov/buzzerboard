import fixture from '../../../../docs/fixtures/bbs.synthetic.json'
import { describe, expect, it, vi } from 'vitest'
import type { NbaGameDate } from '@/entities/nba/model'
import type {
  NbaCacheRecord,
  NbaRepository,
  WorkerEnvironment,
  CreditUsage,
} from '@/server/nba/runtime/types'
import { gameDetailsCacheKey, gamesCacheKey } from '@/server/nba/runtime/cacheKeys'
import { refreshBbsGames } from '@/server/nba/runtime/bbsRefresh'
import { createNbaWorker } from '@/server/worker'

const now = Date.parse('2026-11-17T10:00:00.000Z')
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
  locks = new Set<string>()
  async getCache(key: string) {
    return this.cache.get(key) ?? null
  }
  async putCache(record: NbaCacheRecord) {
    this.cache.set(record.cacheKey, record)
  }
  async deleteCache(key: string) {
    this.cache.delete(key)
  }
  async tryAcquireLock(key: string) {
    if (this.locks.has(key)) return false
    this.locks.add(key)
    return true
  }
  async releaseLock(key: string) {
    this.locks.delete(key)
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
  async cleanupExpired() {}
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
            home: { team_id: 'bbs-bos', pts: 112, fgm: 41, fga: 88 },
            away: { team_id: 'bbs-nyk', pts: 108, fgm: 40, fga: 90 },
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
            home: [{ player_id: 'bos-player-1', player_name: 'Synthetic Home Player', pts: 28 }],
            away: [{ player_id: 'nyk-player-1', player_name: 'Synthetic Away Player', pts: 22 }],
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
    const source = structuredClone(fixture.data[0]!)
    source.id = `synthetic-busy-game-${index + 1}`
    source.archive_game_id = 91000000 + index
    source.home = {
      ...source.home,
      team_id: `bbs-${teamCodes[index * 2]!.toLowerCase()}`,
      abbreviation: teamCodes[index * 2]!,
    }
    source.away = {
      ...source.away,
      team_id: `bbs-${teamCodes[index * 2 + 1]!.toLowerCase()}`,
      abbreviation: teamCodes[index * 2 + 1]!,
    }
    return source
  })
  return { data: matches, pagination: { total: matches.length, limit: 100, offset: 0 } }
}

function busyDayFetch() {
  const paths: string[] = []
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    paths.push(url.pathname)
    if (url.pathname === '/v1/matches') {
      return new Response(JSON.stringify(busyDayFixture()), { status: 200 })
    }
    if (url.pathname.startsWith('/v1/nba/games/') && !url.pathname.endsWith('/box')) {
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
            home: { pts: 112 },
            away: { pts: 108 },
          },
        }),
        { status: 200 },
      )
    }
    const uuid = url.pathname.split('/').at(-2)!
    const index = Number(uuid.split('-').at(-1)) - 1
    return new Response(
      JSON.stringify({
        data: {
          id: uuid,
          home: [{ player_id: `home-${index}`, player_name: 'Synthetic Home Player', pts: 28 }],
          away: [{ player_id: `away-${index}`, player_name: 'Synthetic Away Player', pts: 22 }],
        },
      }),
      { status: 200 },
    )
  })
  return { fetcher: fetcher as typeof fetch, paths }
}

describe('BBS cached refresh flow', () => {
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
    expect(paths).toHaveLength(4)
    expect(paths.map((path) => new URL(`https://bbs.test${path}`).pathname)).toEqual([
      '/v1/matches',
      '/v1/nba/games/90000001',
      '/v1/nba/games/synthetic-final-match-uuid/box',
      '/v1/nba/games/90000001/availability',
    ])
    const games = repository.cache.get(gamesCacheKey('bbs', date))
    expect(games?.capability).toBe('games')
    if (games?.capability !== 'games') throw new Error('Expected a BBS game snapshot')
    expect(games.providerReferences?.[games.data[0]!.id]).toBe('90000001')
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
    expect(((await details.json()) as { boxScoreAvailability: string }).boxScoreAvailability).toBe(
      'available',
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

  it('stops after a provider 429 without retrying or spending more requests', async () => {
    const repository = new MemoryRepository()
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
    ).toEqual([2])
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
      expect(paths).toHaveLength(46)
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
      ).toEqual([46])
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('serializes concurrent workers and refreshes the UTC daily counter at midnight', async () => {
    const repository = new MemoryRepository()
    const { fetcher, paths } = fakeBbsFetch()
    const concurrent = await Promise.all([
      refreshBbsGames({ type: 'games', date }, environment, repository, fetcher, now),
      refreshBbsGames({ type: 'games', date }, environment, repository, fetcher, now),
    ])
    expect(concurrent.map((result) => result.state).sort()).toEqual(['in_progress', 'refreshed'])
    expect(paths).toHaveLength(4)

    const midnightRepository = new MemoryRepository()
    const emptyFixture = { data: [], pagination: { total: 0, limit: 100, offset: 0 } }
    const midnightFetch = vi.fn(
      async () => new Response(JSON.stringify(emptyFixture), { status: 200 }),
    ) as typeof fetch
    const once = { ...environment, BBS_DAILY_REQUEST_LIMIT: '1' }
    const beforeMidnight = Date.parse('2026-11-17T23:59:59.000Z')
    const afterMidnight = Date.parse('2026-11-18T00:00:01.000Z')
    await refreshBbsGames(
      { type: 'games', date: '2026-11-17' as NbaGameDate },
      once,
      midnightRepository,
      midnightFetch,
      beforeMidnight,
    )
    const nextDay = await refreshBbsGames(
      { type: 'games', date: '2026-11-18' as NbaGameDate },
      once,
      midnightRepository,
      midnightFetch,
      afterMidnight,
    )
    expect(nextDay.state).toBe('refreshed')
    expect(midnightFetch).toHaveBeenCalledTimes(2)
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

  it('preserves provider quota headroom when upstream exposes daily remaining headers', async () => {
    const repository = new MemoryRepository()
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { 'x-ratelimit-remaining-day': '25' },
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
    expect(result.error?.code).toBe('quota_exceeded')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(repository.cache.get(gamesCacheKey('bbs', date))?.capability).toBe('games')
  })

  it('does not mistake the generic remaining counter for daily quota', async () => {
    const repository = new MemoryRepository()
    const { fetcher, paths } = fakeBbsFetch()
    const withMinuteCounter = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetcher(input, init)
      const body = await response.text()
      return new Response(body, {
        status: response.status,
        headers: { 'x-ratelimit-remaining': '25' },
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
    expect(paths).toHaveLength(4)
  })
})
