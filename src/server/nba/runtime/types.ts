import type {
  Game,
  GameBoxScore,
  GameId,
  NbaGameDate,
  NbaApiError,
  NbaProviderId,
  SeasonEndYear,
  StandingsRow,
  UtcTimestamp,
} from '@/entities/nba/model'

export type NbaCacheCapability = 'games' | 'standings' | 'schedule' | 'boxScore'

export type NbaRefreshTarget =
  | { type: 'games'; date: NbaGameDate }
  | { type: 'standings'; seasonEndYear: SeasonEndYear }
  | { type: 'schedule' }

export interface GameDateCoverage {
  from: NbaGameDate
  through: NbaGameDate
}

interface CacheRecordBase {
  cacheKey: string
  provider: NbaProviderId
  fetchedAt: UtcTimestamp
  providerUpdatedAt: UtcTimestamp | null
  rejectedRecords: number
  expiresAt: number
  staleUntil: number
  retryAt: number | null
  refreshError: NbaApiError | null
}

export type GamesCacheRecord =
  | (CacheRecordBase & {
      capability: 'games'
      data: readonly Game[]
      /** Private provider IDs needed for BBS archive-stat routes; never returned to clients. */
      providerReferences?: Readonly<Record<string, string>>
    })
  | (CacheRecordBase & {
      capability: 'schedule'
      data: readonly Game[]
      coverage: GameDateCoverage
    })

export type StandingsCacheRecord = CacheRecordBase & {
  capability: 'standings'
  data: readonly StandingsRow[]
}

export type BoxScoreCacheRecord = CacheRecordBase & {
  capability: 'boxScore'
  gameId: GameId
  data: GameBoxScore | null
}

export type NbaCacheRecord = GamesCacheRecord | StandingsCacheRecord | BoxScoreCacheRecord

export interface CreditUsage {
  month: string
  baselineCredits: number
  appCredits: number
  boxScoreCredits: number
}

export interface NbaRepository {
  getCache(cacheKey: string): Promise<NbaCacheRecord | null>
  putCache(record: NbaCacheRecord): Promise<void>
  deleteCache(cacheKey: string): Promise<void>
  tryAcquireLock(lockKey: string, token: string, now: number, expiresAt: number): Promise<boolean>
  releaseLock(lockKey: string, token: string): Promise<void>
  getCreditUsage(month: string): Promise<CreditUsage | null>
  reserveCredits(
    month: string,
    baselineCredits: number,
    credits: number,
    monthlyAppLimit: number,
    boxScoreLimit: number,
    monthlyLimit: number,
  ): Promise<CreditUsage | null>
  reserveBoxScoreCredits(
    month: string,
    baselineCredits: number,
    credits: number,
    boxScoreLimit: number,
    regularAppLimit: number,
    monthlyLimit: number,
  ): Promise<CreditUsage | null>
  consumeRateSlot(key: string, now: number, windowMs: number, limit: number): Promise<boolean>
  cleanupExpired(now: number): Promise<void>
}

export interface D1Result<T = unknown> {
  success: boolean
  results?: T[]
  meta?: { changes?: number }
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>
}

export interface WorkerAssets {
  fetch(request: Request): Promise<Response>
}

export interface WorkerEnvironment {
  NBA_DB?: D1Database
  ASSETS?: WorkerAssets
  DUNKAPI_REFRESH_ENABLED?: string
  DUNKAPI_API_KEY?: string
  MANUAL_REFRESH_TOKEN?: string
  DUNKAPI_MONTHLY_CREDIT_LIMIT?: string
  DUNKAPI_APP_MONTHLY_CREDIT_BUDGET?: string
  DUNKAPI_BOX_SCORE_REFRESH_ENABLED?: string
  DUNKAPI_BOX_SCORE_MONTHLY_CREDIT_BUDGET?: string
  DUNKAPI_CREDITS_USED_BASELINE?: string
  DUNKAPI_CREDIT_BASELINE_MONTH?: string
  NBA_GAMES_PROVIDER_ORDER?: string
  NBA_STANDINGS_PROVIDER_ORDER?: string
  BBS_API_KEY?: string
  BBS_API_BASE_URL?: string
  BBS_REFRESH_ENABLED?: string
  BBS_DAILY_REQUEST_LIMIT?: string
  BBS_DAILY_REQUEST_HEADROOM?: string
  BBS_PER_MINUTE_REQUEST_LIMIT?: string
  BBS_REQUEST_INTERVAL_MS?: string
}

export interface WorkerDependencies {
  repository?: NbaRepository
  fetcher?: typeof fetch
  now?: () => number
  requestId?: () => string
}

export interface ScheduledController {
  cron: string
  scheduledTime: number
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void
}
