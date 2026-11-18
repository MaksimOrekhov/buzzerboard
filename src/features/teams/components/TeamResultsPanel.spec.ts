import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { expect, it, vi } from 'vitest'
import type {
  GameId,
  NbaGameDate,
  PlayerId,
  SeasonEndYear,
  TeamSeasonProfile,
  UtcTimestamp,
} from '@/entities/nba/model'
import { findNbaTeam } from '@/entities/nba/teamCatalog'
import { useTeamSeason } from '../composables/useTeamSeason'
import TeamResultsPanel from './TeamResultsPanel.vue'

const season = 2027 as SeasonEndYear
const gameDate = '2026-11-18' as NbaGameDate
const fetchedAt = '2026-11-17T00:00:00.000Z' as UtcTimestamp
const gameId = 'bbs:game:synthetic' as GameId

function snapshot(code: string, leader: string, seasonEndYear = season) {
  const data: TeamSeasonProfile = {
    team: findNbaTeam(code)!.team,
    seasonEndYear,
    wins: 1,
    losses: 1,
    winPercentage: 0.5,
    overallRank: null,
    conferenceRank: null,
    gamesBack: null,
    streak: null,
    home: null,
    away: null,
    stats: {
      gamesPlayed: null,
      pointsPerGame: null,
      fieldGoalPercentage: null,
      threePointPercentage: null,
      reboundsPerGame: null,
      assistsPerGame: null,
      turnoversPerGame: null,
    },
    lastTen: [
      {
        gameId,
        nbaGameDate: gameDate,
        opponentCode: 'ATL',
        result: 'W',
        pointsFor: 110,
        pointsAgainst: 100,
        venue: null,
      },
    ],
    leaders: [
      {
        playerId: `nba:player:${leader}` as PlayerId,
        displayName: leader,
        statLabel: 'PPG',
        statValue: 20,
      },
    ],
    nextGame: { gameId, nbaGameDate: gameDate, startsAt: null, opponentCode: 'ATL', isHome: null },
  }
  return Response.json({
    data,
    meta: {
      source: 'bbs',
      fetchedAt,
      providerUpdatedAt: null,
      isStale: false,
      rejectedRecords: 0,
      refreshError: null,
    },
  })
}

it('updates leaders and match labels on team changes and refetch, rejecting crossed snapshots', async () => {
  const code = ref('BOS')
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(snapshot('BOS', 'Boston Leader'))
    .mockResolvedValueOnce(snapshot('NYK', 'New York Leader'))
    .mockResolvedValueOnce(snapshot('NYK', 'Updated Leader'))
    .mockResolvedValueOnce(snapshot('BOS', 'Wrong Team'))
    .mockResolvedValueOnce(snapshot('NYK', 'Wrong Season', 2026 as SeasonEndYear))
  vi.stubGlobal('fetch', fetch)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/teams/:teamCode', component: { render: () => null } },
      { path: '/games', component: { render: () => null } },
      { path: '/games/:gameId', name: 'game-details', component: { render: () => null } },
    ],
  })
  await router.push('/teams/BOS')
  const queryClient = new QueryClient()
  let query!: ReturnType<typeof useTeamSeason>
  const wrapper = mount(
    defineComponent({
      setup() {
        query = useTeamSeason(code, season)
        return () =>
          query.data.value ? h(TeamResultsPanel, { profile: query.data.value.data }) : null
      },
    }),
    { global: { plugins: [router, [VueQueryPlugin, { queryClient }]] } },
  )
  try {
    await vi.waitFor(() => expect(wrapper.text()).toContain('Boston Leader'))
    expect(wrapper.get('.teams-next-game').text()).toContain('Матч против')
    expect(wrapper.get('.teams-next-game').attributes('href')).toContain('date=2026-11-18')
    expect(wrapper.get('.teams-result-opponent').text()).toBe('ATL')
    expect(wrapper.find('[aria-label="Открыть матч Boston Celtics — ATL"]').exists()).toBe(true)

    code.value = 'NYK'
    await vi.waitFor(() => expect(wrapper.text()).toContain('New York Leader'))
    expect(wrapper.text()).not.toContain('Boston Leader')
    expect(wrapper.find('[aria-label="Открыть матч New York Knicks — ATL"]').exists()).toBe(true)
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/api/teams/BOS?seasonEndYear=2027',
      '/api/teams/NYK?seasonEndYear=2027',
    ])

    await query.refetch()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Updated Leader'))
    expect(wrapper.text()).not.toContain('New York Leader')
    for (const label of ['Wrong Team', 'Wrong Season']) {
      await expect(query.refetch({ throwOnError: true })).rejects.toMatchObject({
        error: { code: 'invalid_response' },
      })
      await flushPromises()
      expect(wrapper.text()).toContain('Updated Leader')
      expect(wrapper.text()).not.toContain(label)
    }
  } finally {
    wrapper.unmount()
    queryClient.clear()
    vi.unstubAllGlobals()
  }
})
