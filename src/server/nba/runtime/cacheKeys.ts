import type { NbaProviderId, SeasonEndYear } from '@/entities/nba/model'

export function gamesCacheKey(provider: NbaProviderId, date: string): string {
  return `${provider}:nba:games:date=${date}`
}

export function standingsCacheKey(provider: NbaProviderId, seasonEndYear: SeasonEndYear): string {
  return `${provider}:nba:standings:season=${seasonEndYear}`
}

export function scheduleCacheKey(provider: NbaProviderId): string {
  return `${provider}:nba:schedule:days=7`
}
