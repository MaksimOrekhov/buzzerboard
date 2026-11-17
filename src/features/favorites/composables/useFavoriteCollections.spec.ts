import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it } from 'vitest'
import { useFavoriteCollections } from './useFavoriteCollections'
import { gamesQueryKey } from '@/features/games/composables/useGamesForDate'
import { standingsQueryKey } from '@/features/standings/composables/useStandings'
import { CURRENT_SEASON } from '@/features/standings/composables/useStandingsCenter'
import { getDefaultNbaGameDate } from '@/shared/utils/nbaDate'
import { shiftGameDate } from '@/features/games/composables/useGameCenter'
import type {
  Game,
  GameId,
  NbaGameDate,
  ProviderRecordId,
  TeamId,
  UtcTimestamp,
} from '@/entities/nba/model'
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  localStorage.clear()
})
function game(id: string, date: NbaGameDate): Game {
  return {
    id: id as GameId,
    provider: 'dunkapi',
    providerId: id as ProviderRecordId,
    nbaGameDate: date,
    startsAt: null,
    seasonEndYear: null,
    status: 'final',
    homeTeam: {
      id: 'test:home' as TeamId,
      providerId: null,
      abbreviation: 'H',
      displayName: 'Home Test',
    },
    awayTeam: {
      id: 'test:away' as TeamId,
      providerId: null,
      abbreviation: 'A',
      displayName: 'Away Test',
    },
    score: { home: 100, away: 90 },
    scoreByPeriod: null,
    venue: null,
  }
}
describe('Favorite collections', () => {
  it('groups cached matches by NBA day with their own fetch time and preserves unresolved IDs', async () => {
    const today = getDefaultNbaGameDate() as NbaGameDate
    const yesterday = shiftGameDate(today, -1)
    const client = new QueryClient()
    const meta = {
      source: 'dunkapi',
      fetchedAt: `${today}T12:00:00Z` as UtcTimestamp,
      providerUpdatedAt: null,
      isStale: false,
      rejectedRecords: 0,
      refreshError: null,
    }
    client.setQueryData(gamesQueryKey(today), { data: [game('today', today)], meta })
    client.setQueryData(gamesQueryKey(yesterday), {
      data: [game('yesterday', yesterday)],
      meta: { ...meta, fetchedAt: `${yesterday}T12:00:00Z`, isStale: true },
    })
    client.setQueryData(standingsQueryKey(CURRENT_SEASON), { data: [], meta })
    localStorage.setItem(
      'buzzerboard.favorite-games.v1',
      JSON.stringify(['today', 'yesterday', 'unloaded']),
    )
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/favorites', component: { render: () => null } }],
    })
    await router.push('/favorites')
    let state!: ReturnType<typeof useFavoriteCollections>
    const wrapper = mount(
      defineComponent({
        setup() {
          state = useFavoriteCollections()
          return () => null
        },
      }),
      { global: { plugins: [router, [VueQueryPlugin, { queryClient: client }]] } },
    )
    cleanups.push(() => {
      wrapper.unmount()
      client.clear()
    })
    expect(state.favoriteGameGroups.value.map((group) => [group.date, group.meta.isStale])).toEqual(
      [
        [today, false],
        [yesterday, true],
      ],
    )
    expect(state.favoriteGameGroups.value[1]!.meta.fetchedAt).toBe(`${yesterday}T12:00:00Z`)
    expect(state.unknownGames.value).toBe(1)
    client.setQueryData(gamesQueryKey(today), {
      data: [game('today', today), game('unloaded', today)],
      meta,
    })
    await nextTick()
    expect(state.unknownGames.value).toBe(0)
    expect(state.favoriteGameGroups.value[0]!.games).toHaveLength(2)
  })
})
