import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import StandingsTable from './StandingsTable.vue'
import type { ProviderRecordId, StandingsRow, TeamId } from '@/entities/nba/model'

const row: StandingsRow = {
  team: {
    id: 'espn:team:bos' as TeamId,
    providerId: 'bos' as ProviderRecordId,
    abbreviation: 'BOS',
    displayName: 'Boston Celtics',
  },
  seasonEndYear: null,
  conference: 'east',
  record: {
    wins: 0,
    losses: 0,
    conferenceWins: null,
    conferenceLosses: null,
    homeWins: null,
    homeLosses: null,
    awayWins: null,
    awayLosses: null,
    lastTenWins: null,
    pointsFor: null,
    pointsAgainst: null,
    averageMargin: null,
  },
  winPercentage: 0,
  officialRank: null,
  playoffSeed: null,
  providerOrder: 1,
}

describe('StandingsTable', () => {
  it('does not turn provider order into an official rank', () => {
    const wrapper = mount(StandingsTable, { props: { rows: [row] } })

    expect(wrapper.get('.rank-cell').text()).toBe('—')
    expect(wrapper.text()).toContain('Boston Celtics')
    expect(wrapper.text()).toContain('0–0')
  })

  it('explains the empty state instead of rendering invented teams', () => {
    const wrapper = mount(StandingsTable, { props: { rows: [] } })

    expect(wrapper.text()).toContain('Таблица ещё не загружена')
    expect(wrapper.text()).not.toContain('Boston Celtics')
  })
})
