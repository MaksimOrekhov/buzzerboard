import { describe, expect, it } from 'vitest'
import { getArena } from './arenaDirectory'
import {
  CITIES,
  CITY_FRANCHISE_COUNT,
  CITY_MUNICIPALITY_COUNT,
  buildCityDirectory,
  cityMapUrl,
  getCity,
  getTeamCity,
} from './cityDirectory'
import { validGeoPoint } from './gameGeography'
import { NBA_TEAM_ENCYCLOPEDIA } from './teamEncyclopedia'

describe('City Guide sources and boundaries', () => {
  it('reuses stable encyclopedia keys and canonical arena assignments across the league', () => {
    expect(CITY_FRANCHISE_COUNT).toBe(30)
    expect(CITIES).toHaveLength(30)
    expect(CITY_MUNICIPALITY_COUNT).toBe(29)
    expect(new Set(CITIES.map((city) => city.slug)).size).toBe(CITIES.length)
    for (const entry of NBA_TEAM_ENCYCLOPEDIA) {
      const city = getTeamCity(entry.code)!
      expect(city.id).toBe(entry.cityId)
      expect(getCity(city.slug)).toBe(city)
      expect(city.assignments.find(({ team }) => team.code === entry.code)?.arena).toBe(
        getArena(entry.arenaId),
      )
      expect(city.name && city.nameEn && city.region && city.countryName).toBeTruthy()
      expect(city.description.value.length).toBeGreaterThan(75)
    }
    const chicago = NBA_TEAM_ENCYCLOPEDIA.find(({ code }) => code === 'CHI')!
    const boston = NBA_TEAM_ENCYCLOPEDIA.find(({ code }) => code === 'BOS')!
    const shared = buildCityDirectory([chicago, { ...boston, cityId: chicago.cityId }])
    expect(shared).toHaveLength(1)
    expect(shared[0]?.assignments.map(({ team }) => team.code)).toEqual(['CHI', 'BOS'])
  })

  it('keeps the NBA brand, home municipality and statistical boundary separate', () => {
    const brooklyn = getTeamCity('BKN')!
    const newYork = getTeamCity('NYK')!
    expect(brooklyn.boroughOf).toBe(newYork.id)
    expect(brooklyn.kind).toBe('borough')
    expect(brooklyn.censusId).toBe('36047')
    expect(newYork.censusId).toBe('3651000')
    expect(newYork.assignments[0]?.arenaLocality?.value.name).toBe('Манхэттен')
    expect(brooklyn.population?.value).toBeLessThan(newYork.population!.value)
    const inglewood = getTeamCity('LAC')!
    const la = getTeamCity('LAL')!
    expect(inglewood.id).not.toBe(la.id)
    expect(inglewood.boroughOf).toBeUndefined()
    expect(inglewood.assignments[0]?.brandArea?.value.relatedCityId).toBe(la.id)
    expect(inglewood.assignments[0]?.arena.slug).toBe('intuit-dome')
    expect(getTeamCity('GSW')?.nameEn).toBe('San Francisco')
    expect(getTeamCity('GSW')?.assignments[0]?.brandArea?.value.kind).toBe('регион')
    expect(getTeamCity('MIN')?.nameEn).toBe('Minneapolis')
    expect(getTeamCity('MIN')?.assignments[0]?.brandArea?.value.name).toBe('Миннесота')
    expect(getTeamCity('IND')?.kind).toBe('consolidated-balance')
    expect(getTeamCity('WAS')?.kind).toBe('federal-district')
    expect(getTeamCity('TOR')).toMatchObject({
      country: 'CA',
      regionEn: 'Ontario',
      censusId: '3520005',
      timeZone: { value: 'America/Toronto' },
      population: { value: 2794356, asOf: '2021-05-11' },
      landArea: { value: 631.1 },
    })
  })

  it('has valid dates, source URLs, IANA zones, point ranges and audited photos', () => {
    for (const city of CITIES) {
      for (const fact of [
        city.description,
        city.identity,
        city.geography,
        city.established,
        city.center,
        city.timeZone,
        city.timeRules,
        city.population,
        city.landArea,
      ]) {
        if (!fact) continue
        expect(new URL(fact.sourceUrl).protocol).toBe('https:')
        expect(new Date(fact.asOf).toISOString().slice(0, 10)).toBe(fact.asOf)
      }
      expect(
        new Intl.DateTimeFormat('ru', { timeZone: city.timeZone.value }).format(0),
      ).toBeTruthy()
      expect(city.center && validGeoPoint(city.center.value)).toBe(true)
      expect(city.center?.value.lat).toBeGreaterThan(25)
      expect(city.center?.value.lat).toBeLessThan(47)
      expect(city.center?.value.lon).toBeLessThan(-70)
      expect(city.center?.value.lon).toBeGreaterThan(-124)
      expect(city.population?.value).toBeGreaterThan(0)
      expect(Number.isInteger(city.population?.value)).toBe(true)
      expect(city.landArea?.value).toBeGreaterThan(0)
      expect(city.photo ? city.photo.subject.id === city.id : true).toBe(true)
    }
    expect(CITIES.filter(({ photo }) => photo)).toHaveLength(7)
    expect(CITIES.filter(({ established }) => established)).toHaveLength(8)
    const chicago = getTeamCity('CHI')!
    expect(new URL(cityMapUrl(chicago)).searchParams.get('mlat')).toBe(
      String(chicago.center!.value.lat),
    )
    expect(new URL(cityMapUrl({ ...chicago, center: null })).searchParams.get('query')).toBe(
      'Chicago, Illinois, United States',
    )
  })
})
