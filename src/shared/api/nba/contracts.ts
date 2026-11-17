import type {
  Game,
  GameBoxScore,
  GameId,
  NbaApiError,
  NbaGameDate,
  NbaProviderId,
  NewsItem,
  SeasonEndYear,
  StandingsRow,
  TeamSeasonProfile,
  UtcTimestamp,
} from '@/entities/nba/model'
import type { NbaTeamReference } from '@/entities/nba/model'

export interface GamesQuery {
  date: NbaGameDate
}

export interface StandingsQuery {
  seasonEndYear: SeasonEndYear
}

export interface NbaApiSnapshot<T> {
  data: T
  meta: {
    /** Provider identifier shown to clients as the source of these data. */
    source: NbaProviderId
    fetchedAt: UtcTimestamp
    providerUpdatedAt: UtcTimestamp | null
    isStale: boolean
    rejectedRecords: number
    /** Safe normalized error from the last failed refresh, if stale data was served. */
    refreshError: NbaApiError | null
  }
}

export type GamesResponse = NbaApiSnapshot<readonly Game[]>
export type GameResponse = NbaApiSnapshot<Game>
export interface GameDetailsResponse {
  data: { game: Game; boxScore: GameBoxScore | null }
  meta: NbaApiSnapshot<Game>['meta']
  boxScoreMeta: NbaApiSnapshot<Game>['meta'] | null
  boxScoreAvailability: 'available' | 'unavailable' | 'snapshot_mismatch'
}
export type StandingsResponse = NbaApiSnapshot<readonly StandingsRow[]>
export type TeamSeasonResponse = NbaApiSnapshot<TeamSeasonProfile>

export interface TeamSeasonCard {
  wins: number | null
  losses: number | null
  winPercentage: number | null
  overallRank: number | null
  gamesBack: number | null
  stats: TeamSeasonProfile['stats']
  isStale: boolean
}

export interface TeamDirectoryEntry extends Omit<NbaTeamReference, 'team'> {
  team: NbaTeamReference['team']
  season: TeamSeasonCard | null
}

export interface TeamsResponse {
  data: readonly TeamDirectoryEntry[]
  coverage: { available: number; total: number }
  meta: NbaApiSnapshot<readonly TeamDirectoryEntry[]>['meta'] | null
}
/** News source is intentionally open until it is researched and selected. */
export type NewsResponse = NbaApiSnapshot<readonly NewsItem[]>

export type NbaRevalidationTarget =
  | { type: 'games'; date: NbaGameDate }
  | { type: 'standings'; seasonEndYear: SeasonEndYear }
  | { type: 'teamSeason'; teamCode: string; seasonEndYear: SeasonEndYear }
  | { type: 'teamDirectory'; seasonEndYear: SeasonEndYear }
  | { type: 'schedule' }
  | { type: 'boxScore'; date: NbaGameDate; gameId: GameId }

export interface NbaRevalidationResponse {
  target: NbaRevalidationTarget
  state: 'refreshed' | 'up_to_date' | 'deferred' | 'in_progress'
  isStale: boolean
  fetchedAt: UtcTimestamp | null
  retryAfter: UtcTimestamp | null
  error: NbaApiError | null
}

export interface NbaApiErrorResponse {
  error: NbaApiError
  requestId: string | null
}
