import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NbaLeagueLogo from './NbaLeagueLogo.vue'

describe('NbaLeagueLogo', () => {
  it('loads the official color NBA mark directly from the NBA CDN', () => {
    const wrapper = mount(NbaLeagueLogo)
    expect(wrapper.get('img').attributes('src')).toBe(
      'https://cdn.nba.com/logos/nba/nba-logoman.svg',
    )
    expect(wrapper.get('img').attributes('referrerpolicy')).toBe('no-referrer')
  })

  it('falls back to the NBA label when the image cannot load', async () => {
    const wrapper = mount(NbaLeagueLogo)
    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toBe('NBA')
  })
})
