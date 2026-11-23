import { describe, expect, it } from 'vitest'
import raw from './jerseyDirectory.json'
import {
  getClearedJerseyMedia,
  getTeamJerseys,
  getUnverifiedCurrentTypes,
  JERSEY_CURRENT_SEASON,
  validateJerseyDirectory,
  type VerifiedJersey,
} from './jerseyDirectory'
import { NBA_TEAM_ENCYCLOPEDIA } from './teamEncyclopedia'
import { TEAM_MEDIA_ASSETS, type TeamMediaAsset } from './teamMediaManifest'

describe('jersey directory', () => {
  it('covers every active franchise with individual current and archive sources', () => {
    expect(validateJerseyDirectory(raw)).toEqual([])
    expect(NBA_TEAM_ENCYCLOPEDIA).toHaveLength(30)
    for (const team of NBA_TEAM_ENCYCLOPEDIA) {
      const sets = getTeamJerseys(team.canonicalTeamId.split(':').at(-1)!)
      const current = sets.filter(({ season }) => season === JERSEY_CURRENT_SEASON)
      const archive = sets.filter(({ season }) => season !== JERSEY_CURRENT_SEASON)
      expect(current.length, team.canonicalTeamId).toBeGreaterThan(0)
      expect(archive.length, team.canonicalTeamId).toBeGreaterThan(0)
      for (const set of sets) {
        expect(set.canonicalTeamId).toBe(team.canonicalTeamId)
        expect(set.status).toBe('verified')
        expect(set.sourceAsOf).toBe(raw.reviewedAt)
        expect(getClearedJerseyMedia(set)).toBeNull()
        expect(set.description.length).toBeGreaterThan(50)
      }
      for (const missing of getUnverifiedCurrentTypes(sets)) {
        expect(current.map(({ type }) => type)).not.toContain(missing)
      }
    }
    expect(new Set(raw.sets.map(({ sourceUrl }) => sourceUrl)).size).toBe(raw.sets.length)
    expect(new Set(raw.sets.map(({ description }) => description)).size).toBe(raw.sets.length)
    expect(getTeamJerseys('SEA')).toEqual([])
  })

  it('keeps pilot collections and franchise eras tied to the documented season', () => {
    for (const code of ['CHI', 'LAL', 'MIN']) {
      const sets = getTeamJerseys(code)
      expect(sets.filter(({ season }) => season === JERSEY_CURRENT_SEASON).length).toBeGreaterThan(
        1,
      )
      expect(sets.filter(({ season }) => season !== JERSEY_CURRENT_SEASON)).toHaveLength(3)
    }
    expect(getTeamJerseys('LAC').find(({ season }) => season === '2023-24')).toMatchObject({
      eraFrom: 2015,
    })
    expect(getTeamJerseys('LAC').find(({ season }) => season === '2026-27')).toMatchObject({
      eraFrom: 2024,
    })
    expect(getTeamJerseys('SAC').find(({ season }) => season === '2023-24')).toMatchObject({
      canonicalTeamId: 'nba:team:SAC',
      eraFrom: 1985,
    })
  })

  it.each([
    [{ season: '2026-28' }, 'invalid season'],
    [{ type: 'home' }, 'invalid season, type'],
    [{ canonicalTeamId: 'nba:team:SEA' }, 'unknown franchise'],
    [{ jerseyId: 'nba:jersey:atl:2026-27:icon' }, 'invalid season, type'],
    [{ eraFrom: 1949 }, 'invalid franchise era'],
    [{ sourceUrl: 'https://www.nba.com/city-edition-jerseys/2023-24' }, 'individual provenance'],
    [{ sourceUrl: 'https://nba.com.example.org/news/jerseys' }, 'individual provenance'],
    [
      { sourceUrl: 'https://lockervision.nba.com/game-outfit/chicago-bulls?gameid=0022600078' },
      'individual provenance',
    ],
    [
      { sourceUrl: 'https://lockervision.nba.com/game-outfit/atlanta-hawks?gameid=0022500078' },
      'individual provenance',
    ],
    [{ sourceAsOf: '2026-11-24' }, 'individual provenance'],
    [{ announcedOn: '2026-11-31' }, 'invalid announcement date'],
    [{ outfitDate: '2026-02-12' }, 'outfit date outside'],
    [{ palette: ['black', 'black'] }, 'invalid color samples'],
    [{ status: 'unknown' }, 'unknown entry claims verified facts or media'],
    [{ imageAssetId: TEAM_MEDIA_ASSETS[0]!.assetId }, 'image requires file'],
  ])('rejects invalid data %j', (change, detail) => {
    const [first, ...rest] = raw.sets
    expect(validateJerseyDirectory({ ...raw, sets: [{ ...first, ...change }, ...rest] })).toEqual(
      expect.arrayContaining([expect.stringContaining(detail)]),
    )
  })

  it('rejects a duplicate stable ID and an unrepresented franchise', () => {
    const first = raw.sets[0]!
    expect(validateJerseyDirectory({ ...raw, sets: [...raw.sets, first] }).at(-1)).toContain(
      'duplicate jersey ID',
    )
    expect(
      validateJerseyDirectory({
        ...raw,
        sets: raw.sets.filter(({ canonicalTeamId }) => canonicalTeamId !== first.canonicalTeamId),
      }),
    ).toContain('Missing team nba:team:ATL')
  })

  it('exposes media only when a reviewed file is bound to the set and all design rights are clear', () => {
    const jersey = getTeamJerseys('CHI')[0]!
    const asset: TeamMediaAsset = {
      ...TEAM_MEDIA_ASSETS[0]!,
      subject: { kind: 'team', id: jersey.canonicalTeamId },
      category: 'jersey',
      jerseyId: jersey.jerseyId,
    }
    const cleared: VerifiedJersey = {
      ...jersey,
      imageAssetId: asset.assetId,
      designRights: {
        status: 'cleared',
        sourceUrl: 'https://example.org/test-rights',
        checkedAt: jersey.sourceAsOf,
        artwork: 'cleared',
        trademarks: 'cleared',
        likeness: 'not-depicted',
      },
    }
    expect(getClearedJerseyMedia(cleared, [asset])).toBe(asset)
    expect(getClearedJerseyMedia(cleared)).toBeNull()
    expect(
      getClearedJerseyMedia(cleared, [{ ...asset, jerseyId: 'nba:jersey:chi:2025-26:city' }]),
    ).toBeNull()
    expect(
      getClearedJerseyMedia(cleared, [{ ...asset, subject: { kind: 'team', id: 'nba:team:LAL' } }]),
    ).toBeNull()
    expect(
      getClearedJerseyMedia({ ...cleared, designRights: jersey.designRights }, [asset]),
    ).toBeNull()
  })
})
