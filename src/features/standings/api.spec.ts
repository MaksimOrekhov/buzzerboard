import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchStandings } from './api'
import { makeStandingsRows } from './standingsTestData'
import type { SeasonEndYear, UtcTimestamp } from '@/entities/nba/model'
import type { StandingsResponse } from '@/shared/api/nba/contracts'
import { WorkerApiError } from '@/shared/api/nba/workerClient'

function makeResponse(
  source: StandingsResponse['meta']['source'],
  overrides: Partial<StandingsResponse['meta']> = {},
): StandingsResponse {
  return {
    data: [...makeStandingsRows('east'), ...makeStandingsRows('west')],
    meta: {
      source,
      fetchedAt: '2026-11-17T07:41:38.629Z' as UtcTimestamp,
      providerUpdatedAt: null,
      isStale: false,
      rejectedRecords: 0,
      refreshError: null,
      ...overrides,
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchStandings', () => {
  it('reads the same-origin Worker GET with no provider credentials', async () => {
    const response = makeResponse('dunkapi')
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

  it('accepts the full fresh BBS standings snapshot returned by the Worker', async () => {
    const response = makeResponse('bbs')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 })),
    )

    const result = await fetchStandings(2027 as SeasonEndYear)

    expect(result.meta.source).toBe('bbs')
    expect(result.meta.isStale).toBe(false)
    expect(result.data).toHaveLength(30)
  })

  it.each(['dunkapi', 'espn', 'bbs'] as const)('accepts known provider %s', async (source) => {
    const response = makeResponse(source)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 })),
    )

    await expect(fetchStandings(2027 as SeasonEndYear)).resolves.toEqual(response)
  })

  it('preserves a stale BBS cache with its structured BBS refresh error', async () => {
    const response = makeResponse('bbs', {
      isStale: true,
      refreshError: {
        code: 'upstream_unavailable',
        message: 'Поставщик данных NBA временно недоступен.',
        retryable: true,
        provider: 'bbs',
        upstreamStatus: 503,
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 })),
    )

    await expect(fetchStandings(2027 as SeasonEndYear)).resolves.toEqual(response)
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

  it('rejects standings from an unknown provider', async () => {
    const response = makeResponse('bbs')
    const malformed = {
      ...response,
      meta: { ...response.meta, source: 'unknown-provider' },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(malformed), { status: 200 })),
    )

    await expect(fetchStandings(2027 as SeasonEndYear)).rejects.toMatchObject({
      error: { code: 'invalid_response' },
    })
  })
})
