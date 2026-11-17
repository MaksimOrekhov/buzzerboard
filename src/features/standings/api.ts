import type { NbaApiErrorCode, NbaProviderId, SeasonEndYear } from '@/entities/nba/model'
import type { StandingsResponse } from '@/shared/api/nba/contracts'
import { fetchWorkerResource } from '@/shared/api/nba/workerClient'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isNullableCounter(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && Number(value) >= 0)
}

function isProvider(value: unknown): value is NbaProviderId {
  return value === 'dunkapi' || value === 'espn'
}

function isNbaApiError(value: unknown): boolean {
  if (!isRecord(value)) return false
  const knownCodes: readonly NbaApiErrorCode[] = [
    'authentication',
    'forbidden',
    'rate_limited',
    'not_found',
    'cache_miss',
    'invalid_request',
    'timeout',
    'upstream_unavailable',
    'invalid_response',
    'unauthorized',
    'quota_exceeded',
    'not_configured',
    'refresh_in_progress',
    'storage_unavailable',
    'unknown',
  ]

  return (
    typeof value.code === 'string' &&
    knownCodes.includes(value.code as NbaApiErrorCode) &&
    typeof value.message === 'string' &&
    typeof value.retryable === 'boolean' &&
    (value.provider === null || isProvider(value.provider)) &&
    (value.upstreamStatus === null ||
      (typeof value.upstreamStatus === 'number' && Number.isFinite(value.upstreamStatus)))
  )
}

function isStandingsResponse(payload: unknown): payload is StandingsResponse {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.meta)) return false

  const { meta } = payload
  if (
    !isProvider(meta.source) ||
    typeof meta.fetchedAt !== 'string' ||
    !(meta.providerUpdatedAt === null || typeof meta.providerUpdatedAt === 'string') ||
    typeof meta.isStale !== 'boolean' ||
    !Number.isSafeInteger(meta.rejectedRecords) ||
    Number(meta.rejectedRecords) < 0 ||
    !(meta.refreshError === null || isNbaApiError(meta.refreshError))
  ) {
    return false
  }

  return payload.data.every((value) => {
    if (!isRecord(value) || !isRecord(value.team) || !isRecord(value.record)) return false

    const { team, record } = value
    const nullableTeamString = (candidate: unknown) =>
      candidate === null || typeof candidate === 'string'
    const seasonEndYear = value.seasonEndYear
    const conference = value.conference

    return (
      typeof team.id === 'string' &&
      nullableTeamString(team.providerId) &&
      nullableTeamString(team.abbreviation) &&
      nullableTeamString(team.displayName) &&
      (seasonEndYear === null ||
        (Number.isSafeInteger(seasonEndYear) && Number(seasonEndYear) >= 1947)) &&
      (conference === null || conference === 'east' || conference === 'west') &&
      isNullableCounter(record.wins) &&
      isNullableCounter(record.losses) &&
      isNullableCounter(record.conferenceWins) &&
      isNullableCounter(record.conferenceLosses) &&
      isNullableCounter(record.homeWins) &&
      isNullableCounter(record.homeLosses) &&
      isNullableCounter(record.awayWins) &&
      isNullableCounter(record.awayLosses) &&
      isNullableCounter(record.lastTenWins) &&
      isNullableNumber(record.pointsFor) &&
      isNullableNumber(record.pointsAgainst) &&
      isNullableNumber(record.averageMargin) &&
      isNullableNumber(value.winPercentage) &&
      isNullableCounter(value.officialRank) &&
      isNullableCounter(value.playoffSeed) &&
      isNullableCounter(value.providerOrder)
    )
  })
}

export function fetchStandings(
  seasonEndYear: SeasonEndYear,
  signal?: AbortSignal,
): Promise<StandingsResponse> {
  return fetchWorkerResource(
    `/api/standings?seasonEndYear=${encodeURIComponent(String(seasonEndYear))}`,
    isStandingsResponse,
    signal,
  )
}
