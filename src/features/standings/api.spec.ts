import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchStandings } from './api'
import { makeStandingsRows } from './standingsTestData'
import type { SeasonEndYear, UtcTimestamp } from '@/entities/nba/model'
import type { StandingsResponse } from '@/shared/api/nba/contracts'
import { WorkerApiError } from '@/shared/api/nba/workerClient'

const response: StandingsResponse = {
  data: makeStandingsRows(),
  meta: {
    source: 'dunkapi',
    fetchedAt: '2026-11-17T07:41:38.629Z' as UtcTimestamp,
    providerUpdatedAt: null,
    isStale: false,
    rejectedRecords: 0,
    refreshError: null,
  },
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchStandings', () => {
  it('reads the same-origin Worker GET with no provider credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchStandings(2027 as SeasonEndYear)

    expect(result).toEqual(response)
    expect(fetchMock).toHaveBeenCalledWith('/api/standings?seasonEndYear=2027', {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    expect(JSON.stringify(fetchMock.mock.calls)).not.toMatch(/api.?key|authorization/i)
  })

  it('preserves cache_miss as a distinct Worker error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'cache_miss',
              message: 'Снимок не найден.',
              retryable: true,
              provider: 'dunkapi',
              upstreamStatus: null,
            },
            requestId: null,
          }),
          { status: 503 },
        ),
      ),
    )

    const request = fetchStandings(2027 as SeasonEndYear)
    await expect(request).rejects.toMatchObject({ error: { code: 'cache_miss' } })
    await expect(request).rejects.toBeInstanceOf(WorkerApiError)
  })

  it('rejects malformed standings payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"data":[]}')))

    await expect(fetchStandings(2027 as SeasonEndYear)).rejects.toMatchObject({
      error: { code: 'invalid_response' },
    })
  })
})
