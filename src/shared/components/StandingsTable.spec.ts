import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import StandingsTable from './StandingsTable.vue'
import { makeStandingsRows } from '@/features/standings/standingsTestData'

describe('StandingsTable', () => {
  it('renders source-provided rank as unavailable instead of using provider order', () => {
    const row = makeStandingsRows('east', 1)[0]!
    const wrapper = mount(StandingsTable, {
      global: { stubs: { AppTooltip: { template: '<slot />' } } },
      props: { rows: [row], conference: 'east' },
    })

    expect(wrapper.find('.rank-cell').exists()).toBe(false)
    expect(wrapper.get('thead').text()).not.toContain('Место')
    expect(wrapper.text()).toContain('East Team 1')
    expect(wrapper.text()).toContain('30–10')
    expect(wrapper.text()).toContain('.750')
  })

  it('shows only explicit ranks and does not infer incomplete conference records', () => {
    const rows = makeStandingsRows('east', 2)
    rows[0]!.officialRank = 7
    rows[0]!.record.conferenceWins = 4
    rows[0]!.record.conferenceLosses = null
    const wrapper = mount(StandingsTable, {
      props: { rows, conference: 'east' },
      global: { stubs: { AppTooltip: { template: '<slot />' } } },
    })
    expect(wrapper.findAll('.rank-cell').map((cell) => cell.text())).toEqual(['7', '—'])
    expect(wrapper.findAll('tbody tr')[0]!.findAll('td')[6]!.text()).toBe('—')
  })

  it('keeps verified metrics in the same semantic table at every width', () => {
    const wrapper = mount(StandingsTable, {
      global: { stubs: { AppTooltip: { template: '<slot />' } } },
      props: {
        rows: makeStandingsRows('west', 1),
        conference: 'west',
        gamesBehindByTeamId: new Map([[makeStandingsRows('west', 1)[0]!.team.id, 0]]),
      },
    })

    const table = wrapper.get('table').text()
    expect(wrapper.get('caption').text()).toContain('Западная конференция')
    expect(table).toContain('В–П')
    expect(table).toContain('Дома')
    expect(table).toContain('В гостях')
    expect(table).toContain('Посл. 10')
    expect(table).toContain('Разница')
    expect(table).toContain('Конф.')
    expect(table).toContain('—')
  })

  it('emits sorting and favorite actions to the owning view', async () => {
    const row = makeStandingsRows('east', 1)[0]!
    const wrapper = mount(StandingsTable, {
      global: { stubs: { AppTooltip: { template: '<slot />' } } },
      props: { rows: [row], conference: 'east' },
    })

    await wrapper.get('button[aria-label^="Сортировать по полю «проценту"]').trigger('click')
    await wrapper.get('.favorite-button').trigger('click')

    expect(wrapper.emitted('sort')).toEqual([['winPercentage']])
    expect(wrapper.emitted('toggleFavorite')).toEqual([[row.team.id]])
  })
})
