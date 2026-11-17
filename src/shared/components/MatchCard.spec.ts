import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MatchCard from './MatchCard.vue'
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

describe('MatchCard', () => {
  it('keeps the NBA date separate from the viewer-local date, time, and timezone', () => {
    const wrapper = mount(MatchCard, { props: { game } })
    const expectedLocalStart = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: VIEWER_TIME_ZONE,
      timeZoneName: 'short',
    }).format(new Date(game.startsAt!))

    expect(wrapper.get('.match-date').text()).toContain('15 нояб. 2026 г.')
    expect(wrapper.get('.match-date').text()).toContain('(ET)')
    expect(wrapper.get('.match-card-footer').text()).toContain(
      `Местное время · ${VIEWER_TIME_ZONE}`,
    )
    expect(wrapper.get('time').text()).toBe(expectedLocalStart)
    expect(wrapper.text()).toContain('—')
  })

  it('shows only provider-supplied period detail and can toggle favorite state', async () => {
    const wrapper = mount(MatchCard, {
      props: { game, favorite: false, detailsExpanded: true },
      global: { stubs: { AppIcon: true } },
    })

    await wrapper.get('[aria-label="Добавить матч в избранное"]').trigger('click')
    await wrapper.get('.match-action[aria-expanded="true"]').trigger('click')

    expect(wrapper.emitted('toggleFavorite')).toHaveLength(1)
    expect(wrapper.emitted('toggleDetails')).toHaveLength(1)
    expect(wrapper.text()).toContain('Источник не передал арену или счёт по периодам')
  })
})
