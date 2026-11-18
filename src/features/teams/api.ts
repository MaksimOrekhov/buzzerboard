import type { NbaApiErrorCode, SeasonEndYear } from '@/entities/nba/model'
import type { TeamSeasonResponse, TeamsResponse } from '@/shared/api/nba/contracts'
import { fetchWorkerResource } from '@/shared/api/nba/workerClient'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nullableNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isMeta(value: unknown): boolean {
  if (!isRecord(value)) return false
  const errors: readonly NbaApiErrorCode[] = [
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
  const error = value.refreshError
  const validError =
    error === null ||
    (isRecord(error) &&
      typeof error.code === 'string' &&
      errors.includes(error.code as NbaApiErrorCode) &&
      typeof error.message === 'string' &&
      typeof error.retryable === 'boolean')
  return (
    (value.source === 'bbs' || value.source === 'dunkapi' || value.source === 'espn') &&
    typeof value.fetchedAt === 'string' &&
    (value.providerUpdatedAt === null || typeof value.providerUpdatedAt === 'string') &&
    typeof value.isStale === 'boolean' &&
    Number.isSafeInteger(value.rejectedRecords) &&
    Number(value.rejectedRecords) >= 0 &&
    validError
  )
}

function isStats(value: unknown): boolean {
  if (!isRecord(value)) return false
  return [
    value.gamesPlayed,
    value.pointsPerGame,
    value.fieldGoalPercentage,
    value.threePointPercentage,
    value.reboundsPerGame,
    value.assistsPerGame,
    value.turnoversPerGame,
  ].every(nullableNumber)
}

function isTeamProfile(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.team) || !isStats(value.stats)) return false
  const { team } = value
  const validTeam =
    typeof team.id === 'string' &&
    team.id.startsWith('nba:team:') &&
    team.providerId === null &&
    typeof team.abbreviation === 'string' &&
    typeof team.displayName === 'string'
  const validRecent =
    value.lastTen === null ||
    (Array.isArray(value.lastTen) &&
      value.lastTen.every(
        (row) =>
          isRecord(row) &&
          (row.gameId === null || typeof row.gameId === 'string') &&
          typeof row.nbaGameDate === 'string' &&
          typeof row.opponentCode === 'string' &&
          (row.result === 'W' || row.result === 'L') &&
          Number.isFinite(row.pointsFor) &&
          Number.isFinite(row.pointsAgainst) &&
          (row.venue === null || row.venue === 'home' || row.venue === 'away'),
      ))
  const validLeaders =
    Array.isArray(value.leaders) &&
    value.leaders.every(
      (row) =>
        isRecord(row) &&
        typeof row.playerId === 'string' &&
        typeof row.displayName === 'string' &&
        typeof row.statLabel === 'string' &&
        nullableNumber(row.statValue),
    )
  const validNextGame =
    value.nextGame === null ||
    (isRecord(value.nextGame) &&
      typeof value.nextGame.gameId === 'string' &&
      (value.nextGame.nbaGameDate === null || typeof value.nextGame.nbaGameDate === 'string') &&
      (value.nextGame.startsAt === null || typeof value.nextGame.startsAt === 'string') &&
      (value.nextGame.isHome === null || typeof value.nextGame.isHome === 'boolean') &&
      (value.nextGame.opponentCode === null || typeof value.nextGame.opponentCode === 'string'))
  return (
    validTeam &&
    Number.isSafeInteger(value.seasonEndYear) &&
    nullableNumber(value.wins) &&
    nullableNumber(value.losses) &&
    nullableNumber(value.winPercentage) &&
    nullableNumber(value.overallRank) &&
    nullableNumber(value.conferenceRank) &&
    nullableNumber(value.gamesBack) &&
    (value.streak === null || typeof value.streak === 'string') &&
    (value.home === null || isRecord(value.home)) &&
    (value.away === null || isRecord(value.away)) &&
    validRecent &&
    validLeaders &&
    validNextGame
  )
}

function isTeamsResponse(value: unknown): value is TeamsResponse {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.coverage)) return false
  const available = value.coverage.available
  const total = value.coverage.total
  if (
    typeof available !== 'number' ||
    !Number.isSafeInteger(available) ||
    typeof total !== 'number' ||
    !Number.isSafeInteger(total) ||
    total !== 30 ||
    available < 0 ||
    available > 30
  )
    return false
  if (!(value.meta === null || isMeta(value.meta))) return false
  return (
    value.data.length === 30 &&
    value.data.every((entry) => {
      if (!isRecord(entry) || !isRecord(entry.team)) return false
      const { team } = entry
      if (
        typeof entry.code !== 'string' ||
        typeof entry.name !== 'string' ||
        (entry.conference !== 'east' && entry.conference !== 'west') ||
        typeof entry.division !== 'string' ||
        typeof team.id !== 'string' ||
        team.id !== `nba:team:${entry.code}` ||
        team.providerId !== null ||
        typeof team.abbreviation !== 'string' ||
        typeof team.displayName !== 'string'
      )
        return false
      const season = entry.season
      return (
        season === null ||
        (isRecord(season) &&
          nullableNumber(season.wins) &&
          nullableNumber(season.losses) &&
          nullableNumber(season.winPercentage) &&
          nullableNumber(season.overallRank) &&
          nullableNumber(season.gamesBack) &&
          isStats(season.stats) &&
          typeof season.isStale === 'boolean')
      )
    })
  )
}

function isTeamSeasonResponse(value: unknown): value is TeamSeasonResponse {
  return isRecord(value) && isTeamProfile(value.data) && isMeta(value.meta)
}

export function fetchTeams(
  seasonEndYear: SeasonEndYear,
  signal?: AbortSignal,
): Promise<TeamsResponse> {
  return fetchWorkerResource(
    `/api/teams?seasonEndYear=${encodeURIComponent(String(seasonEndYear))}`,
    isTeamsResponse,
    signal,
  )
}

export function fetchTeamSeason(
  teamCode: string,
  seasonEndYear: SeasonEndYear,
  signal?: AbortSignal,
): Promise<TeamSeasonResponse> {
  return fetchWorkerResource(
    `/api/teams/${encodeURIComponent(teamCode)}?seasonEndYear=${encodeURIComponent(String(seasonEndYear))}`,
    (value): value is TeamSeasonResponse =>
      isTeamSeasonResponse(value) &&
      value.data.team.id === `nba:team:${teamCode}` &&
      value.data.seasonEndYear === seasonEndYear,
    signal,
  )
}
