import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { useStandingsCenter, CURRENT_SEASON } from './useStandingsCenter'
import { standingsQueryKey } from './useStandings'
import { makeStandingsRows } from '../standingsTestData'
import type { StandingsRow } from '@/entities/nba/model'
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  localStorage.clear()
})
function setup(rows: StandingsRow[]) {
  const client = new QueryClient()
  const snapshot = {
    data: rows,
    meta: {
      source: 'dunkapi',
      fetchedAt: '2026-11-17T00:00:00Z',
      providerUpdatedAt: null,
      isStale: false,
      rejectedRecords: 0,
      refreshError: null,
    },
  }
  client.setQueryData(standingsQueryKey(CURRENT_SEASON), snapshot)
  let state!: ReturnType<typeof useStandingsCenter>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useStandingsCenter()
        return () => null
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
  )
  cleanups.push(() => {
    wrapper.unmount()
    client.clear()
  })
  return state
}
describe('Standings controls', () => {
  it('keeps comparison selection across conferences and limits it to two teams', async () => {
    const rows = [...makeStandingsRows('east'), ...makeStandingsRows('west')]
    const state = setup(rows)
    state.toggleCompare(rows[0]!.team.id)
    state.conference.value = 'west'
    state.toggleCompare(rows[15]!.team.id)
    state.toggleCompare(rows[16]!.team.id)
    await nextTick()
    expect(state.comparisonRows.value.map((row) => row.conference)).toEqual(['east', 'west'])
    expect(state.compareIds.value.size).toBe(2)
    state.clearComparison()
    expect(state.compareIds.value.size).toBe(0)
  })
  it('keeps favorites and search as filters without changing GB eligibility', () => {
    const rows = makeStandingsRows()
    const state = setup(rows)
    state.toggleFavorite(rows[0]!.team.id)
    state.favoriteOnly.value = true
    expect(state.visibleRows.value).toHaveLength(1)
    expect(state.activeStandings.value.gamesBehindAvailable).toBe(true)
    state.search.value = 'missing'
    expect(state.visibleRows.value).toHaveLength(0)
    state.resetFilters()
    expect(state.visibleRows.value).toHaveLength(15)
  })
  it('does not enable GB for an incomplete conference and sorts nullable conference wins last', () => {
    const rows = makeStandingsRows('east', 3)
    rows[0]!.record.conferenceWins = null
    rows[1]!.record.conferenceWins = 2
    rows[2]!.record.conferenceWins = 1
    const state = setup(rows)
    state.selectSort('gamesBehind')
    expect(state.sortBy.value).toBe('winPercentage')
    state.selectSort('conferenceWins')
    expect(state.visibleRows.value.map((row) => row.record.conferenceWins)).toEqual([2, 1, null])
    state.selectSort('conferenceWins')
    expect(state.visibleRows.value.map((row) => row.record.conferenceWins)).toEqual([1, 2, null])
  })
})
