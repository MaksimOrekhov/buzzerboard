import { describe, expect, it } from 'vitest'
import { isApprovedTeamMediaAsset, validateTeamMediaManifest } from './teamMediaManifest'

const approvedAsset = {
  teamCode: 'CHI',
  originalUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
  author: 'Example author',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
  attribution: 'Example author, CC BY-SA 4.0, via Wikimedia Commons',
  checkedAt: '2026-11-19',
  modifications: 'resized and converted to WebP',
  publicPath: '/media/nba/chi-arena.webp',
  delivery: 'local-static',
  reviewStatus: 'approved',
  width: 1200,
  height: 800,
  bytes: 180_000,
} as const

describe('team media manifest rights and delivery checks', () => {
  it('accepts a complete reviewed local image with attribution', () => {
    expect(isApprovedTeamMediaAsset(approvedAsset)).toBe(true)
    expect(validateTeamMediaManifest({ schemaVersion: 1, assets: [approvedAsset] })).toEqual([])
  })

  it('rejects missing author, license, attribution, review, and source metadata', () => {
    const missingFields = {
      ...approvedAsset,
      author: '',
      license: '',
      attribution: '',
      sourceUrl: '',
    }
    expect(isApprovedTeamMediaAsset(missingFields)).toBe(false)
    expect(validateTeamMediaManifest({ schemaVersion: 1, assets: [missingFields] })).toHaveLength(1)
  })

  it('rejects remote hotlinks, unreviewed files, traversal paths, and oversized assets', () => {
    const unsafeAssets = [
      { ...approvedAsset, delivery: 'remote-url' },
      { ...approvedAsset, reviewStatus: 'pending' },
      { ...approvedAsset, publicPath: '/media/../private/photo.jpg' },
      { ...approvedAsset, bytes: 2_000_001 },
      { ...approvedAsset, originalUrl: 'javascript:alert(1)' },
    ]
    for (const asset of unsafeAssets) expect(isApprovedTeamMediaAsset(asset)).toBe(false)
  })

  it('rejects a manifest with more than the configured image cap', () => {
    expect(
      validateTeamMediaManifest({ schemaVersion: 1, assets: Array(31).fill(approvedAsset) }),
    ).toEqual(['assets must contain at most 30 entries'])
  })

  it('rejects duplicate team entries and duplicate static paths', () => {
    const otherTeam = { ...approvedAsset, teamCode: 'LAL' }
    expect(
      validateTeamMediaManifest({ schemaVersion: 1, assets: [approvedAsset, otherTeam] }),
    ).toContain(`duplicate media path ${approvedAsset.publicPath}`)
    expect(
      validateTeamMediaManifest({ schemaVersion: 1, assets: [approvedAsset, approvedAsset] }),
    ).toContain('duplicate media entry for team CHI')
  })
})
