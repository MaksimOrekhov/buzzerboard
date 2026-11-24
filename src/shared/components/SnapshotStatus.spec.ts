import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { UtcTimestamp } from '@/entities/nba/model'
import type { NbaApiSnapshot } from '@/shared/api/nba/contracts'
import SnapshotStatus from './SnapshotStatus.vue'

const meta: NbaApiSnapshot<unknown>['meta'] = {
  source: 'bbs',
  fetchedAt: '2026-11-23T10:20:00Z' as UtcTimestamp,
  providerUpdatedAt: null,
  isStale: false,
  rejectedRecords: 0,
  refreshError: null,
}

describe('SnapshotStatus', () => {
  it('shows the source and local update context without hiding the details', () => {
    const wrapper = mount(SnapshotStatus, { props: { meta, showSource: true } })
    expect(wrapper.get('[role="status"]').text()).toContain('Big Balls Sports Data')
    expect(wrapper.get('[role="status"]').text()).toContain(
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    )
    expect(wrapper.get('summary').text()).toContain('Подробнее')
    expect(wrapper.classes()).not.toContain('gc-data-status--stale')
  })

  it('distinguishes a stale snapshot and an unsuccessful refetch', async () => {
    const wrapper = mount(SnapshotStatus, {
      props: { meta: { ...meta, isStale: true }, showSource: true },
    })
    expect(wrapper.text()).toContain('Данные устарели')
    expect(wrapper.classes()).toContain('gc-data-status--stale')
    await wrapper.setProps({ meta, refreshFailed: true })
    expect(wrapper.text()).toContain('Обновление не удалось')
    expect(wrapper.classes()).toContain('gc-data-status--stale')
  })
})
