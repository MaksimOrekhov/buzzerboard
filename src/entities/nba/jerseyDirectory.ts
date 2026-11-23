import rawDirectory from './jerseyDirectory.json'
import { findNbaTeam } from './teamCatalog'
import { NBA_TEAM_ENCYCLOPEDIA, getTeamEncyclopediaEntry } from './teamEncyclopedia'
import { eraAt, getTeamHistory } from './teamHistory'
import {
  isReviewedTeamMediaAsset,
  TEAM_MEDIA_ASSETS,
  type TeamMediaAsset,
} from './teamMediaManifest'

export const JERSEY_TYPES = {
  association: 'Association Edition',
  icon: 'Icon Edition',
  statement: 'Statement Edition',
  city: 'City Edition',
  classic: 'Classic Edition',
  specter: 'NBA Specter Edition',
  earned: 'Earned Edition',
  historical: 'Историческая форма',
} as const

export const JERSEY_COLORS = {
  black: { label: 'Чёрный', sample: '#222633' },
  white: { label: 'Белый', sample: '#f4f1e9' },
  cream: { label: 'Кремовый', sample: '#e1cda5' },
  gray: { label: 'Серый', sample: '#939ba7' },
  silver: { label: 'Серебристый', sample: '#b9c2cd' },
  brown: { label: 'Коричневый', sample: '#9b7544' },
  navy: { label: 'Тёмно-синий', sample: '#1f3868' },
  'royal-blue': { label: 'Насыщенный синий', sample: '#3066c5' },
  'light-blue': { label: 'Голубой', sample: '#70bae0' },
  orange: { label: 'Оранжевый', sample: '#ed7934' },
  gold: { label: 'Золотистый', sample: '#ecc258' },
  purple: { label: 'Фиолетовый', sample: '#8560c1' },
  red: { label: 'Красный', sample: '#df4a55' },
  burgundy: { label: 'Бордовый', sample: '#842c4f' },
  rust: { label: 'Ржаво-красный', sample: '#a34d38' },
  teal: { label: 'Бирюзовый', sample: '#28969d' },
  mint: { label: 'Мятный', sample: '#96dbbf' },
  green: { label: 'Зелёный', sample: '#418864' },
  bronze: { label: 'Бронзовый', sample: '#b78c65' },
} as const

export type JerseyType = keyof typeof JERSEY_TYPES
type JerseyColor = keyof typeof JERSEY_COLORS

interface UnverifiedRights {
  status: 'unverified'
}

interface ClearedRights {
  status: 'cleared'
  sourceUrl: string
  checkedAt: string
  artwork: 'cleared'
  trademarks: 'cleared' | 'not-depicted'
  likeness: 'cleared' | 'not-depicted'
}

interface JerseyIdentity {
  canonicalTeamId: string
  jerseyId: string
  season: string
  type: JerseyType
  eraFrom: number
}

export interface VerifiedJersey extends JerseyIdentity {
  status: 'verified'
  name?: string
  palette: JerseyColor[]
  description: string
  sourceUrl: string
  sourceAsOf: string
  designSourceUrl?: string
  announcedOn?: string
  outfitDate?: string
  designRights: UnverifiedRights | ClearedRights
  imageAssetId?: string
}

interface UnknownJersey extends JerseyIdentity {
  status: 'unknown'
  designRights: UnverifiedRights
}

type JerseyRecord = VerifiedJersey | UnknownJersey
type JerseyMediaClaim = Pick<
  VerifiedJersey,
  'jerseyId' | 'canonicalTeamId' | 'imageAssetId' | 'designRights'
>

const CORE_TYPES = ['association', 'icon', 'statement', 'city'] as const
const canonicalTeams = new Set(NBA_TEAM_ENCYCLOPEDIA.map(({ canonicalTeamId }) => canonicalTeamId))

function record(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

function text(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length > 0
}

function isoDate(input: unknown): input is string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return false
  const parsed = new Date(input + 'T00:00:00Z')
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(input + 'T')
}

function seasonYear(input: unknown): number | null {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}$/.test(input)) return null
  const year = Number(input.slice(0, 4))
  return year >= 1946 && input.endsWith(String(year + 1).slice(-2)) ? year : null
}

function httpsUrl(input: unknown): URL | null {
  if (!text(input)) return null
  try {
    const url = new URL(input)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url : null
  } catch {
    return null
  }
}

function officialSource(input: unknown, teamCode: string, year: number): boolean {
  const url = httpsUrl(input)
  if (!url) return false
  if (url.hostname === 'lockervision.nba.com') {
    const team = findNbaTeam(teamCode)
    const slug =
      teamCode === 'LAC' ? 'los-angeles-clippers' : team?.name.toLowerCase().replaceAll(' ', '-')
    const gameId = url.searchParams.get('gameid')
    return (
      url.pathname === '/game-outfit/' + slug &&
      Boolean(gameId && /^002\d{7}$/.test(gameId) && gameId.slice(3, 5) === String(year).slice(-2))
    )
  }
  return (
    (url.hostname === 'www.nba.com' || url.hostname === 'nba.com') &&
    (/^\/(?:[^/]+\/)?news\/[^/]+/.test(url.pathname) ||
      /^\/gamenotes\/[a-z-]+\.pdf$/.test(url.pathname))
  )
}

function clearedRights(input: unknown): input is ClearedRights {
  return (
    record(input) &&
    input.status === 'cleared' &&
    Boolean(httpsUrl(input.sourceUrl)) &&
    isoDate(input.checkedAt) &&
    input.artwork === 'cleared' &&
    (input.trademarks === 'cleared' || input.trademarks === 'not-depicted') &&
    (input.likeness === 'cleared' || input.likeness === 'not-depicted')
  )
}

export function getClearedJerseyMedia(
  jersey: JerseyMediaClaim,
  assets: readonly TeamMediaAsset[] = TEAM_MEDIA_ASSETS,
): TeamMediaAsset | null {
  if (!jersey.imageAssetId || !clearedRights(jersey.designRights)) return null
  const asset = assets.find(({ assetId }) => assetId === jersey.imageAssetId)
  return asset &&
    isReviewedTeamMediaAsset(asset) &&
    asset.category === 'jersey' &&
    asset.jerseyId === jersey.jerseyId &&
    asset.subject.kind === 'team' &&
    asset.subject.id === jersey.canonicalTeamId
    ? asset
    : null
}

export function validateJerseyDirectory(input: unknown): string[] {
  if (!record(input) || !Array.isArray(input.sets)) return ['Expected jersey directory and sets']
  const errors: string[] = []
  const current = seasonYear(input.currentSeason)
  const reviewedAt = input.reviewedAt
  if (input.schemaVersion !== 1 || !current || !isoDate(reviewedAt)) {
    errors.push('Invalid directory version, current season or review date')
  }
  const ids = new Set<string>()
  const represented = new Set<string>()
  const sources = new Set<string>()
  for (const [index, item] of input.sets.entries()) {
    const path = 'sets[' + index + ']'
    if (!record(item) || !text(item.canonicalTeamId) || !canonicalTeams.has(item.canonicalTeamId)) {
      errors.push(path + ': unknown franchise')
      continue
    }
    represented.add(item.canonicalTeamId)
    const code = item.canonicalTeamId.split(':').at(-1)!
    const year = seasonYear(item.season)
    const kind = item.type
    const expectedId = 'nba:jersey:' + code.toLowerCase() + ':' + item.season + ':' + kind
    if (
      !year ||
      (current && year > current) ||
      !text(kind) ||
      !Object.hasOwn(JERSEY_TYPES, kind) ||
      (year < 2017 && kind !== 'historical') ||
      item.jerseyId !== expectedId ||
      ids.has(expectedId)
    ) {
      errors.push(path + ': invalid season, type or duplicate jersey ID')
      continue
    }
    ids.add(expectedId)
    const history = getTeamHistory(code)
    const era = history && eraAt(history, year)
    if (!era || item.eraFrom !== era.from) errors.push(path + ': invalid franchise era')
    if (item.status === 'unknown') {
      if (
        item.imageAssetId !== undefined ||
        item.sourceUrl !== undefined ||
        item.sourceAsOf !== undefined ||
        item.designSourceUrl !== undefined ||
        item.announcedOn !== undefined ||
        item.outfitDate !== undefined ||
        item.palette !== undefined ||
        item.description !== undefined ||
        item.name !== undefined ||
        !record(item.designRights) ||
        item.designRights.status !== 'unverified'
      ) {
        errors.push(path + ': unknown entry claims verified facts or media')
      }
      continue
    }
    if (
      item.status !== 'verified' ||
      !text(item.description) ||
      (item.name !== undefined && !text(item.name)) ||
      !isoDate(item.sourceAsOf) ||
      (isoDate(reviewedAt) && item.sourceAsOf > reviewedAt) ||
      !officialSource(item.sourceUrl, code, year)
    ) {
      errors.push(path + ': verified set requires individual provenance')
    }
    if (text(item.sourceUrl)) {
      if (sources.has(item.sourceUrl)) errors.push(path + ': duplicate outfit source')
      sources.add(item.sourceUrl)
    }
    if (item.designSourceUrl !== undefined && !officialSource(item.designSourceUrl, code, year)) {
      errors.push(path + ': invalid design source')
    }
    if (
      !Array.isArray(item.palette) ||
      item.palette.length > 5 ||
      new Set(item.palette).size !== item.palette.length ||
      item.palette.some((color: unknown) => !text(color) || !Object.hasOwn(JERSEY_COLORS, color))
    ) {
      errors.push(path + ': invalid color samples')
    }
    if (
      item.announcedOn !== undefined &&
      (!isoDate(item.announcedOn) ||
        !isoDate(item.sourceAsOf) ||
        item.announcedOn > item.sourceAsOf ||
        (isoDate(item.outfitDate) && item.announcedOn > item.outfitDate))
    ) {
      errors.push(path + ': invalid announcement date')
    }
    if (
      item.outfitDate !== undefined &&
      (!isoDate(item.outfitDate) ||
        item.outfitDate < year + '-07-01' ||
        item.outfitDate >= year + 1 + '-07-01')
    ) {
      errors.push(path + ': outfit date outside the season')
    }
    if (item.imageAssetId !== undefined) {
      if (
        !getClearedJerseyMedia(item as unknown as VerifiedJersey) ||
        (clearedRights(item.designRights) &&
          isoDate(item.sourceAsOf) &&
          item.designRights.checkedAt > item.sourceAsOf)
      ) {
        errors.push(path + ': image requires file, design, trademark and likeness review')
      }
    } else if (!record(item.designRights) || item.designRights.status !== 'unverified') {
      errors.push(path + ': missing design rights status')
    }
  }
  for (const teamId of canonicalTeams) {
    if (!represented.has(teamId)) errors.push('Missing team ' + teamId)
  }
  return errors
}

export const JERSEY_DATA_AVAILABLE = validateJerseyDirectory(rawDirectory).length === 0
export const JERSEY_CURRENT_SEASON = rawDirectory.currentSeason
export const JERSEY_CHECKED_AT = rawDirectory.reviewedAt
export const NBA_JERSEYS: readonly JerseyRecord[] = JERSEY_DATA_AVAILABLE
  ? (rawDirectory.sets as JerseyRecord[])
  : []

export function getTeamJerseys(code: string): VerifiedJersey[] {
  const teamId = getTeamEncyclopediaEntry(code)?.canonicalTeamId
  return NBA_JERSEYS.filter(
    (set): set is VerifiedJersey => set.canonicalTeamId === teamId && set.status === 'verified',
  )
}

export function getUnverifiedCurrentTypes(sets: readonly VerifiedJersey[]) {
  return CORE_TYPES.filter(
    (type) => !sets.some((set) => set.season === JERSEY_CURRENT_SEASON && set.type === type),
  )
}

export function formatJerseySeason(season: string): string {
  return season.replace('-', '/')
}
