import { describe, expect, it } from 'vitest'
import rawHistory from './teamHistory.json'
import { NBA_TEAM_ENCYCLOPEDIA } from './teamEncyclopedia'
import {
  eraAt,
  getTeamHistory,
  historyTimeline,
  seasonEndYear,
  TEAM_HISTORY_SOURCES,
  validateTeamHistory,
} from './teamHistory'

describe('NBA franchise history', () => {
  it('covers each catalog identity with sourced founding, title history and real events', () => {
    expect(validateTeamHistory()).toEqual([])
    for (const entry of NBA_TEAM_ENCYCLOPEDIA) {
      const history = getTeamHistory(entry.code)!
      expect(history.canonicalTeamId).toBe(entry.canonicalTeamId)
      expect(history.events.length).toBeGreaterThanOrEqual(3)
      expect(history.titles.seasons).not.toBeNull()
      expect(history.legends.length).toBeGreaterThanOrEqual(1)
      expect(TEAM_HISTORY_SOURCES[history.founded.source]?.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    expect(getTeamHistory('XYZ')).toBeNull()
  })

  it('keeps the shared names and metro areas attached to the correct records', () => {
    const charlotte = getTeamHistory('CHA')!
    const newOrleans = getTeamHistory('NOP')!
    expect(eraAt(charlotte, 2002)).toBeUndefined()
    expect(eraAt(charlotte, 2004)?.name).toBe('Charlotte Bobcats')
    expect(eraAt(newOrleans, 2002)?.name).toBe('New Orleans Hornets')
    expect(eraAt(newOrleans, 2005)?.name).toBe('New Orleans/Oklahoma City Hornets')
    expect(charlotte.franchiseId).not.toBe(newOrleans.franchiseId)
    expect(eraAt(getTeamHistory('LAL')!, 1953)?.name).toBe('Minneapolis Lakers')
    expect(eraAt(getTeamHistory('MIN')!, 1953)).toBeUndefined()
    expect(getTeamHistory('WAS')?.titles.seasons).toEqual([{ season: '1977/78', league: 'NBA' }])
    expect(eraAt(getTeamHistory('OKC')!, 1978)?.name).toBe('Seattle SuperSonics')
  })

  it('keeps NBA, BAA and ABA seasons qualified and distinguishes seasons from calendar years', () => {
    expect(getTeamHistory('LAL')?.titles.seasons).toContainEqual({
      season: '1948/49',
      league: 'BAA',
    })
    expect(getTeamHistory('IND')?.titles.seasons).toEqual([
      { season: '1969/70', league: 'ABA' },
      { season: '1971/72', league: 'ABA' },
      { season: '1972/73', league: 'ABA' },
    ])
    expect(getTeamHistory('NYK')?.titles.seasons).toContainEqual({
      season: '2025/26',
      league: 'NBA',
    })
    expect(getTeamHistory('MIN')?.titles.seasons).toEqual([])
    expect(getTeamHistory('MIN')?.retired?.numbers.map(({ number }) => number)).toEqual(['2'])
    expect(seasonEndYear('1999/00')).toBe(2000)
  })

  it('filters by category and sorts by year without mutating the record', () => {
    const lakers = getTeamHistory('LAL')!
    const titles = historyTimeline(lakers, 'titles', 'desc')
    expect(titles[0]).toMatchObject({ year: 2020, detail: '2019/20 · Los Angeles Lakers' })
    expect(titles.every(({ category }) => category === 'titles')).toBe(true)
    expect(titles.map(({ year }) => year)).toEqual(
      historyTimeline(lakers, 'titles', 'asc')
        .map(({ year }) => year)
        .reverse(),
    )
    expect(historyTimeline(lakers, 'identity', 'asc')).toMatchObject([
      { year: 1947, title: 'Из Детройта в Миннеаполис' },
      { year: 1960, title: 'Los Angeles Lakers' },
    ])
    expect(historyTimeline(lakers, 'arenas', 'asc').map(({ year }) => year)).toEqual([
      1960, 1967, 1999,
    ])
    expect(lakers.titles.seasons?.[0]?.season).toBe('1947/48')
  })

  it('rejects wrong team IDs, inconsistent seasons, overlapping eras and missing citations', () => {
    const modified = structuredClone(rawHistory) as unknown as NonNullable<
      Parameters<typeof validateTeamHistory>[0]
    >
    const profile = modified.profiles.find((entry) => entry.canonicalTeamId === 'nba:team:LAL')!
    profile.canonicalTeamId = 'nba:team:CHI'
    profile.eras[0]!.until = 1961
    profile.events[0]!.source = 'missing'
    profile.titles.seasons![0]!.season = '1947/49'
    expect(validateTeamHistory(modified)).toEqual(
      expect.arrayContaining([
        'nba:team:CHI: invalid team identity',
        'nba:team:CHI: invalid franchise periods',
        'nba:team:CHI: invalid title 1947/49',
        'nba:team:CHI: invalid timeline',
        'missing team histories: nba:team:LAL',
      ]),
    )
  })
})
