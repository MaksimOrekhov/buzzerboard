import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchStandings } from './api'
import { makeStandingsRows } from './standingsTestData'
import type { SeasonEndYear, UtcTimestamp } from '@/entities/nba/model'
import type { StandingsResponse } from '@/shared/api/nba/contracts'
import { WorkerApiError } from '@/shared/api/nba/workerClient'

const season = 2027 as SeasonEndYear
const invalidResponse = { status: 200, error: { code: 'invalid_response' } }

function mockResponse(payload: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)))
}

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
  it.each([
    ['all rows from another season', () => 2026],
    ['mixed seasons', (i: number) => (i === 20 ? 2026 : season)],
    ['all rows with unknown season', () => null],
    ['one row with unknown season', (i: number) => (i === 20 ? null : season)],
    ['one row with a string season', (i: number) => (i === 20 ? '2027' : season)],
  ])('rejects a snapshot with %s', async (_, rowSeason) => {
    const response = makeResponse('bbs')
    mockResponse({
      ...response,
      data: response.data.map((row, i) => ({ ...row, seasonEndYear: rowSeason(i) })),
    })
    await expect(fetchStandings(season)).rejects.toMatchObject(invalidResponse)
  })

  it('keeps a partial snapshot and degrades only out-of-range percentages to null', async () => {
    const response = makeResponse('bbs')
    const data = [1.42, -0.1, 0, 1, null, 0.999, 0.67, 0.67].map((winPercentage, i) => ({
      ...response.data[i]!,
      winPercentage,
    }))
    mockResponse({ ...response, data })
    await expect(fetchStandings(season)).resolves.toEqual({
      ...response,
      data: data.map((row, i) => (i < 2 ? { ...row, winPercentage: null } : row)),
    })
  })

  it.each(['".5"', '1e999'])(
    'rejects a PCT with an invalid type or nonfinite value %s',
    async (pct) => {
      const response = makeResponse('bbs')
      const json = JSON.stringify({
        ...response,
        data: [{ ...response.data[0], winPercentage: 0.5 }],
      })
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response(json.replace('"winPercentage":0.5', '"winPercentage":' + pct)),
          ),
      )
      await expect(fetchStandings(season)).rejects.toMatchObject(invalidResponse)
    },
  )

  it.each([
    { fetchedAt: 'invalid' },
    { fetchedAt: '2026-02-30T00:00:00Z' },
    { providerUpdatedAt: '2026-11-17T07:41:38' },
    { rejectedRecords: -1 },
    {
      refreshError: {
        code: 'timeout',
        message: 'Synthetic',
        retryable: true,
        provider: null,
        upstreamStatus: 503.5,
      },
    },
  ])('rejects malformed snapshot metadata %j', async (overrides) => {
    const response = makeResponse('bbs')
    mockResponse({ ...response, meta: { ...response.meta, ...overrides } })
    await expect(fetchStandings(season)).rejects.toMatchObject(invalidResponse)
  })

  it('preserves an empty snapshot with a valid timestamp offset', async () => {
    const response = {
      ...makeResponse('bbs', { providerUpdatedAt: '2026-11-17T01:41:38-05:00' as UtcTimestamp }),
      data: [],
    }
    mockResponse(response)
    await expect(fetchStandings(season)).resolves.toEqual(response)
  })

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
