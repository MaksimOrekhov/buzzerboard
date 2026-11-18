import type { GameId, NbaProviderId, SeasonEndYear, TeamId } from '@/entities/nba/model'

export function gamesCacheKey(provider: NbaProviderId, date: string): string {
  return `${provider}:nba:games:date=${date}`
}

export function standingsCacheKey(provider: NbaProviderId, seasonEndYear: SeasonEndYear): string {
  return `${provider}:nba:standings:season=${seasonEndYear}`
}

export function scheduleCacheKey(provider: NbaProviderId): string {
  return `${provider}:nba:schedule:days=7`
}

export function gameDetailsCacheKey(provider: NbaProviderId, gameId: GameId): string {
  return `${provider}:nba:game-details:id=${encodeURIComponent(gameId)}`
}

export function teamSeasonCacheKey(
  provider: NbaProviderId,
  teamId: TeamId,
  seasonEndYear: SeasonEndYear,
): string {
  return `${provider}:nba:team-season:team=${encodeURIComponent(teamId)}:season=${seasonEndYear}`
}

export function teamDirectoryCacheKey(
  provider: NbaProviderId,
  seasonEndYear: SeasonEndYear,
): string {
  return `${provider}:nba:team-directory:season=${seasonEndYear}`
}
