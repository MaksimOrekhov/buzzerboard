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
  UtcTimestamp,
} from '@/entities/nba/model'

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
/** News source is intentionally open until it is researched and selected. */
export type NewsResponse = NbaApiSnapshot<readonly NewsItem[]>

export type NbaRevalidationTarget =
  | { type: 'games'; date: NbaGameDate }
  | { type: 'standings'; seasonEndYear: SeasonEndYear }
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
