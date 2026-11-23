import { describe, expect, it } from 'vitest'
import rawManifest from './teamMediaManifest.json'
import {
  getCityMediaForTeam,
  getPersonMedia,
  getTeamMedia,
  isReviewedTeamMediaAsset,
  supportedLicenseUrl,
  validateTeamMediaManifest,
} from './teamMediaManifest'

function copyManifest(): typeof rawManifest {
  return structuredClone(rawManifest)
}

describe('team media manifest rights and subject checks', () => {
  it('accepts reviewed files and exact Commons license URLs', () => {
    expect(validateTeamMediaManifest(rawManifest)).toEqual([])
    for (const asset of rawManifest.assets) {
      expect(isReviewedTeamMediaAsset(asset)).toBe(true)
      expect(supportedLicenseUrl(asset.license)).toBe(asset.licenseUrl)
      expect(asset.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('connects one reviewed city image to each pilot team through canonical city subjects', () => {
    expect(getCityMediaForTeam(' chi ')?.assetId).toBe('commons:file:full-chicago-skyline')
    expect(getCityMediaForTeam('LAL')?.assetId).toBe('commons:file:losangeles-skyline')
    expect(getCityMediaForTeam('MIN')?.assetId).toBe(
      'commons:file:minneapolis-skyline-looking-south',
    )
    expect(getCityMediaForTeam('BOS')).toBeNull()
  })

  it('matches archival arenas to the pilot franchise and leaves other galleries empty', () => {
    expect(getTeamMedia('CHI').map(({ subject }) => subject.id)).toContain(
      'nba:arena:united-center',
    )
    expect(getTeamMedia('LAL').map(({ subject }) => subject.id)).toContain(
      'nba:arena:inglewood-forum',
    )
    expect(getTeamMedia('MIN').map(({ subject }) => subject.id)).toContain('nba:arena:metrodome')
    expect(getTeamMedia('LAC')).toEqual([])
    expect(getTeamMedia('unknown')).toEqual([])
  })

  it('resolves portraits by a known NBA person ID', () => {
    const [portrait] = getPersonMedia('nba:person:tiago-splitter')
    expect(portrait?.subject.kind).toBe('person')
    expect(getTeamMedia('CHI')).not.toContain(portrait)
    expect(getPersonMedia('nba:person:not-registered')).toEqual([])
    expect(
      isReviewedTeamMediaAsset({
        ...portrait,
        subject: { kind: 'person', id: 'nba:person:not-registered' },
      }),
    ).toBe(false)
  })

  it('allows multiple assets for the same canonical subject', () => {
    const manifest = copyManifest()
    const secondImage = {
      ...manifest.assets[0]!,
      assetId: 'commons:file:second-chicago-skyline',
      publicPath: '/media/encyclopedia/cities/chicago-skyline-alt.jpg',
    }
    manifest.assets.push(secondImage)

    expect(validateTeamMediaManifest(manifest)).toEqual([])
  })

  it('rejects duplicate stable asset IDs and local paths', () => {
    const duplicateId = copyManifest()
    duplicateId.assets.push({
      ...duplicateId.assets[1]!,
      publicPath: '/media/encyclopedia/cities/other-la.jpg',
    })
    expect(validateTeamMediaManifest(duplicateId)).toContain(
      `duplicate media asset ID ${duplicateId.assets[1]!.assetId}`,
    )

    const duplicatePath = copyManifest()
    duplicatePath.assets.push({
      ...duplicatePath.assets[1]!,
      assetId: 'commons:file:another-la-skyline',
    })
    expect(validateTeamMediaManifest(duplicatePath)).toContain(
      `duplicate media path ${duplicatePath.assets[1]!.publicPath}`,
    )
  })

  it('rejects unknown subjects, unsupported or mismatched licenses, and restricted media', () => {
    const invalidAssets = [
      { ...rawManifest.assets[0], subject: { kind: 'city', id: 'nba:city:unknown' } },
      { ...rawManifest.assets[0], license: 'All rights reserved' },
      { ...rawManifest.assets[0], license: 'CC BY-ND 4.0' },
      { ...rawManifest.assets[0], licenseUrl: 'https://example.com/license' },
      { ...rawManifest.assets[0], fileName: 'A different file.jpg' },
      {
        ...rawManifest.assets[0],
        rightsReview: {
          ...rawManifest.assets[0]!.rightsReview,
          nonCopyrightRestrictionsReviewed: false,
        },
      },
      { ...rawManifest.assets[0], originalUrl: 'javascript:alert(1)' },
      { ...rawManifest.assets[0], delivery: 'remote-url' },
    ]
    for (const asset of invalidAssets) expect(isReviewedTeamMediaAsset(asset)).toBe(false)
  })

  it('rejects missing attribution context and out-of-policy image dimensions or size', () => {
    const invalidAssets = [
      { ...rawManifest.assets[0], author: '' },
      { ...rawManifest.assets[0], alt: '' },
      { ...rawManifest.assets[0], rightsReview: undefined },
      { ...rawManifest.assets[0], publicPath: '/media/../outside.jpg' },
      { ...rawManifest.assets[0], bytes: 2_000_001 },
      { ...rawManifest.assets[0], width: 2_001 },
      { ...rawManifest.assets[0], height: 2_001 },
    ]
    for (const asset of invalidAssets) expect(isReviewedTeamMediaAsset(asset)).toBe(false)
  })
})
