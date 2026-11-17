import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ResourceState from './ResourceState.vue'
import type { NbaApiError, UtcTimestamp } from '@/entities/nba/model'
import type { NbaApiSnapshot } from '@/shared/api/nba/contracts'

const providerError: NbaApiError = {
  code: 'upstream_unavailable',
  message: 'Источник временно недоступен.',
  retryable: true,
  provider: 'dunkapi',
  upstreamStatus: null,
}

describe('ResourceState', () => {
  it('exposes loading state accessibly', () => {
    const wrapper = mount(ResourceState, { props: { status: 'loading' } })

    expect(wrapper.get('.state-card--loading').attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toContain('Загрузка данных')
  })

  it('renders a typed provider error without leaking transport details', () => {
    const wrapper = mount(ResourceState, {
      props: { status: 'error', title: 'Матчи недоступны', error: providerError },
    })

    expect(wrapper.get('[role="alert"]').text()).toContain('Источник временно недоступен.')
    expect(wrapper.text()).not.toContain('upstreamStatus')
  })

  it('marks stale cached data with provider and fetch time', () => {
    const meta: NbaApiSnapshot<unknown>['meta'] = {
      source: 'dunkapi',
      fetchedAt: '2026-11-17T09:00:00.000Z' as UtcTimestamp,
      providerUpdatedAt: null,
      isStale: true,
      rejectedRecords: 0,
      refreshError: providerError,
    }
    const wrapper = mount(ResourceState, {
      props: { status: 'ready', meta },
      slots: { default: '<div>Проверенная таблица</div>' },
    })

    expect(wrapper.get('[role="status"]').text()).toContain('Данные устарели')
    expect(wrapper.text()).toContain('DunkAPI')
    expect(wrapper.text()).toContain('Последнее обновление не удалось')
    expect(wrapper.text()).toContain('Проверенная таблица')
  })
})
