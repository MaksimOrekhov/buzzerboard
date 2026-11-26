import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchGameDetails, fetchGamesForDate, WorkerApiError } from './api'
import type {
  Game,
  GameId,
  NbaGameDate,
  ProviderRecordId,
  SeasonEndYear,
  TeamId,
  UtcTimestamp,
} from '@/entities/nba/model'
import type { GamesResponse } from '@/shared/api/nba/contracts'

const game: Game = {
  id: 'dunkapi:game:401800001' as GameId,
  provider: 'dunkapi',
  providerId: '401800001' as ProviderRecordId,
  seasonEndYear: 2027 as SeasonEndYear,
  nbaGameDate: '2026-11-15' as NbaGameDate,
  startsAt: '2026-11-16T01:00:00.000Z' as UtcTimestamp,
  status: 'final',
  homeTeam: {
    id: 'nba:team:nyk' as TeamId,
    providerId: 'nyk' as ProviderRecordId,
    abbreviation: 'NYK',
    displayName: 'New York Knicks',
  },
  awayTeam: {
    id: 'nba:team:bos' as TeamId,
    providerId: 'bos' as ProviderRecordId,
    abbreviation: 'BOS',
    displayName: 'Boston Celtics',
  },
  score: { home: 118, away: 112 },
  scoreByPeriod: null,
  venue: null,
}

const gamesResponse: GamesResponse = {
  data: [game],
  meta: {
    source: 'dunkapi',
    fetchedAt: '2026-11-16T10:00:00.000Z' as UtcTimestamp,
    providerUpdatedAt: null,
    isStale: false,
    rejectedRecords: 0,
    refreshError: null,
  },
}

const detailsResponse = {
  data: { game, boxScore: null },
  meta: gamesResponse.meta,
  boxScoreMeta: null,
  boxScoreAvailability: 'unavailable',
}

const boxScore = {
  game,
  teams: [game.homeTeam, game.awayTeam].map((team) => ({
    team,
    points: team === game.homeTeam ? game.score.home : game.score.away,
    rebounds: null,
    offensiveRebounds: null,
    defensiveRebounds: null,
    assists: null,
    steals: null,
    blocks: null,
    turnovers: null,
    fouls: null,
    plusMinus: -3,
    fieldGoals: { made: 36, attempted: 80, percentage: 0.45 },
    threePointers: { made: null, attempted: null, percentage: null },
    freeThrows: { made: null, attempted: null, percentage: null },
  })),
  players: [],
}

function mockResponse(payload: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)))
}

const invalidResponse = { status: 200, error: { code: 'invalid_response', retryable: false } }

afterEach(() => vi.unstubAllGlobals())

describe('fetchGamesForDate', () => {
  it('reads the same-origin Worker API without sending upstream credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(gamesResponse), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchGamesForDate('2026-11-15' as NbaGameDate)

    expect(result.data).toEqual([game])
    expect(fetchMock).toHaveBeenCalledWith('/api/games?date=2026-11-15', {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('x-api-key')
  })

  it('keeps cache_miss distinct from a confirmed empty day', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'cache_miss',
              message: 'Данные NBA для запрошенного периода ещё не сохранены.',
              retryable: true,
              provider: 'dunkapi',
              upstreamStatus: null,
            },
            requestId: 'request-test',
          }),
          { status: 503 },
        ),
      ),
    )

    try {
      await fetchGamesForDate('2026-11-15' as NbaGameDate)
      expect.fail('Expected an uncached date to reject the Worker response')
    } catch (error) {
      expect(error).toBeInstanceOf(WorkerApiError)
      expect(error).toMatchObject({ status: 503, requestId: 'request-test' })
      expect((error as WorkerApiError).error.code).toBe('cache_miss')
    }
  })

  it.each([false, true])('rejects a wrong-date game (mixed snapshot: %s)', async (mixed) => {
    const wrongDate = { ...game, nbaGameDate: '2026-11-14' }
    mockResponse({ ...gamesResponse, data: mixed ? [game, wrongDate] : [wrongDate] })

    await expect(fetchGamesForDate(game.nbaGameDate)).rejects.toMatchObject(invalidResponse)
  })

  it('accepts an explicitly empty snapshot with valid metadata', async () => {
    const empty = { ...gamesResponse, data: [] }
    mockResponse(empty)
    await expect(fetchGamesForDate(game.nbaGameDate)).resolves.toEqual(empty)
  })
})

describe('game fields at the Worker boundary', () => {
  const invalidGames = [
    { startsAt: 'not-a-timestamp' },
    { startsAt: '2026-02-29T00:30:00Z' },
    { startsAt: '2026-11-15T24:00:00Z' },
    { startsAt: '2026-11-15T12:00:00+02:60' },
    { startsAt: '2026-11-15T12:00:00' },
    { startsAt: '2026-11-15' },
    { score: { home: 4.5, away: -15 } },
    { score: { home: 0, away: Number.MAX_SAFE_INTEGER + 1 } },
    { scoreByPeriod: [{ period: 1, home: 0, away: -1 }] },
    { scoreByPeriod: [{ period: 1, home: 1.5, away: null }] },
    { scoreByPeriod: [{ period: 1, home: Number.MAX_SAFE_INTEGER + 1, away: null }] },
  ]

  it.each(invalidGames)('rejects %j in list and details', async (fields) => {
    const malformed = { ...game, ...fields }
    mockResponse({ ...gamesResponse, data: [malformed] })
    await expect(fetchGamesForDate(game.nbaGameDate)).rejects.toMatchObject(invalidResponse)

    mockResponse({ ...detailsResponse, data: { game: malformed, boxScore: null } })
    await expect(fetchGameDetails(game.id, game.nbaGameDate)).rejects.toMatchObject(invalidResponse)
  })

  it.each([
    null,
    '2026-03-08T01:59:59-05:00',
    '2026-03-08T03:00:00-04:00',
    '2026-11-16T01:00:00.000Z',
  ])('keeps a valid instant %s and preserves a partial final with null/zero points', async (at) => {
    const partialFinal = {
      ...game,
      startsAt: at,
      score: { home: 0, away: null },
      scoreByPeriod: [{ period: 1, home: null, away: 0 }],
    }
    const payload = { ...gamesResponse, data: [partialFinal] }
    mockResponse(payload)
    await expect(fetchGamesForDate(game.nbaGameDate)).resolves.toEqual(payload)
  })
})

describe('snapshot metadata at the Worker boundary', () => {
  const refreshError = {
    code: 'timeout',
    message: 'Источник не ответил.',
    retryable: true,
    provider: 'dunkapi',
    upstreamStatus: 504,
  }

  it.each([
    { fetchedAt: 'invalid', rejectedRecords: -2 },
    { fetchedAt: '2026-04-31T12:00:00Z' },
    { fetchedAt: null },
    { providerUpdatedAt: '2026-02-29T12:00:00+03:00' },
    { providerUpdatedAt: undefined },
    { rejectedRecords: -2 },
    { rejectedRecords: 1.5 },
    { rejectedRecords: Number.MAX_SAFE_INTEGER + 1 },
    { refreshError: undefined },
    { refreshError: { ...refreshError, code: 'invalid' } },
    { refreshError: { ...refreshError, retryable: 'true' } },
    { refreshError: { ...refreshError, provider: 'invalid' } },
    { refreshError: { ...refreshError, upstreamStatus: 1.5 } },
  ])('rejects malformed games/details metadata %j', async (fields) => {
    const meta = { ...gamesResponse.meta, ...fields }
    mockResponse({ ...gamesResponse, meta })
    await expect(fetchGamesForDate(game.nbaGameDate)).rejects.toMatchObject(invalidResponse)

    mockResponse({ ...detailsResponse, meta })
    await expect(fetchGameDetails(game.id, game.nbaGameDate)).rejects.toMatchObject(invalidResponse)
  })

  it('keeps stale metadata and valid signed and fractional box metrics', async () => {
    const meta = {
      ...gamesResponse.meta,
      providerUpdatedAt: '2026-11-15T22:00:00-05:00',
      isStale: true,
      rejectedRecords: 2,
      refreshError,
    }
    mockResponse({ ...gamesResponse, meta })
    await expect(fetchGamesForDate(game.nbaGameDate)).resolves.toMatchObject({ meta })

    const details = {
      ...detailsResponse,
      data: { game, boxScore },
      meta,
      boxScoreMeta: meta,
      boxScoreAvailability: 'available',
    }
    mockResponse(details)
    await expect(fetchGameDetails(game.id, game.nbaGameDate)).resolves.toEqual(details)
  })
})

describe('fetchGameDetails response guards', () => {
  it.each([
    ['invalid fetchedAt', boxScore, { ...gamesResponse.meta, fetchedAt: 'invalid' }],
    ['negative rejectedRecords', boxScore, { ...gamesResponse.meta, rejectedRecords: -2 }],
    ['invalid metadata shape', boxScore, 'invalid'],
    ['missing metadata', boxScore, undefined],
    [
      'invalid nested timestamp',
      { ...boxScore, game: { ...game, startsAt: '2026-02-30T07:10:00Z' } },
      gamesResponse.meta,
    ],
    [
      'invalid nested period',
      { ...boxScore, game: { ...game, scoreByPeriod: [{ period: 1, home: 0, away: -1 }] } },
      gamesResponse.meta,
    ],
  ])('keeps the base game with %s in the box snapshot', async (_, box, boxScoreMeta) => {
    mockResponse({
      ...detailsResponse,
      boxScoreMeta,
      data: { game, boxScore: box },
      boxScoreAvailability: 'available',
    })

    await expect(fetchGameDetails(game.id, game.nbaGameDate)).resolves.toEqual({
      ...detailsResponse,
      boxScoreAvailability: 'snapshot_mismatch',
    })
  })

  it('drops invalid metadata of an unavailable box without changing availability', async () => {
    mockResponse({
      ...detailsResponse,
      boxScoreMeta: { ...gamesResponse.meta, rejectedRecords: -2 },
    })
    await expect(fetchGameDetails(game.id, game.nbaGameDate)).resolves.toEqual(detailsResponse)
  })

  it('keeps a valid game and safely drops a malformed nested box score', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { game, boxScore: { game: null, teams: 'invalid', players: null } },
            meta: gamesResponse.meta,
            boxScoreMeta: gamesResponse.meta,
            boxScoreAvailability: 'available',
          }),
          { status: 200 },
        ),
      ),
    )

    const response = await fetchGameDetails(game.id, game.nbaGameDate)

    expect(response.data.game).toEqual(game)
    expect(response.data.boxScore).toBeNull()
    expect(response.boxScoreAvailability).toBe('snapshot_mismatch')
    expect(response.boxScoreMeta).toBeNull()
  })

  it('rejects a cached game whose date differs from the requested date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { game, boxScore: null },
            meta: gamesResponse.meta,
            boxScoreMeta: null,
            boxScoreAvailability: 'unavailable',
          }),
          { status: 200 },
        ),
      ),
    )

    await expect(fetchGameDetails(game.id, '2026-11-16' as NbaGameDate)).rejects.toMatchObject({
      status: 200,
      error: { code: 'invalid_response' },
    })
  })
})
