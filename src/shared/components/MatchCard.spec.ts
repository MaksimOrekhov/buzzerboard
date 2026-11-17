import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MatchCard from './MatchCard.vue'
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
  it('keeps the NBA date separate from the local Cyprus date and time', () => {
    const wrapper = mount(MatchCard, { props: { game } })

    expect(wrapper.get('.match-date').text()).toContain('15 нояб. 2026 г.')
    expect(wrapper.get('.match-date').text()).toContain('(ET)')
    expect(wrapper.get('.match-card-footer').text()).toContain('Кипр · Europe/Nicosia')
    expect(wrapper.get('time').text()).toContain('16 ноября')
    expect(wrapper.get('time').text()).toContain('04:30')
    expect(wrapper.get('time').text()).toContain('GMT+2')
    expect(wrapper.text()).toContain('—')
  })
})
