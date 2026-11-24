import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import GameScoreRow from './GameScoreRow.vue'
import { VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'
import type {
  Game,
  GameId,
  NbaGameDate,
  ProviderRecordId,
  TeamId,
  UtcTimestamp,
} from '@/entities/nba/model'

const game: Game = {
  id: 'dunkapi:game:visual-fixture' as GameId,
  provider: 'dunkapi',
  providerId: 'visual-fixture' as ProviderRecordId,
  seasonEndYear: null,
  nbaGameDate: '2026-11-15' as NbaGameDate,
  startsAt: '2026-11-16T02:30:00.000Z' as UtcTimestamp,
  status: 'scheduled',
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
  score: { home: null, away: null },
  scoreByPeriod: null,
  venue: null,
}

describe('GameScoreRow', () => {
  it('keeps the NBA date separate from the viewer-local date, time, and timezone', () => {
    const wrapper = mount(GameScoreRow, {
      props: { game, favorite: false, expanded: true },
      global: { stubs: { AppIcon: true } },
    })
    const expectedLocalStart = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: VIEWER_TIME_ZONE,
    }).format(new Date(game.startsAt!))

    expect(wrapper.get('.gc-match-time').text()).toContain(
      new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
        timeZone: VIEWER_TIME_ZONE,
      }).format(new Date(game.startsAt!)),
    )
    expect(wrapper.get('.gc-match-details').text()).toContain(`Местное время · ${VIEWER_TIME_ZONE}`)
    expect(game.nbaGameDate).toBe('2026-11-15')
    expect(wrapper.get('time').text()).toBe(expectedLocalStart)
    expect(wrapper.text()).toContain('—')
  })

  it('shows only provider-supplied period detail and can toggle favorite state', async () => {
    const wrapper = mount(GameScoreRow, {
      props: { game, favorite: false, expanded: true },
      global: { stubs: { AppIcon: true } },
    })

    await wrapper.get('[aria-label="Добавить матч в избранное"]').trigger('click')
    await wrapper.get('.gc-detail-button[aria-expanded="true"]').trigger('click')

    expect(wrapper.emitted('favorite')).toHaveLength(1)
    expect(wrapper.emitted('details')).toHaveLength(1)
    expect(wrapper.text()).toContain('Счёт по четвертям недоступен.')
  })
  it('keeps the scoreboard match, teams and favorite as separate controls and only marks confirmed winners', async () => {
    const final = {
      ...game,
      status: 'final' as const,
      score: { away: 110, home: 105 },
      awayTeam: { ...game.awayTeam, id: 'nba:team:BOS' as TeamId },
      homeTeam: { ...game.homeTeam, id: 'nba:team:NYK' as TeamId },
    }
    const wrapper = mount(GameScoreRow, {
      props: {
        game: final,
        favorite: false,
        expanded: false,
        detailsTo: '/games/example',
        scoreboard: true,
      },
      global: { stubs: { AppIcon: true, RouterLink: RouterLinkStub } },
    })
    expect(wrapper.findAllComponents(RouterLinkStub)).toHaveLength(3)
    expect(wrapper.get('.gc-scoreboard-result').attributes('aria-label')).toContain('Открыть матч')
    expect(wrapper.get('.gc-scoreboard-status').text()).toBe('Завершён')
    expect(wrapper.findAll('.gc-winner-marker')).toHaveLength(1)
    await wrapper.get('.gc-scoreboard-favorite').trigger('click')
    expect(wrapper.emitted('favorite')).toHaveLength(1)
    await wrapper.setProps({ game: { ...final, status: 'unknown' } })
    expect(wrapper.get('.gc-scoreboard-status').text()).toBe('Уточняется')
    expect(wrapper.find('.gc-winner-marker').exists()).toBe(false)
    await wrapper.setProps({
      game: { ...final, status: 'postponed', score: { away: null, home: null } },
    })
    expect(wrapper.get('.gc-scoreboard-status').text()).toBe('Перенесён')
    expect(wrapper.find('.gc-winner-marker').exists()).toBe(false)
  })
})
