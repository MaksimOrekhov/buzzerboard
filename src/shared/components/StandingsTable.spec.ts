import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import StandingsTable from './StandingsTable.vue'
import { makeStandingsRows } from '@/features/standings/standingsTestData'

describe('StandingsTable', () => {
  it('renders source-provided rank as unavailable instead of using provider order', () => {
    const row = makeStandingsRows('east', 1)[0]!
    const wrapper = mount(StandingsTable, {
      props: { rows: [row], conference: 'east' },
    })

    expect(wrapper.get('.rank-cell').text()).toBe('—')
    expect(wrapper.text()).toContain('East Team 1')
    expect(wrapper.text()).toContain('30–10')
    expect(wrapper.text()).toContain('.750')
  })

  it('includes verified metrics in the narrow mobile card layout', () => {
    const wrapper = mount(StandingsTable, {
      props: {
        rows: makeStandingsRows('west', 1),
        conference: 'west',
        gamesBehindByTeamId: new Map([[makeStandingsRows('west', 1)[0]!.team.id, 0]]),
      },
    })

    const mobileList = wrapper.get('.mobile-list').text()
    expect(mobileList).toContain('Запад')
    expect(mobileList).toContain('Победы–поражения')
    expect(mobileList).toContain('Дома')
    expect(mobileList).toContain('В гостях')
    expect(mobileList).toContain('Победы в последних 10')
    expect(mobileList).toContain('Средняя разница очков за матч')
  })

  it('emits sorting and favorite actions to the owning view', async () => {
    const row = makeStandingsRows('east', 1)[0]!
    const wrapper = mount(StandingsTable, {
      props: { rows: [row], conference: 'east' },
    })

    await wrapper.get('button[aria-label^="Сортировать по полю «проценту"]').trigger('click')
    await wrapper.get('.favorite-button').trigger('click')

    expect(wrapper.emitted('sort')).toEqual([['winPercentage']])
    expect(wrapper.emitted('toggleFavorite')).toEqual([[row.team.id]])
  })
})
