import { describe, expect, it } from 'vitest'
import type { Game } from '@/entities/nba/model'
import fixture from '../../../scripts/fixtures/nba-hub.synthetic.json'
import { homeGameRows } from './homeGames'
import {
  getDateKeyInTimeZone,
  getDefaultNbaGameDate,
  selectableNbaGameDate,
} from '@/shared/utils/nbaDate'

const games = fixture.days['2026-11-24'].data as Game[]
const [first, saved] = games as [Game, Game, ...Game[]]
const statusOf = ({ status }: Game) => (status === 'live' ? 'unknown' : status)
const ids = new Set([first.homeTeam.id])
const favorites = new Set([saved.id])

describe('NBA Hub game preview', () => {
  it('starts with the league and caps the preview at five scheduled start times', () => {
    const shuffled = [...games].reverse()
    expect(homeGameRows(shuffled, ids, favorites, false, 'all', statusOf)).toEqual(
      games.slice(0, 5),
    )
    expect(shuffled).toEqual([...games].reverse())
  })
  it('matches only explicit favorite team/game IDs before limiting the rows', () => {
    expect(homeGameRows(games, ids, favorites, true, 'all', statusOf)).toEqual([first, saved])
    expect(homeGameRows(games, new Set(), new Set(), true, 'all', statusOf)).toEqual([])
    expect(
      homeGameRows(games, ids, favorites, false, 'postponed', statusOf).map(({ status }) => status),
    ).toEqual(['postponed'])
  })
})

describe('NBA Hub date range', () => {
  it('rejects invalid calendar, range and multiple query values', () => {
    const select = (value: unknown) => selectableNbaGameDate(value, '2026-10-25', '2026-12-01')
    expect(select('2026-11-30')).toBe('2026-11-30')
    for (const invalid of ['2026-11-31', '2026-12-02', '2026-10-24', '2026-11-4', ['2026-11-24']])
      expect(select(invalid)).toBeNull()
  })
  it('assigns the NBA date independently of Cyprus across US and Cyprus DST boundaries', () => {
    const instants = [
      ['2026-03-08T04:59:00Z', '2026-03-07', '2026-03-08'],
      ['2026-03-08T05:00:00Z', '2026-03-08', '2026-03-08'],
      ['2026-03-29T03:59:00Z', '2026-03-28', '2026-03-29'],
      ['2026-03-29T04:00:00Z', '2026-03-29', '2026-03-29'],
      ['2026-11-02T04:59:00Z', '2026-11-01', '2026-11-02'],
      ['2026-11-02T05:00:00Z', '2026-11-02', '2026-11-02'],
    ] as const
    for (const [timestamp, nba, cyprus] of instants) {
      const instant = new Date(timestamp)
      expect(getDefaultNbaGameDate(instant)).toBe(nba)
      expect(getDateKeyInTimeZone(instant, 'Asia/Nicosia')).toBe(cyprus)
    }
  })
})
