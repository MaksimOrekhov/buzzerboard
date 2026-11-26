import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, shallowRef } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import type { SeasonEndYear } from '@/entities/nba/model'
import type { StandingsResponse } from '@/shared/api/nba/contracts'
import { makeStandingsRows } from '../standingsTestData'
import { standingsQueryKey, useStandings } from './useStandings'

const oldSeason = 2026 as SeasonEndYear
const newSeason = 2027 as SeasonEndYear

function fixture(seasonEndYear: SeasonEndYear) {
  return {
    data: makeStandingsRows('east', 1).map((row) => ({ ...row, seasonEndYear })),
    meta: {
      source: 'bbs',
      fetchedAt: '2026-11-25T06:40:00.000Z',
      providerUpdatedAt: null,
      isStale: false,
      rejectedRecords: 0,
      refreshError: null,
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

it('isolates delayed seasons and refetches an inactive key using its own season', async () => {
  const requests: { url: string; response: (response: Response) => void }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => new Promise<Response>((response) => requests.push({ url, response }))),
  )
  const client = new QueryClient()
  const season = shallowRef(oldSeason)
  let query!: ReturnType<typeof useStandings>
  const wrapper = mount(
    defineComponent({
      setup() {
        query = useStandings(season)
        return () => null
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
  )

  try {
    const read = (key: SeasonEndYear) =>
      client.getQueryData<StandingsResponse>(standingsQueryKey(key))
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]!.url).toBe('/api/standings?seasonEndYear=2026')
    requests[0]!.response(Response.json(fixture(oldSeason)))
    await vi.waitFor(() => expect(query.data.value).toEqual(fixture(oldSeason)))

    const delayed = query.refetch()
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    season.value = newSeason
    await nextTick()
    await vi.waitFor(() => expect(requests).toHaveLength(3))
    expect(requests[2]!.url).toBe('/api/standings?seasonEndYear=2027')

    requests[2]!.response(Response.json(fixture(newSeason)))
    await vi.waitFor(() => expect(query.data.value).toEqual(fixture(newSeason)))
    const stale = fixture(oldSeason)
    requests[1]!.response(Response.json({ ...stale, meta: { ...stale.meta, isStale: true } }))
    await delayed
    expect(read(oldSeason)).toEqual(fixture(oldSeason))
    expect(read(newSeason)).toEqual(fixture(newSeason))

    const refetch = client.refetchQueries({ queryKey: standingsQueryKey(oldSeason), exact: true })
    await vi.waitFor(() => expect(requests).toHaveLength(4))
    const cachedSeasonUrl = requests[3]!.url
    requests[3]!.response(Response.json(fixture(oldSeason)))
    await refetch

    expect(cachedSeasonUrl).toBe('/api/standings?seasonEndYear=2026')
    expect(read(oldSeason)).toEqual(fixture(oldSeason))
    expect(read(newSeason)).toEqual(fixture(newSeason))
    expect(query.data.value).toEqual(fixture(newSeason))
  } finally {
    wrapper.unmount()
    client.clear()
  }
})
