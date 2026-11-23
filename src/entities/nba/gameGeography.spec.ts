import { describe, expect, it } from 'vitest'
import { NBA_TIME_ZONE, getDateKeyInTimeZone } from '@/shared/utils/nbaDate'
import { formatCityTime } from './cityDirectory'
import { getGameGeography, straightLineKm } from './gameGeography'
import type { Game, NbaGameDate } from './model'
import { findNbaTeam } from './teamCatalog'

function match(
  away: string,
  home: string,
  venue: string | null = null,
  date = '2026-11-23',
): Pick<Game, 'homeTeam' | 'awayTeam' | 'venue' | 'nbaGameDate'> {
  return {
    awayTeam: findNbaTeam(away)!.team,
    homeTeam: findNbaTeam(home)!.team,
    venue,
    nbaGameDate: date as NbaGameDate,
  }
}

describe('game geography', () => {
  it('computes symmetric Haversine distances and rejects missing or invalid points', () => {
    const start = { lat: 0, lon: 0 }
    const end = { lat: 0, lon: 1 }
    expect(straightLineKm(start, start)).toBe(0)
    expect(straightLineKm(start, end)).toBeCloseTo(111.195, 3)
    expect(straightLineKm(start, end)).toBe(straightLineKm(end, start))
    expect(straightLineKm({ lat: 0, lon: 179 }, { lat: 0, lon: -179 })).toBeCloseTo(222.39, 2)
    expect(straightLineKm(start, { lat: 0, lon: 180 })).toBeCloseTo(20015.114, 2)
    expect(straightLineKm(start)).toBeNull()
    for (const point of [
      { lat: 91, lon: 0 },
      { lat: 0, lon: -181 },
      { lat: NaN, lon: 2 },
      { lat: 4, lon: Infinity },
    ])
      expect(straightLineKm(start, point)).toBeNull()
  })

  it('uses verified city-centre points and maps both New York teams to the same municipality', () => {
    const result = getGameGeography(match('CHI', 'LAL'))
    expect(result.venue).toBeNull()
    expect(result.distance).toBeCloseTo(2802, 0)
    expect(getGameGeography(match('LAL', 'CHI')).distance).toBe(result.distance)
    expect(getGameGeography(match('BKN', 'NYK'))).toMatchObject({
      away: { name: 'Бруклин' },
      from: { name: 'Нью-Йорк' },
      to: { name: 'Нью-Йорк' },
      distance: 0,
    })
    expect(getGameGeography(match('LAC', 'LAL')).distance).toBeGreaterThan(10)
  })

  it('uses an explicit venue from the game, including another municipality', () => {
    expect(getGameGeography(match('CHI', 'TOR', '  Scotiabank   Arena  ')).venue).toMatchObject({
      cityName: 'Торонто',
      timeZone: 'America/Toronto',
    })
    expect(getGameGeography(match('MIN', 'SAS', 'Moody Center'))).toMatchObject({
      venue: { cityName: 'Остин, Техас', timeZone: 'America/Chicago' },
      home: { name: 'Сан-Антонио' },
      distance: null,
      offHomeCourt: true,
    })
    expect(getGameGeography(match('CHI', 'LAL', 'United Center'))).toMatchObject({
      venue: { cityName: 'Чикаго' },
      distance: null,
      offHomeCourt: true,
    })
    expect(getGameGeography(match('LAL', 'LAC', 'Intuit Dome'))).toMatchObject({
      venue: { cityName: 'Инглвуд' },
      offHomeCourt: false,
    })
  })

  it('falls back for neutral, unknown, and historical records without reassigning them to a home arena', () => {
    const game = match('CHI', 'LAL')
    expect(getGameGeography({ ...game, venue: 'Neutral site' })).toMatchObject({
      neutral: true,
      venue: null,
      distance: null,
    })
    expect(getGameGeography({ ...game, venue: 'Crypto Arena annex' })).toMatchObject({
      unknownVenue: true,
      venue: null,
      distance: null,
    })
    expect(
      getGameGeography({
        ...game,
        awayTeam: { ...game.awayTeam, id: 'bbs:team:unknown' as Game['awayTeam']['id'] },
      }),
    ).toMatchObject({
      away: undefined,
      venue: null,
      distance: null,
    })
    expect(getGameGeography(match('BOS', 'GSW', null, '2018-11-23'))).toMatchObject({
      home: { name: 'Сан-Франциско' },
      currentHomes: false,
      venue: null,
      distance: null,
    })
    expect(getGameGeography(match('BOS', 'GSW', 'Chase Center', '2018-11-23')).venue).toBeNull()
    expect(getGameGeography(match('LAC', 'LAL', 'Staples Center', '2020-11-23'))).toMatchObject({
      venue: { cityName: 'Лос-Анджелес' },
      currentHomes: false,
      distance: null,
    })
  })

  it('keeps NBA date, local dates and DST offsets distinct', () => {
    const start = new Date('2026-11-23T05:30:00Z')
    expect(getDateKeyInTimeZone(start, NBA_TIME_ZONE)).toBe('2026-11-23')
    expect(getDateKeyInTimeZone(start, 'America/Los_Angeles')).toBe('2026-11-22')
    expect(getDateKeyInTimeZone(start, 'Asia/Nicosia')).toBe('2026-11-23')
    expect(formatCityTime(start, 'America/Los_Angeles')).toContain('21:30')
    for (const zone of ['America/Toronto', 'America/New_York']) {
      expect(formatCityTime(new Date('2026-03-08T06:59:00Z'), zone)).toContain('01:59')
      expect(formatCityTime(new Date('2026-03-08T07:00:00Z'), zone)).toContain('03:00')
      const first = formatCityTime(new Date('2026-11-01T05:30:00Z'), zone)
      const second = formatCityTime(new Date('2026-11-01T06:30:00Z'), zone)
      expect(first).toMatch(/01:30.*[-−]4/)
      expect(second).toMatch(/01:30.*[-−]5/)
    }
    for (const instant of ['2026-01-15T12:00:00Z', '2026-07-15T12:00:00Z'])
      expect(formatCityTime(new Date(instant), 'America/Phoenix')).toMatch(/05:00.*[-−]7/)
  })
})
