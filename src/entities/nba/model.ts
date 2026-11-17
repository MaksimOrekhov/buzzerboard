export type Brand<Value, Name extends string> = Value & { readonly __brand: Name }

export type NbaProviderId = 'dunkapi' | 'espn' | 'bbs'
export type TeamId = Brand<string, 'TeamId'>
export type GameId = Brand<string, 'GameId'>
export type PlayerId = Brand<string, 'PlayerId'>
export type NewsItemId = Brand<string, 'NewsItemId'>
export type ProviderRecordId = Brand<string, 'ProviderRecordId'>
export type NbaGameDate = Brand<string, 'NbaGameDate'>
export type UtcTimestamp = Brand<string, 'UtcTimestamp'>
export type SeasonEndYear = Brand<number, 'SeasonEndYear'>
export type Conference = 'east' | 'west'

export type GameStatus =
  'scheduled' | 'live' | 'final' | 'postponed' | 'canceled' | 'suspended' | 'unknown'

export interface Team {
  /** Canonical NBA team id when the provider abbreviation is known. */
  id: TeamId
  /** Provider id preserved for provider-specific lookups and provenance. */
  providerId: ProviderRecordId | null
  abbreviation: string | null
  displayName: string | null
}

export interface Score {
  home: number | null
  away: number | null
}

export interface ScoreByPeriod {
  period: number
  home: number | null
  away: number | null
}

export interface Game {
  /** Provider-qualified source id; stable for updates from that provider. */
  id: GameId
  provider: NbaProviderId
  providerId: ProviderRecordId
  seasonEndYear: SeasonEndYear | null
  /** NBA game date in America/New_York, not the viewer's local calendar date. */
  nbaGameDate: NbaGameDate
  /** UTC instant; null when the source omitted or supplied an invalid timestamp. */
  startsAt: UtcTimestamp | null
  status: GameStatus
  homeTeam: Team
  awayTeam: Team
  score: Score
  /** Null means period-level scores are unavailable from this source. */
  scoreByPeriod: readonly ScoreByPeriod[] | null
  venue: string | null
}

export interface ShootingLine {
  made: number | null
  attempted: number | null
  percentage: number | null
}

export interface TeamBoxScore {
  team: Team
  points: number | null
  fieldGoals: ShootingLine
  threePointers: ShootingLine
  freeThrows: ShootingLine
  rebounds: number | null
  offensiveRebounds: number | null
  defensiveRebounds: number | null
  assists: number | null
  steals: number | null
  blocks: number | null
  turnovers: number | null
  fouls: number | null
  plusMinus: number | null
}

export interface PlayerBoxScore {
  player: Player
  starter: boolean | null
  /** null means the provider did not supply enough participation data. */
  didNotPlay: boolean | null
  minutes: string | null
  points: number | null
  fieldGoals: ShootingLine
  threePointers: ShootingLine
  freeThrows: ShootingLine
  rebounds: number | null
  offensiveRebounds: number | null
  defensiveRebounds: number | null
  assists: number | null
  steals: number | null
  blocks: number | null
  turnovers: number | null
  fouls: number | null
  plusMinus: number | null
}

export interface GameBoxScore {
  game: Game
  teams: readonly TeamBoxScore[]
  players: readonly PlayerBoxScore[]
}

export interface Player {
  /** Provider-qualified until a verified cross-provider player mapping exists. */
  id: PlayerId
  provider: NbaProviderId
  providerId: ProviderRecordId
  displayName: string | null
  teamId: TeamId | null
}

export interface TeamRecord {
  wins: number | null
  losses: number | null
  conferenceWins: number | null
  conferenceLosses: number | null
  homeWins: number | null
  homeLosses: number | null
  awayWins: number | null
  awayLosses: number | null
  lastTenWins: number | null
  pointsFor: number | null
  pointsAgainst: number | null
  averageMargin: number | null
}

export interface StandingsRow {
  team: Team
  seasonEndYear: SeasonEndYear | null
  conference: Conference | null
  record: TeamRecord
  winPercentage: number | null
  /** Only populated when the provider supplies an explicit rank field. */
  officialRank: number | null
  /** Only populated when the provider supplies an explicit playoff seed field. */
  playoffSeed: number | null
  /** Position in the received array; this is not an implied official rank. */
  providerOrder: number | null
}

export interface NewsItem {
  id: NewsItemId
  sourceId: ProviderRecordId
  source: string
  title: string
  summary: string | null
  url: string
  publishedAt: UtcTimestamp | null
  imageUrl: string | null
}

export type NbaApiErrorCode =
  | 'authentication'
  | 'forbidden'
  | 'rate_limited'
  | 'not_found'
  | 'cache_miss'
  | 'invalid_request'
  | 'timeout'
  | 'upstream_unavailable'
  | 'invalid_response'
  | 'unauthorized'
  | 'quota_exceeded'
  | 'not_configured'
  | 'refresh_in_progress'
  | 'storage_unavailable'
  | 'unknown'

export interface NbaApiError {
  code: NbaApiErrorCode
  message: string
  retryable: boolean
  provider: NbaProviderId | null
  upstreamStatus: number | null
}

export interface NbaSnapshot<T, Provider extends string = NbaProviderId> {
  data: T
  meta: {
    provider: Provider
    fetchedAt: UtcTimestamp
    /** Null when the provider gives no exact per-response freshness timestamp. */
    providerUpdatedAt: UtcTimestamp | null
    /** Set by the internal cache layer, never guessed by an adapter. */
    stale: boolean
    rejectedRecords: number
  }
}
