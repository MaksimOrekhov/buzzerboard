import { describe, expect, it } from 'vitest'
import {
  arenaMapUrl,
  arenaPath,
  ARENAS,
  buildArenaDirectory,
  getArena,
  getTeamArena,
} from './arenaDirectory'
import { NBA_TEAMS } from './teamCatalog'
import { NBA_TEAM_ENCYCLOPEDIA } from './teamEncyclopedia'
import { getTeamHistory } from './teamHistory'
import { getArenaMedia, isReviewedTeamMediaAsset } from './teamMediaManifest'
import { filterArenas } from '@/features/arenas/catalog'

describe('Arena Guide', () => {
  it('maps each active team once using canonical building and city identities', () => {
    const assignments = ARENAS.flatMap((arena) => arena.assignments)
    expect(ARENAS).toHaveLength(30)
    expect(new Set(ARENAS.map(({ id }) => id)).size).toBe(30)
    expect(new Set(ARENAS.map(({ address }) => address?.value)).size).toBe(30)
    expect(assignments.map(({ team }) => team.code).sort()).toEqual(
      NBA_TEAMS.map(({ code }) => code).sort(),
    )
    for (const identity of NBA_TEAM_ENCYCLOPEDIA) {
      const arena = getTeamArena(identity.code)!
      expect(arena.id).toBe(identity.arenaId)
      expect(arena.name).toBe(identity.arena.value)
      expect(arena.cityId).toBe(identity.cityId)
      expect(arena.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(getArena(arena.slug)).toBe(arena)
      expect(arenaPath(arena).params.arenaId).toBe(arena.slug)
    }
    for (const { sourceUrl, validFrom, asOf, seasonEndYear } of assignments) {
      expect(new URL(sourceUrl).protocol).toBe('https:')
      expect(validFrom).toBe('2026-10-20')
      expect(asOf >= validFrom && asOf <= '2026-11-23').toBe(true)
      expect(seasonEndYear).toBe(2027)
    }
  })

  it('groups shared venues and distinguishes historical and temporary home use', () => {
    const lakers = NBA_TEAM_ENCYCLOPEDIA.find(({ code }) => code === 'LAL')!
    const clippers = NBA_TEAM_ENCYCLOPEDIA.find(({ code }) => code === 'LAC')!
    const shared = buildArenaDirectory([
      lakers,
      {
        ...clippers,
        arenaId: lakers.arenaId,
        arena: lakers.arena,
        city: lakers.city,
        cityId: lakers.cityId,
      },
    ])
    expect(shared).toHaveLength(1)
    expect(shared[0]?.assignments.map(({ team }) => team.code)).toEqual(['LAL', 'LAC'])
    const oldHome = getTeamHistory('LAC')?.arenas.find(({ until }) => until === 2024)
    expect(getArena(oldHome!.arenaId)).toBe(getTeamArena('LAL'))
    expect(getTeamArena('LAC')?.slug).toBe('intuit-dome')
    expect(getTeamArena('LAL')?.formerNames[0]).toMatchObject({
      name: 'Staples Center',
      from: '1999-10-17',
      until: '2021-12-25',
    })
    expect(getTeamArena('SAS')?.alternateHome).toMatchObject({
      name: 'Moody Center',
      dates: ['2026-10-23', '2027-02-26', '2027-02-28'],
    })
    expect(getArena('moody-center')).toBeUndefined()
  })

  it('records NBA seating, sourced dates, optional fields and valid map URLs', () => {
    for (const venue of ARENAS) {
      expect(venue.address?.value).toBeTruthy()
      expect(new URL(venue.address!.sourceUrl).protocol).toBe('https:')
      const seating = venue.basketballCapacity!
      expect(
        Number.isSafeInteger(seating.value) && seating.value > 0 && seating.value < 30_000,
      ).toBe(true)
      expect(seating.asOf).toBe('2026-10-28')
      expect(venue.opened?.value ?? 2000).toBeGreaterThan(1900)
      if (venue.construction) {
        expect(venue.construction.value.amount).toBeGreaterThan(0)
        expect(venue.construction.value.priceYear).toBe(venue.opened?.value)
        expect(['USD', 'CAD']).toContain(venue.construction.value.currency)
      }
      const map = new URL(arenaMapUrl(venue))
      expect(map.hostname).toBe('www.openstreetmap.org')
      if (venue.coordinates) {
        const { lat, lon } = venue.coordinates.value
        expect(Math.abs(lat)).toBeLessThanOrEqual(90)
        expect(Math.abs(lon)).toBeLessThanOrEqual(180)
        expect(Number(map.searchParams.get('mlat'))).toBe(lat)
        expect(Number(map.searchParams.get('mlon'))).toBe(lon)
        expect(venue.coordinates.sourceUrl).toContain(venue.wikidataQid)
        expect(venue.assignments[0]?.wikidataVenue?.sourceUrl).toMatch(/#P115$/)
      } else {
        expect(map.pathname).toBe('/search')
        expect(map.searchParams.get('query')).toBe(venue.address?.value)
      }
    }
    expect(getTeamArena('CHI')?.construction).toBeNull()
  })

  it('filters by team, city and attributes and places unknown sort values at the end', () => {
    const initial = {
      search: '',
      conference: 'all',
      city: 'all',
      attribute: 'all',
      sort: 'name',
    } as const
    expect(
      filterArenas(ARENAS, { ...initial, search: 'Brooklyn Nets' }).map(({ slug }) => slug),
    ).toEqual(['barclays-center'])
    expect(
      filterArenas(ARENAS, { ...initial, search: 'Staples Center' }).map(({ slug }) => slug),
    ).toEqual(['crypto-com-arena'])
    expect(
      filterArenas(ARENAS, { ...initial, conference: 'west', attribute: 'coordinates' }).map(
        ({ slug }) => slug,
      ),
    ).toEqual(['crypto-com-arena', 'target-center'])
    expect(filterArenas(ARENAS, { ...initial, city: getTeamArena('CHI')!.cityId })).toEqual([
      getTeamArena('CHI'),
    ])
    const known = getTeamArena('CHI')!
    const unknown = { ...getTeamArena('LAL')!, basketballCapacity: null, opened: null }
    for (const sort of ['opening', 'capacity'] as const) {
      expect(filterArenas([unknown, known], { ...initial, sort })).toEqual([known, unknown])
    }
    expect(filterArenas(ARENAS, { ...initial, sort: 'capacity' })[0]?.slug).toBe('united-center')
  })

  it('uses only locally reviewed media for the matching building', () => {
    for (const code of ['CHI', 'LAL', 'MIN']) {
      const venue = getTeamArena(code)!
      const photos = getArenaMedia(venue.id)
      expect(photos).toHaveLength(2)
      expect(photos.every(isReviewedTeamMediaAsset)).toBe(true)
      expect(
        photos.every(
          ({ subject, publicPath }) =>
            subject.id === venue.id && publicPath.startsWith('/media/encyclopedia/arenas/'),
        ),
      ).toBe(true)
    }
    expect(getArenaMedia(getTeamArena('BOS')!.id)).toEqual([])
  })
})
