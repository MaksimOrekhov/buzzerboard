import { describe, expect, it } from 'vitest'
import { getTeamJerseys, JERSEY_CURRENT_SEASON } from '@/entities/nba/jerseyDirectory'
import { filterJerseys, withoutJerseyFilters, type JerseyFilters } from './catalog'

const filterBulls = (filters: JerseyFilters) =>
  filterJerseys(getTeamJerseys('CHI'), filters, JERSEY_CURRENT_SEASON)
const current: JerseyFilters = { view: 'current', season: '2026-27', type: 'all', order: 'newest' }
const archive: JerseyFilters = { ...current, view: 'archive', season: 'all' }

describe('jersey filters', () => {
  it('separates current editions from timeline entries and orders the archive by season', () => {
    expect(filterBulls(current).map(({ type }) => type)).toEqual(['city', 'statement'])
    expect(filterBulls(archive).map(({ season }) => season)).toEqual([
      '2025-26',
      '2023-24',
      '2022-23',
    ])
    expect(filterBulls({ ...archive, order: 'oldest' }).map(({ season }) => season)).toEqual([
      '2022-23',
      '2023-24',
      '2025-26',
    ])
  })

  it('matches season and type in the active collection and yields an empty mismatch', () => {
    expect(filterBulls({ ...archive, season: '2023-24', type: 'city' })).toHaveLength(1)
    expect(filterBulls({ ...archive, season: '2023-24', type: 'statement' })).toEqual([])
    expect(filterBulls({ ...archive, season: '2026-27' })).toEqual([])
  })

  it('only removes filters belonging to the jersey tab', () => {
    const query = {
      tab: 'jerseys',
      jerseyView: 'archive',
      jerseySeason: '2023-24',
      jerseyType: 'city',
      jerseyOrder: 'oldest',
      from: 'standings',
    }
    expect(withoutJerseyFilters(query)).toEqual({ tab: 'jerseys', from: 'standings' })
    expect(query.jerseySeason).toBe('2023-24')
  })
})
