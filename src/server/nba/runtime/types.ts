import type {
  Game,
  GameBoxScore,
  GameId,
  NbaGameDate,
  NbaApiError,
  NbaProviderId,
  SeasonEndYear,
  StandingsRow,
  TeamId,
  TeamProviderReference,
  TeamSeasonProfile,
  UtcTimestamp,
} from '@/entities/nba/model'

export type NbaCacheCapability =
  'games' | 'standings' | 'schedule' | 'boxScore' | 'teamSeason' | 'teamDirectory'

export type NbaRefreshTarget =
  | { type: 'games'; date: NbaGameDate }
  | { type: 'standings'; seasonEndYear: SeasonEndYear }
  | { type: 'teamSeason'; teamCode: string; seasonEndYear: SeasonEndYear }
  | { type: 'teamDirectory'; seasonEndYear: SeasonEndYear }
  | { type: 'schedule' }

export type ScheduledBbsTask =
  | { type: 'standings'; seasonEndYear: SeasonEndYear }
  | { type: 'enrichStandings'; seasonEndYear: SeasonEndYear }
  | { type: 'teamDirectory'; seasonEndYear: SeasonEndYear }
  | { type: 'games'; date: NbaGameDate }
  | { type: 'lateGames'; date: NbaGameDate }
  | { type: 'teamSeason'; teamCode: string; seasonEndYear: SeasonEndYear }
  | { type: 'boxScore'; date: NbaGameDate; gameId: GameId }

export interface ScheduledBbsWorkItem {
  task: ScheduledBbsTask
  attempts: number
  retryAt: number | null
  finalizationAttempts?: number
  lastError?: ScheduledBbsTaskDiagnostic
}

export type ScheduledBbsDiagnosticPhase =
  | 'provider_fetch'
  | 'games_pagination'
  | 'games_normalization'
  | 'games_date_validation'
  | 'games_archive_references'
  | 'games_cache_write'
  | 'box_score_archive_references'
  | 'box_score'
  | 'standings'
  | 'team_directory'
  | 'team_season'
  | 'standings_enrichment'
  | 'scheduled_task'

export interface ScheduledBbsTaskDiagnostic {
  phase: ScheduledBbsDiagnosticPhase
  errorCode: NbaApiError['code'] | null
  observedAt: number
  expectedCount?: number
  actualCount?: number
  rejectedRecords?: number
}

export const SCHEDULED_BBS_TASK_LIMIT = 200
export const SCHEDULED_BBS_MAX_ATTEMPTS = 5
export const SCHEDULED_BBS_FINALIZATION_ATTEMPTS = 3

export interface ScheduledBbsFailure {
  task: ScheduledBbsTask
  errorCode: NbaApiError['code'] | null
  failedAt: number
  diagnostic?: ScheduledBbsTaskDiagnostic
}

export function scheduledBbsTaskKey(task: ScheduledBbsTask): string {
  if (task.type === 'games' || task.type === 'lateGames') return `${task.type}:${task.date}`
  if (task.type === 'teamSeason') return `${task.type}:${task.seasonEndYear}:${task.teamCode}`
  if (task.type === 'boxScore') return `${task.type}:${task.date}:${task.gameId}`
  return `${task.type}:${task.seasonEndYear}`
}

export interface ScheduledBbsProgress {
  cycleDate: NbaGameDate
  tasks: readonly ScheduledBbsWorkItem[]
  cursor: number
  pauseUntil: number | null
  lastTickAt?: number
  failedTasks?: readonly ScheduledBbsFailure[]
}

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

export type TeamSeasonCacheRecord = CacheRecordBase & {
  capability: 'teamSeason'
  teamId: TeamId
  seasonEndYear: SeasonEndYear
  /** BBS UUID used only by server-side refresh routes; never sent to clients. */
  providerTeamId: string
  data: TeamSeasonProfile
}

export type TeamDirectoryCacheRecord = CacheRecordBase & {
  capability: 'teamDirectory'
  seasonEndYear: SeasonEndYear
  data: readonly TeamProviderReference[]
}

export type NbaCacheRecord =
  | GamesCacheRecord
  | StandingsCacheRecord
  | BoxScoreCacheRecord
  | TeamSeasonCacheRecord
  | TeamDirectoryCacheRecord

export interface CreditUsage {
  month: string
  baselineCredits: number
  appCredits: number
  boxScoreCredits: number
}

export interface ProviderCooldown {
  retryAt: number
  errorCode: NbaApiError['code']
  remaining?: number | null
  resetAt?: number | null
}

export interface NbaRepository {
  getCache(cacheKey: string): Promise<NbaCacheRecord | null>
  getCaches(cacheKeys: readonly string[]): Promise<readonly (NbaCacheRecord | null)[]>
  putCache(record: NbaCacheRecord): Promise<void>
  deleteCache(cacheKey: string): Promise<void>
  tryAcquireLock(lockKey: string, token: string, now: number, expiresAt: number): Promise<boolean>
  renewLock(lockKey: string, token: string, now: number, expiresAt: number): Promise<boolean>
  releaseLock(lockKey: string, token: string): Promise<void>
  putCacheIfLockOwned(
    record: NbaCacheRecord,
    lockKey: string,
    token: string,
    now: number,
  ): Promise<boolean>
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
  reserveBbsRequest(
    now: number,
    dailyLimit: number,
    minuteLimit: number,
  ): Promise<{
    allowed: boolean
    retryAt: number | null
    errorCode: 'quota_exceeded' | 'rate_limited' | null
  }>
  getScheduledBbsProgress(): Promise<ScheduledBbsProgress | null>
  putScheduledBbsProgress(progress: ScheduledBbsProgress | null): Promise<void>
  putScheduledBbsProgressIfLockOwned(
    progress: ScheduledBbsProgress,
    lockKey: string,
    token: string,
    now: number,
  ): Promise<boolean>
  getProviderCooldown(provider: NbaProviderId): Promise<ProviderCooldown | null>
  setProviderCooldown(
    provider: NbaProviderId,
    cooldown: ProviderCooldown,
    now: number,
  ): Promise<void>
  clearProviderCooldown(provider: NbaProviderId, now: number): Promise<void>
  reserveProviderBudget(
    provider: NbaProviderId,
    now: number,
    headroom: number,
  ): Promise<{ allowed: boolean; retryAt: number | null; errorCode: NbaApiError['code'] | null }>
  recordProviderRemaining(
    provider: NbaProviderId,
    remaining: number,
    resetAt: number,
    now: number,
  ): Promise<void>
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
  BBS_PLAYERS_ENABLED?: string
  BBS_PLAYER_REFRESH_ENABLED?: string
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
  BBS_REQUEST_HEADROOM?: string
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
