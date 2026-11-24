import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { shiftGameDate, useGameCenter } from './useGameCenter'
import { gamesQueryKey } from './useGamesForDate'
import { getDefaultNbaGameDate } from '@/shared/utils/nbaDate'
import type { Game, GameId, NbaGameDate, TeamId, ProviderRecordId } from '@/entities/nba/model'

const today = getDefaultNbaGameDate() as NbaGameDate
const team = (id: string) => ({
  id: id as TeamId,
  providerId: null,
  abbreviation: id,
  displayName: id,
})
function game(
  id: string,
  home: number | null,
  away: number | null,
  status: Game['status'] = 'final',
): Game {
  return {
    id: id as GameId,
    provider: 'dunkapi',
    providerId: id as ProviderRecordId,
    nbaGameDate: today,
    startsAt: null,
    seasonEndYear: null,
    status,
    homeTeam: team(`home-${id}`),
    awayTeam: team(`away-${id}`),
    score: { home, away },
    scoreByPeriod: null,
    venue: null,
  }
}
const meta = {
  source: 'dunkapi',
  fetchedAt: `${today}T12:00:00Z`,
  providerUpdatedAt: null,
  isStale: false,
  rejectedRecords: 0,
  refreshError: null,
}
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  localStorage.clear()
  vi.unstubAllGlobals()
})
async function setup(records: Game[], date = today) {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const client = new QueryClient()
  client.setQueryData(gamesQueryKey(today), { data: records, meta })
  client.setQueryData(gamesQueryKey(shiftGameDate(today, -1)), { data: [], meta })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/games', component: { render: () => null } }],
  })
  await router.push({ path: '/games', query: { date } })
  let center!: ReturnType<typeof useGameCenter>
  const wrapper = mount(
    defineComponent({
      setup() {
        center = useGameCenter()
        return () => null
      },
    }),
    { global: { plugins: [router, [VueQueryPlugin, { queryClient: client }]] } },
  )
  cleanup.push(() => {
    wrapper.unmount()
    client.clear()
  })
  return { center, router, fetch }
}
describe('Game Center', () => {
  it('excludes unfinished and incomplete scores from derived day insights', async () => {
    const close = game('close', 101, 100)
    const high = game('high', 140, 130)
    const { center, fetch } = await setup([
      close,
      high,
      game('missing', null, 100),
      game('upcoming', 200, 199, 'scheduled'),
    ])
    expect(center.closestGame.value?.id).toBe(close.id)
    expect(center.highestGame.value?.id).toBe(high.id)
    expect(center.totalPoints.value).toBe(471)
    expect(center.scheduledCount.value).toBe(1)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('resets the team selection and details when changing the NBA date', async () => {
    const { center, router } = await setup([game('one', 110, 100)])
    center.teamFilter.value = 'home-one'
    center.expandedGameId.value = 'one' as GameId
    await router.replace({ query: { date: shiftGameDate(today, -1) } })
    expect(center.teamFilter.value).toBe('all')
    expect(center.expandedGameId.value).toBeNull()
    expect(center.games.value).toEqual([])
  })
  it('preserves active filters and restores them through date navigation and browser history', async () => {
    const { center, router } = await setup([game('one', 110, 100)])
    center.teamFilter.value = 'home-one'
    center.search.value = 'home'
    center.favoriteOnly.value = true
    center.sortDirection.value = 'desc'
    await center.setDate(shiftGameDate(today, -1))
    expect(center.teamFilter.value).toBe('home-one')
    expect(center.teamOptions.value).toContainEqual({ value: 'home-one', label: 'home-one' })
    expect(router.currentRoute.value.query).toMatchObject({
      team: 'home-one',
      q: 'home',
      favorites: '1',
      sort: 'desc',
    })
    const navigated = new Promise<void>((resolve) => {
      const remove = router.afterEach(() => {
        remove()
        resolve()
      })
    })
    router.back()
    await navigated
    expect(center.selectedDate.value).toBe(today)
    expect(center.teamFilter.value).toBe('home-one')
    expect(center.search.value).toBe('home')
    expect(center.favoriteOnly.value).toBe(true)
    expect(center.sortDirection.value).toBe('desc')
    center.resetFilters()
    expect(center.activeFilterCount.value).toBe(0)
  })
  it('keeps live and unknown games in one neutral filter across dates, history and detail return', async () => {
    const live = game('live', null, null, 'live')
    const unknown = game('unknown', null, null, 'unknown')
    const { center, router } = await setup([live, unknown, game('final', 100, 90)])
    await router.replace({ query: { date: today, status: 'live' } })
    expect(center.statusFilter.value).toBe('unknown')
    expect(center.visibleGames.value.map((item) => item.id)).toEqual(['live', 'unknown'])
    const destination = new URL(center.detailsTo(live), 'https://test.invalid')
    const returnTo = new URL(destination.searchParams.get('from')!, 'https://test.invalid')
    expect(returnTo.searchParams.get('status')).toBe('unknown')
    await center.setDate(shiftGameDate(today, -1))
    expect(router.currentRoute.value.query.status).toBe('unknown')
    const navigated = new Promise<void>((resolve) => {
      const remove = router.afterEach(() => {
        remove()
        resolve()
      })
    })
    router.back()
    await navigated
    expect(center.statusFilter.value).toBe('unknown')
    expect(center.visibleGames.value.map((item) => item.id)).toEqual(['live', 'unknown'])
  })
  it('rejects invalid and out-of-window URL dates', async () => {
    const { center, router } = await setup([], '2026-02-30' as NbaGameDate)
    expect(center.selectedDate.value).toBe(today)
    await router.replace({ query: { date: shiftGameDate(today, 8) } })
    expect(center.selectedDate.value).toBe(today)
    await router.replace({ query: { date: shiftGameDate(today, -31) } })
    expect(center.selectedDate.value).toBe(today)
  })
})
