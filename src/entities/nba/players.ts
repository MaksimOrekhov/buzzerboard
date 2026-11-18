export const playerSeason = 2027
export const bbsPlayerId = /^bbs:player:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export const playerMetrics = [
  ['gp', 'GP', 'Матчи', 'basic'],
  ['min', 'MIN', 'Минуты', 'basic'],
  ['pts', 'PTS', 'Очки', 'basic'],
  ['reb', 'REB', 'Подборы', 'basic'],
  ['ast', 'AST', 'Передачи', 'basic'],
  ['fgm', 'FGM', 'Попадания с игры', 'shooting'],
  ['fga', 'FGA', 'Попытки с игры', 'shooting'],
  ['fg', 'FG%', 'С игры, %', 'shooting'],
  ['threeM', '3PM', 'Трёхочковые попадания', 'shooting'],
  ['threeA', '3PA', 'Трёхочковые попытки', 'shooting'],
  ['three', '3P%', 'Трёхочковые, %', 'shooting'],
  ['ftm', 'FTM', 'Штрафные попадания', 'shooting'],
  ['fta', 'FTA', 'Штрафные попытки', 'shooting'],
  ['ft', 'FT%', 'Штрафные, %', 'shooting'],
  ['stl', 'STL', 'Перехваты', 'defense'],
  ['blk', 'BLK', 'Блок-шоты', 'defense'],
  ['oreb', 'OREB', 'Подборы в атаке', 'defense'],
  ['dreb', 'DREB', 'Подборы в защите', 'defense'],
  ['tov', 'TO', 'Потери', 'defense'],
  ['pf', 'PF', 'Фолы', 'defense'],
] as const

export type PlayerMetric = (typeof playerMetrics)[number][0]
export type PlayerStats = Record<PlayerMetric, number | null>
export type AdvancedMetric =
  'efg' | 'ts' | 'gmSc' | 'astTo' | 'threeRate' | 'freeThrowRate' | 'twoPoint'
export type Per36Metric = 'pts36' | 'reb36' | 'ast36' | 'stl36' | 'blk36'
export type AdvancedStatsMetric = AdvancedMetric | Per36Metric
export type PlayerGroup = (typeof playerMetrics)[number][3] | 'advanced' | 'per36'
export type PlayerSort = PlayerMetric | AdvancedStatsMetric | 'name'

export interface NbaPlayerEntry {
  id: string
  name: string
  team: string | null
  position: string | null
  number: string | null
  height: string | null
  weight: string | null
  stats: PlayerStats | null
  averageUpdatedAt?: string | null
}

export interface PlayerRefreshSummary {
  phase: 'directory' | 'averages' | 'publish' | 'retry' | 'gameRefs' | 'enrich' | 'idle'
  total: number
  updated: number
  failed: number
  cycleStartedAt: string | null
  lastCompletedAt: string | null
  nextCycleAt: number
}

export interface PlayerGame {
  date: string
  opponent: string | null
  gameId: string | null
  pts: number | null
  reb: number | null
  ast: number | null
  min: number | null
}

export interface PlayerDetail {
  birthDate: string | null
  currentTeam: string | null
  profileAt: string | null
  logAt: string | null
  games: PlayerGame[]
}

export interface PlayerCoverage {
  providerRows: number
  total: number
  checked: number
  averages: number
  enriched: number
  boxLinks: number
}

export interface PlayerSnapshot {
  source: 'bbs'
  seasonEndYear: number
  fetchedAt: string
  isStale: boolean
  coverage: PlayerCoverage
  refreshStatus?: PlayerRefreshSummary | null
}

export interface PlayersResponse extends PlayerSnapshot {
  players: NbaPlayerEntry[]
}

export interface PlayerResponse extends PlayerSnapshot {
  player: NbaPlayerEntry
  detail: PlayerDetail | null
}

export function playerPath(id: string) {
  return '/players/' + encodeURIComponent(id)
}

export function formatPlayerStat(key: PlayerMetric, value: number | null | undefined): string {
  if (value == null) return '—'
  if (key === 'fg' || key === 'three' || key === 'ft')
    return new Intl.NumberFormat('ru', { style: 'percent', maximumFractionDigits: 1 }).format(value)
  return new Intl.NumberFormat('ru', { maximumFractionDigits: 1 }).format(value)
}

export function comparePlayers(
  a: NbaPlayerEntry,
  b: NbaPlayerEntry,
  key: PlayerSort,
  ascending: boolean,
  resolveAdvanced?: (stats: PlayerStats, key: AdvancedStatsMetric) => number | null,
) {
  const byName = a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id)
  if (key === 'name') return ascending ? byName : -byName
  const value = (stats: PlayerStats | null) =>
    stats
      ? key in stats
        ? stats[key as PlayerMetric]
        : (resolveAdvanced?.(stats, key as AdvancedStatsMetric) ?? null)
      : null
  const left = value(a.stats)
  const right = value(b.stats)
  if (left == null) return right == null ? byName : 1
  if (right == null) return -1
  return (ascending ? left - right : right - left) || byName
}
