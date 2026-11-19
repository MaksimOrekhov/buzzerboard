import rawManifest from './teamMediaManifest.json'
import { getTeamHistory, NBA_TEAM_HISTORIES } from './teamHistory'
import { getTeamEncyclopediaEntry, NBA_TEAM_ENCYCLOPEDIA } from './teamEncyclopedia'

export type TeamMediaSubjectKind = 'team' | 'city' | 'arena'

export interface TeamMediaAsset {
  assetId: string
  subject: { kind: TeamMediaSubjectKind; id: string }
  category: string
  fileName: string
  title: string
  description: string
  alt: string
  originalUrl: string
  deliverySourceUrl: string
  author: string
  sourceUrl: string
  license: SupportedMediaLicense
  licenseUrl: string
  capturedAt: string
  checkedAt: string
  modifications: string
  rightsReview: {
    commonsPageReviewed: true
    imageinfoExtmetadataReviewed: true
    nonCopyrightRestrictionsReviewed: true
    notes: string
  }
  publicPath: string
  delivery: 'local-static'
  reviewStatus: 'reviewed'
  width: number
  height: number
  bytes: number
}

type SupportedMediaLicense = keyof typeof SUPPORTED_LICENSES

interface TeamMediaManifest {
  schemaVersion: number
  assets: TeamMediaAsset[]
}

const SUPPORTED_LICENSES = {
  'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/',
  'CC BY 2.5': 'https://creativecommons.org/licenses/by/2.5/',
  'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 2.0': 'https://creativecommons.org/licenses/by-sa/2.0/',
  'CC BY-SA 2.5': 'https://creativecommons.org/licenses/by-sa/2.5/',
  'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
} as const

const manifest = rawManifest as TeamMediaManifest
export const TEAM_MEDIA_ASSETS: readonly TeamMediaAsset[] = manifest.assets
export const MAX_TEAM_MEDIA_ASSETS = 30
export const MAX_TEAM_MEDIA_BYTES = 2_000_000
export const MAX_TEAM_MEDIA_DIMENSION = 2_000

const knownSubjects = new Set<string>()
for (const team of NBA_TEAM_ENCYCLOPEDIA) {
  knownSubjects.add(`team:${team.canonicalTeamId}`)
  knownSubjects.add(`city:${team.cityId}`)
  knownSubjects.add(`arena:${team.arenaId}`)
}

for (const profile of NBA_TEAM_HISTORIES) {
  for (const { arenaId } of profile.arenas) knownSubjects.add(`arena:${arenaId}`)
}

export function isReviewedTeamMediaAsset(value: unknown): value is TeamMediaAsset {
  if (!isRecord(value) || !isRecord(value.subject) || !isRecord(value.rightsReview)) return false
  const license = typeof value.license === 'string' ? value.license : ''
  const expectedLicenseUrl = SUPPORTED_LICENSES[license as SupportedMediaLicense]

  return (
    value.reviewStatus === 'reviewed' &&
    value.delivery === 'local-static' &&
    typeof value.assetId === 'string' &&
    /^commons:file:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.assetId) &&
    typeof value.subject.kind === 'string' &&
    ['team', 'city', 'arena'].includes(value.subject.kind) &&
    typeof value.subject.id === 'string' &&
    knownSubjects.has(`${value.subject.kind}:${value.subject.id}`) &&
    typeof value.category === 'string' &&
    /^[a-z][a-z0-9-]{0,39}$/.test(value.category) &&
    nonEmpty(value.fileName) &&
    nonEmpty(value.title) &&
    nonEmpty(value.description) &&
    nonEmpty(value.alt) &&
    isCommonsUploadUrl(value.originalUrl) &&
    isCommonsUploadUrl(value.deliverySourceUrl) &&
    commonsFileUrlsMatch(value) &&
    nonEmpty(value.author) &&
    isCommonsFilePageUrl(value.sourceUrl) &&
    expectedLicenseUrl !== undefined &&
    value.licenseUrl === expectedLicenseUrl &&
    validDate(value.capturedAt) &&
    value.rightsReview.commonsPageReviewed === true &&
    value.rightsReview.imageinfoExtmetadataReviewed === true &&
    value.rightsReview.nonCopyrightRestrictionsReviewed === true &&
    nonEmpty(value.rightsReview.notes) &&
    validDate(value.checkedAt) &&
    nonEmpty(value.modifications) &&
    typeof value.publicPath === 'string' &&
    /^\/media\/encyclopedia\/[A-Za-z0-9/_-]+\.jpg$/.test(value.publicPath) &&
    !value.publicPath.split('/').includes('..') &&
    positiveInt(value.width) &&
    value.width <= MAX_TEAM_MEDIA_DIMENSION &&
    positiveInt(value.height) &&
    value.height <= MAX_TEAM_MEDIA_DIMENSION &&
    positiveInt(value.bytes) &&
    value.bytes <= MAX_TEAM_MEDIA_BYTES
  )
}

export function validateTeamMediaManifest(input: unknown): string[] {
  if (!isRecord(input)) return ['manifest must be an object']
  if (input.schemaVersion !== 1) return ['schemaVersion must be 1']
  if (!Array.isArray(input.assets)) return ['assets must be an array']
  if (input.assets.length > MAX_TEAM_MEDIA_ASSETS)
    return [`assets must contain at most ${MAX_TEAM_MEDIA_ASSETS} entries`]
  const errors: string[] = []
  const seenAssetIds = new Set<string>()
  const seenPaths = new Set<string>()
  input.assets.forEach((asset, index) => {
    if (!isReviewedTeamMediaAsset(asset)) {
      errors.push(
        `assets[${index}] is unsupported, incomplete, unreviewed, or exceeds delivery limits`,
      )
      return
    }
    if (seenAssetIds.has(asset.assetId)) errors.push(`duplicate media asset ID ${asset.assetId}`)
    if (seenPaths.has(asset.publicPath)) errors.push(`duplicate media path ${asset.publicPath}`)
    seenAssetIds.add(asset.assetId)
    seenPaths.add(asset.publicPath)
  })
  return errors
}

export function supportedLicenseUrl(license: string): string | null {
  return SUPPORTED_LICENSES[license as SupportedMediaLicense] ?? null
}

export function getCityMediaForTeam(teamCode: string): TeamMediaAsset | null {
  const team = NBA_TEAM_ENCYCLOPEDIA.find((entry) => entry.code === teamCode.trim().toUpperCase())
  if (!team) return null
  return (
    TEAM_MEDIA_ASSETS.find(
      (asset) => asset.subject.kind === 'city' && asset.subject.id === team.cityId,
    ) ?? null
  )
}

export function getTeamMedia(teamCode: string): TeamMediaAsset[] {
  const team = getTeamEncyclopediaEntry(teamCode)
  if (!team) return []
  const arenas = new Set(getTeamHistory(teamCode)?.arenas.map(({ arenaId }) => arenaId))
  arenas.add(team.arenaId)
  return TEAM_MEDIA_ASSETS.filter(
    ({ subject }) =>
      (subject.kind === 'team' && subject.id === team.canonicalTeamId) ||
      (subject.kind === 'city' && subject.id === team.cityId) ||
      (subject.kind === 'arena' && arenas.has(subject.id)),
  )
}

function isCommonsFilePageUrl(value: unknown): value is string {
  return (
    isHttpsUrl(value) &&
    new URL(value).hostname === 'commons.wikimedia.org' &&
    new URL(value).pathname.startsWith('/wiki/File:')
  )
}

function isCommonsUploadUrl(value: unknown): value is string {
  if (!isHttpsUrl(value)) return false
  const { hostname, pathname } = new URL(value)
  return (
    (hostname === 'upload.wikimedia.org' || hostname === 'thumb.wikimedia.org') &&
    pathname.startsWith('/wikipedia/commons/')
  )
}

function commonsFileUrlsMatch(value: Record<string, unknown>): boolean {
  if (typeof value.fileName !== 'string' || !isHttpsUrl(value.sourceUrl)) return false
  try {
    const sourceFile = decodeURIComponent(
      new URL(value.sourceUrl).pathname.replace('/wiki/File:', ''),
    ).replaceAll('_', ' ')
    const originalFile = decodeURIComponent(pathFileName(String(value.originalUrl)))
    const deliveryFile = decodeURIComponent(pathFileName(String(value.deliverySourceUrl)))
    const thumbFile = deliveryFile.replace(/^\d+px-/, '')
    return (
      sourceFile === value.fileName &&
      originalFile === value.fileName.replaceAll(' ', '_') &&
      (deliveryFile === originalFile || thumbFile === originalFile)
    )
  } catch {
    return false
  }
}

function pathFileName(value: string): string {
  return new URL(value).pathname.split('/').at(-1) ?? ''
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function positiveInt(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

const manifestErrors = validateTeamMediaManifest(manifest)
if (manifestErrors.length > 0)
  throw new Error(`Invalid team media manifest: ${manifestErrors.join('; ')}`)
