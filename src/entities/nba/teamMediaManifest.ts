import rawManifest from './teamMediaManifest.json'

export interface TeamMediaAsset {
  teamCode: string
  originalUrl: string
  author: string
  license: string
  licenseUrl: string
  sourceUrl: string
  attribution: string
  checkedAt: string
  modifications: string
  publicPath: string
  delivery: 'local-static'
  reviewStatus: 'approved'
  width: number
  height: number
  bytes: number
}

interface TeamMediaManifest {
  schemaVersion: number
  assets: TeamMediaAsset[]
}

const manifest = rawManifest as TeamMediaManifest
export const TEAM_MEDIA_ASSETS: readonly TeamMediaAsset[] = manifest.assets
export const MAX_TEAM_MEDIA_ASSETS = 30
export const MAX_TEAM_MEDIA_BYTES = 2_000_000
export const MAX_TEAM_MEDIA_DIMENSION = 2_000

export function isApprovedTeamMediaAsset(value: unknown): value is TeamMediaAsset {
  if (!isRecord(value)) return false
  const validWebUrl = (candidate: unknown) => {
    if (typeof candidate !== 'string') return false
    try {
      return new URL(candidate).protocol === 'https:'
    } catch {
      return false
    }
  }
  const validDate =
    typeof value.checkedAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.checkedAt) &&
    !Number.isNaN(Date.parse(`${value.checkedAt}T00:00:00.000Z`))

  return (
    value.reviewStatus === 'approved' &&
    value.delivery === 'local-static' &&
    typeof value.teamCode === 'string' &&
    /^[A-Z]{3}$/.test(value.teamCode) &&
    validWebUrl(value.originalUrl) &&
    validWebUrl(value.licenseUrl) &&
    validWebUrl(value.sourceUrl) &&
    nonEmpty(value.author) &&
    nonEmpty(value.license) &&
    nonEmpty(value.attribution) &&
    nonEmpty(value.modifications) &&
    validDate &&
    typeof value.publicPath === 'string' &&
    /^\/media\/[A-Za-z0-9/_-]+\.(avif|webp|png|jpe?g)$/.test(value.publicPath) &&
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
  const seenTeams = new Set<string>()
  const seenPaths = new Set<string>()
  input.assets.forEach((asset, index) => {
    if (!isApprovedTeamMediaAsset(asset)) {
      errors.push(`assets[${index}] is incomplete, unreviewed, remote, or exceeds delivery limits`)
      return
    }
    if (seenTeams.has(asset.teamCode))
      errors.push(`duplicate media entry for team ${asset.teamCode}`)
    if (seenPaths.has(asset.publicPath)) errors.push(`duplicate media path ${asset.publicPath}`)
    seenTeams.add(asset.teamCode)
    seenPaths.add(asset.publicPath)
  })
  return errors
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
