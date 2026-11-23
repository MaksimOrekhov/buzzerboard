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

  it('uses geographic reference points and maps both New York teams to the same municipality', () => {
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
    expect(getGameGeography(match('LAC', 'LAL', 'Staples Center', '2020-11-23'))).toMatchObject({
      venue: { cityName: 'Лос-Анджелес' },
      currentHomes: false,
      distance: null,
    })
  })

  it.each([
    ['LAL', 'Staples Center', 'Crypto.com Arena', '2021-12-24', '2021-12-25'],
    ['CLE', 'Rocket Mortgage FieldHouse', 'Rocket Arena', '2025-02-17', '2025-02-18'],
    ['TOR', 'Air Canada Centre', 'Scotiabank Arena', '2018-06-30', '2018-07-01'],
  ])(
    'honors the naming change for %s on the first day of the new name',
    (home, former, current, before, effective) => {
      expect(getGameGeography(match('BOS', home, former, before)).venue).toMatchObject({
        name: former,
        arena: { name: current },
        sourceUrl: expect.stringMatching(/^https:/),
      })
      expect(getGameGeography(match('BOS', home, current, effective)).venue).toMatchObject({
        name: current,
      })
      for (const [name, date] of [
        [current, before],
        [former, effective],
      ] as const) {
        expect(getGameGeography(match('BOS', home, name, date))).toMatchObject({
          venue: null,
          unknownVenue: true,
          distance: null,
        })
      }
    },
  )

  it('uses only whole months after a month-precision start', () => {
    for (const date of ['1999-01-31', '1999-02-01', '1999-02-28']) {
      expect(getGameGeography(match('CHI', 'TOR', 'Air Canada Centre', date))).toMatchObject({
        venue: null,
        unknownVenue: true,
      })
    }
    expect(
      getGameGeography(match('CHI', 'TOR', 'Air Canada Centre', '1999-03-01')).venue?.name,
    ).toBe('Air Canada Centre')
  })

  it.each([
    ['GSW', 'Chase Center', '2019-09-02', '2019-09-06'],
    ['LAC', 'Intuit Dome', '2024-08-14', '2024-08-15'],
    ['PHI', 'Xfinity Mobile Arena', '2025-08-31', '2025-09-01'],
    ['PHX', 'Mortgage Matchup Center', '2025-10-01', '2025-10-02'],
    ['UTA', 'Delta Center', '2023-06-30', '2023-07-01'],
    ['ATL', 'State Farm Arena', '2026-10-27', '2026-10-28'],
  ])('requires a sourced start or dated listing for %s', (home, name, before, confirmed) => {
    expect(getGameGeography(match('BOS', home, name, before))).toMatchObject({
      venue: null,
      unknownVenue: true,
    })
    expect(getGameGeography(match('BOS', home, name, confirmed)).venue?.name).toBe(name)
  })

  it('gates the alternate home in Austin without treating neutral games as home games', () => {
    expect(getGameGeography(match('MIN', 'SAS', 'Moody Center', '2022-04-19'))).toMatchObject({
      venue: null,
      unknownVenue: true,
      distance: null,
    })
    expect(getGameGeography(match('MIN', 'SAS', 'Moody Center', '2022-04-20'))).toMatchObject({
      venue: { name: 'Moody Center' },
      offHomeCourt: true,
      distance: null,
    })
    expect(getGameGeography(match('MIN', 'SAS', 'Moody Center (neutral site)'))).toMatchObject({
      venue: null,
      neutral: true,
      unknownVenue: false,
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
