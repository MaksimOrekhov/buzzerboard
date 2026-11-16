import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import EmptyState from './EmptyState.vue'

describe('EmptyState', () => {
  it('renders an honest empty state with a descriptive heading', () => {
    const wrapper = mount(EmptyState, {
      props: {
        icon: 'calendar',
        title: 'No games are available yet',
        description: 'Connect a trusted source to show the schedule.',
      },
    })

    expect(wrapper.get('h2').text()).toBe('No games are available yet')
    expect(wrapper.text()).toContain('Connect a trusted source to show the schedule.')
    expect(wrapper.find('svg[aria-hidden="true"]').exists()).toBe(true)
  })
})
