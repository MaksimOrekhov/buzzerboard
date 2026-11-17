import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchGamesForDate, WorkerApiError } from './api'
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
})
