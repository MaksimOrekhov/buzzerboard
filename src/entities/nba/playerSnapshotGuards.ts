import {
  bbsPlayerId,
  playerMetrics,
  playerSeason,
  type NbaPlayerEntry,
  type PlayerCoverage,
  type PlayerDetail,
  type PlayerGame,
  type PlayerResponse,
  type PlayersResponse,
  type PlayerRefreshSummary,
} from './players.ts'

export interface PlayerGameRef {
  gameId: string
  date: string
}

export interface PlayerLogRow extends PlayerGame {
  gameId: null
  matchId: string | null
}

export type StoredPlayerDetail = Omit<PlayerDetail, 'games'> & { games: PlayerLogRow[] }
export interface StoredPlayers {
  version: 2
  players: NbaPlayerEntry[]
  details: Record<string, StoredPlayerDetail>
  gameRefs: Record<string, PlayerGameRef[]>
  directoryAt: string
  averageAt: Record<string, string>
  coverage: PlayerCoverage
}

export const bbsGameId = /^bbs:game:[\w-]{1,100}$/
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 130
const nullableText = (value: unknown) => value === null || text(value)
const team = (value: unknown) =>
  value === null || (typeof value === 'string' && /^[A-Z]{3}$/.test(value))
export function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(value) &&
    calendarDate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  )
}
export function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function seasonDate(value: unknown, seasonEndYear: number): value is string {
  return (
    calendarDate(value) && value >= seasonEndYear - 1 + '-08-01' && value < seasonEndYear + '-08-01'
  )
}
function number(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  return (
    value === null ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max)
  )
}
const playerId = (value: unknown): value is string =>
  typeof value === 'string' && bbsPlayerId.test(value)
const gameId = (value: unknown) => typeof value === 'string' && bbsGameId.test(value)
export function isPlayerEntry(value: unknown): value is NbaPlayerEntry {
  if (
    !record(value) ||
    !playerId(value.id) ||
    !text(value.name) ||
    !team(value.team) ||
    ![value.position, value.number, value.height, value.weight].every(nullableText) ||
    (Object.hasOwn(value, 'averageUpdatedAt') &&
      value.averageUpdatedAt !== null &&
      !timestamp(value.averageUpdatedAt))
  )
    return false
  const stats = value.stats
  return (
    stats === null ||
    (record(stats) &&
      count(stats.gp) &&
      playerMetrics.every(([key]) =>
        number(
          stats[key],
          ['fg', 'ft', 'three'].includes(key) ? 1 : key === 'min' ? 80 : undefined,
        ),
      ) &&
      (stats.gp > 0 || playerMetrics.every(([key]) => key === 'gp' || stats[key] === null)))
  )
}

export function isCoverage(value: unknown): value is PlayerCoverage {
  return (
    record(value) &&
    count(value.providerRows) &&
    value.providerRows <= 1500 &&
    count(value.total) &&
    value.total > 0 &&
    value.total <= value.providerRows &&
    count(value.checked) &&
    value.checked <= value.total &&
    count(value.averages) &&
    value.averages <= value.checked &&
    count(value.enriched) &&
    value.enriched <= value.total &&
    count(value.boxLinks) &&
    value.boxLinks <= value.total * 15
  )
}

export function isGameRef(value: unknown, season = playerSeason): value is PlayerGameRef {
  return record(value) && seasonDate(value.date, season) && gameId(value.gameId)
}
function isPlayerGame(value: unknown, season: number): value is PlayerGame {
  return (
    record(value) &&
    seasonDate(value.date, season) &&
    nullableText(value.opponent) &&
    (value.gameId === null || gameId(value.gameId)) &&
    number(value.pts) &&
    number(value.reb) &&
    number(value.ast) &&
    number(value.min, 80)
  )
}
export function isPlayerDetail(value: unknown, season = playerSeason): value is PlayerDetail {
  return (
    record(value) &&
    (value.birthDate === null || calendarDate(value.birthDate)) &&
    team(value.currentTeam) &&
    (value.profileAt === null || timestamp(value.profileAt)) &&
    (value.logAt === null || timestamp(value.logAt)) &&
    Array.isArray(value.games) &&
    value.games.length <= 15 &&
    value.games.every((entry) => isPlayerGame(entry, season))
  )
}
function storedDetail(value: unknown, season: number): value is StoredPlayerDetail {
  return (
    isPlayerDetail(value, season) &&
    value.games.every(
      (entry) =>
        record(entry) && entry.gameId === null && (entry.matchId === null || gameId(entry.matchId)),
    )
  )
}
function playerList(value: unknown, coverage: PlayerCoverage): value is NbaPlayerEntry[] {
  return (
    Array.isArray(value) &&
    value.length === coverage.total &&
    value.every(isPlayerEntry) &&
    new Set(value.map(({ id }) => id)).size === value.length &&
    value.filter(({ stats }) => stats && stats.gp! > 0).length === coverage.averages
  )
}
function snapshot(value: unknown): value is Record<string, unknown> {
  return (
    record(value) &&
    value.source === 'bbs' &&
    value.seasonEndYear === playerSeason &&
    timestamp(value.fetchedAt) &&
    typeof value.isStale === 'boolean' &&
    isCoverage(value.coverage) &&
    (!Object.hasOwn(value, 'refreshStatus') ||
      value.refreshStatus === null ||
      isPlayerRefreshSummary(value.refreshStatus))
  )
}

export function isPlayerRefreshSummary(value: unknown): value is PlayerRefreshSummary {
  return (
    record(value) &&
    ['directory', 'averages', 'publish', 'retry', 'gameRefs', 'enrich', 'idle'].includes(
      String(value.phase),
    ) &&
    count(value.total) &&
    count(value.updated) &&
    count(value.failed) &&
    (value.cycleStartedAt === null || timestamp(value.cycleStartedAt)) &&
    (value.lastCompletedAt === null || timestamp(value.lastCompletedAt)) &&
    count(value.nextCycleAt)
  )
}
export function isPlayersResponse(value: unknown): value is PlayersResponse {
  return snapshot(value) && isCoverage(value.coverage) && playerList(value.players, value.coverage)
}
export function isPlayerResponse(value: unknown): value is PlayerResponse {
  return (
    snapshot(value) &&
    isPlayerEntry(value.player) &&
    (value.detail === null || isPlayerDetail(value.detail))
  )
}
export function isStoredPlayers(value: unknown, season = playerSeason): value is StoredPlayers {
  if (
    !record(value) ||
    value.version !== 2 ||
    !isCoverage(value.coverage) ||
    !playerList(value.players, value.coverage) ||
    !timestamp(value.directoryAt) ||
    !record(value.averageAt) ||
    !record(value.details) ||
    !record(value.gameRefs)
  )
    return false
  const ids = new Set(value.players.map(({ id }) => id))
  const observations = Object.entries(value.averageAt)
  return (
    observations.length === value.coverage.checked &&
    observations.every(([id, at]) => ids.has(id) && timestamp(at)) &&
    value.players.every(
      ({ id, stats }) => stats === null || Object.hasOwn(value.averageAt as object, id),
    ) &&
    Object.entries(value.details).every(
      ([id, detail]) => ids.has(id) && storedDetail(detail, season),
    ) &&
    Object.entries(value.gameRefs).every(
      ([id, refs]) =>
        ids.has(id) &&
        Array.isArray(refs) &&
        refs.length <= 15 &&
        refs.every((ref) => isGameRef(ref, season)) &&
        new Set(refs.map((ref) => ref.gameId)).size === refs.length,
    )
  )
}
