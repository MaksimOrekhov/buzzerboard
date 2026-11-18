import type {
  Conference,
  GameId,
  GameStatus,
  NbaGameDate,
  NbaProviderId,
  Player,
  PlayerId,
  ProviderRecordId,
  SeasonEndYear,
  Team,
  TeamId,
  UtcTimestamp,
} from '@/entities/nba/model'
import { getDateKeyInTimeZone, NBA_TIME_ZONE } from '@/shared/utils/nbaDate'

const teamAliases: Readonly<Record<string, string>> = {
  BRK: 'BKN',
  GS: 'GSW',
  GSW: 'GSW',
  NO: 'NOP',
  NOP: 'NOP',
  NY: 'NYK',
  NYK: 'NYK',
  PHO: 'PHX',
  PHX: 'PHX',
  SA: 'SAS',
  SAS: 'SAS',
  UTA: 'UTA',
  UTAH: 'UTA',
  UTH: 'UTA',
  WAS: 'WAS',
  WSH: 'WAS',
}
const nbaTeamCodes = new Set([
  'ATL',
  'BKN',
  'BOS',
  'CHA',
  'CHI',
  'CLE',
  'DAL',
  'DEN',
  'DET',
  'GSW',
  'HOU',
  'IND',
  'LAC',
  'LAL',
  'MEM',
  'MIA',
  'MIL',
  'MIN',
  'NOP',
  'NYK',
  'OKC',
  'ORL',
  'PHI',
  'PHX',
  'POR',
  'SAC',
  'SAS',
  'TOR',
  'UTA',
  'WAS',
])

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function unwrapProviderPayload(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  return isRecord(value.data) ? value.data : value
}

export function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function readIdentifier(value: unknown): ProviderRecordId | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const normalized = String(value).trim()
  return normalized.length > 0 ? (normalized as ProviderRecordId) : null
}

export function readNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function readNonNegativeNumber(value: unknown): number | null {
  const parsed = readNumber(value)
  return parsed !== null && parsed >= 0 ? parsed : null
}

export function parseUtcTimestamp(value: unknown): UtcTimestamp | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)) {
    return null
  }
  const instant = new Date(normalized)
  return Number.isNaN(instant.getTime()) ? null : (instant.toISOString() as UtcTimestamp)
}

export function parseNbaGameDate(value: unknown): NbaGameDate | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? (value as NbaGameDate)
    : null
}

export function nbaGameDateFromUtc(value: UtcTimestamp): NbaGameDate | null {
  const date = getDateKeyInTimeZone(new Date(value), NBA_TIME_ZONE)
  return parseNbaGameDate(date)
}

export function parseSeasonEndYear(value: unknown): SeasonEndYear | null {
  const parsed = readNumber(value)
  return parsed !== null && Number.isInteger(parsed) && parsed >= 1946 && parsed <= 2200
    ? (parsed as SeasonEndYear)
    : null
}

export function normalizeConference(value: unknown): Conference | null {
  const normalized = readString(value)?.toLowerCase()
  if (!normalized) return null
  if (normalized.includes('east')) return 'east'
  if (normalized.includes('west')) return 'west'
  return null
}

export function normalizeGameStatus(...values: unknown[]): GameStatus {
  const statuses = values
    .map(readString)
    .filter((value): value is string => value !== null)
    .map((value) => value.toLowerCase().replaceAll(/[^a-z]+/g, '_'))

  // Preserve the separate ESPN type name, state, and description. In particular,
  // `state: "in"` is meaningful even when the type name is `STATUS_HALFTIME`.
  if (statuses.some((value) => value.includes('cancel'))) return 'canceled'
  if (statuses.some((value) => value.includes('postpon'))) return 'postponed'
  if (statuses.some((value) => value.includes('suspend'))) return 'suspended'
  if (
    statuses.some(
      (value) => value === 'in' || value.includes('live') || value.includes('in_progress'),
    )
  ) {
    return 'live'
  }
  if (
    statuses.some(
      (value) => value.includes('final') || value.includes('complete') || value === 'post',
    )
  ) {
    return 'final'
  }
  if (
    statuses.some(
      (value) => value.includes('scheduled') || value === 'pre' || value.includes('upcoming'),
    )
  ) {
    return 'scheduled'
  }
  return 'unknown'
}

export function createTeam(
  provider: NbaProviderId,
  providerIdValue: unknown,
  abbreviationValue: unknown,
  displayNameValue: unknown,
): Team | null {
  const providerId = readIdentifier(providerIdValue)
  const abbreviation = readString(abbreviationValue)?.toUpperCase() ?? null
  const candidateCode = abbreviation ? (teamAliases[abbreviation] ?? abbreviation) : null
  let canonicalAbbreviation = abbreviation
  let id: TeamId
  if (candidateCode && nbaTeamCodes.has(candidateCode)) {
    canonicalAbbreviation = candidateCode
    id = `nba:team:${candidateCode}` as TeamId
  } else if (providerId) {
    id = `${provider}:team:${providerId}` as TeamId
  } else {
    return null
  }

  return {
    id,
    providerId,
    abbreviation: canonicalAbbreviation,
    displayName: readString(displayNameValue),
  }
}

export function createGameId(provider: NbaProviderId, providerId: ProviderRecordId): GameId {
  return `${provider}:game:${providerId}` as GameId
}

export function createPlayer(
  provider: NbaProviderId,
  providerIdValue: unknown,
  displayNameValue: unknown,
  teamId: TeamId | null = null,
): Player | null {
  const providerId = readIdentifier(providerIdValue)
  if (!providerId) return null

  return {
    id: `${provider}:player:${providerId}` as PlayerId,
    provider,
    providerId,
    displayName: readString(displayNameValue),
    teamId,
  }
}

export function timestampField(
  record: Record<string, unknown>,
  ...keys: string[]
): UtcTimestamp | null {
  for (const key of keys) {
    const result = parseUtcTimestamp(record[key])
    if (result) return result
  }
  return null
}
