import { describe, expect, it } from 'vitest'
import { CITIES, getTeamCity } from '@/entities/nba/cityDirectory'
import { filterCities, readCityFilters } from './catalog'

describe('City Guide catalog', () => {
  it('searches place, brand, region and franchise in both languages', () => {
    for (const [q, code] of [
      ['Инглвуд Clippers Калифорния', 'LAC'],
      ['Golden State California', 'GSW'],
      ['New York Knicks Manhattan', 'NYK'],
      ['Миннесота Timberwolves', 'MIN'],
      ['Raptors Ontario', 'TOR'],
      ['Washington DC Wizards', 'WAS'],
    ] as const) {
      expect(filterCities(CITIES, readCityFilters({ q }))).toEqual([getTeamCity(code)])
    }
  })

  it('combines URL filters and normalizes unknown values', () => {
    expect(
      filterCities(
        CITIES,
        readCityFilters({ region: 'CA', conference: 'east', attribute: 'photo' }),
      ),
    ).toEqual([getTeamCity('TOR')])
    expect(filterCities(CITIES, readCityFilters({ region: 'CA', conference: 'west' }))).toEqual([])
    expect(
      filterCities(
        CITIES,
        readCityFilters({ region: 'California', attribute: 'without-photo' }),
      ).map(({ nameEn }) => nameEn),
    ).toEqual(['Inglewood', 'Sacramento'])
    expect(readCityFilters({ q: ['Bulls'], conference: 'south', sort: 'unknown' })).toEqual(
      readCityFilters({}),
    )
  })

  it('sorts descending with unavailable fields last', () => {
    const ny = getTeamCity('NYK')!
    const chi = getTeamCity('CHI')!
    const la = getTeamCity('LAL')!
    expect(
      filterCities(
        [{ ...ny, population: null }, chi, la],
        readCityFilters({ sort: 'population' }),
      ).map(({ id }) => id),
    ).toEqual([la.id, chi.id, ny.id])
    expect(
      filterCities([{ ...la, landArea: null }, ny, chi], readCityFilters({ sort: 'land' })).map(
        ({ id }) => id,
      ),
    ).toEqual([ny.id, chi.id, la.id])
  })
})
