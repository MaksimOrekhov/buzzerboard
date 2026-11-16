import type {
  Game,
  NbaApiError,
  NbaGameDate,
  NbaSnapshot,
  NewsItem,
  SeasonEndYear,
  StandingsRow,
} from '@/entities/nba/model'

export interface GamesQuery {
  date: NbaGameDate
}

export interface StandingsQuery {
  seasonEndYear: SeasonEndYear
}

export type GamesResponse = NbaSnapshot<readonly Game[]>
export type GameResponse = NbaSnapshot<Game>
export type StandingsResponse = NbaSnapshot<readonly StandingsRow[]>
/** News source is intentionally open until it is researched and selected. */
export type NewsResponse = NbaSnapshot<readonly NewsItem[], string>

export interface NbaApiErrorResponse {
  error: NbaApiError
  requestId: string | null
}
