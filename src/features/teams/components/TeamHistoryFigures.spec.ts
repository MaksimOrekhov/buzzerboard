import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { getTeamHistory } from '@/entities/nba/teamHistory'
import TeamHistoryFigures from './TeamHistoryFigures.vue'

describe('TeamHistoryFigures', () => {
  it('labels the two displayed Knicks numbers as a selection', () => {
    const wrapper = mount(TeamHistoryFigures, {
      props: { profile: getTeamHistory('NYK')! },
    })

    expect(wrapper.get('.team-history-retired').element.previousElementSibling?.textContent).toBe(
      'Подборка выведенных номеров',
    )
    expect(wrapper.findAll('.team-history-retired li').map((item) => item.text())).toEqual([
      '№19 Уиллис Рид',
      '№33 Патрик Юинг',
    ])
  })

  it('reports unconfirmed data separately from a sourced empty list', async () => {
    const profile = getTeamHistory('LAC')!
    const wrapper = mount(TeamHistoryFigures, { props: { profile } })

    expect(wrapper.text()).toContain('Список выведенных номеров пока не подтверждён.')
    expect(wrapper.find('.team-history-retired').exists()).toBe(false)
    await wrapper.setProps({
      profile: { ...profile, retired: { numbers: [], source: 'lac' } },
    })

    expect(wrapper.text()).toContain('По данным источника, у франшизы нет выведенных номеров.')
    expect(wrapper.text()).not.toContain('Список выведенных номеров пока не подтверждён.')
    expect(wrapper.find('.team-history-retired').exists()).toBe(false)
  })
})
