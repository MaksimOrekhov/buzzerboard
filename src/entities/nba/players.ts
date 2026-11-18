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
export type PlayerGroup = (typeof playerMetrics)[number][3]
export type PlayerSort = PlayerMetric | 'name'

export interface NbaPlayerEntry {
  id: string
  name: string
  team: string | null
  position: string | null
  number: string | null
  height: string | null
  weight: string | null
  stats: PlayerStats | null
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
) {
  const byName = a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id)
  if (key === 'name') return ascending ? byName : -byName
  const left = a.stats?.[key]
  const right = b.stats?.[key]
  if (left == null) return right == null ? byName : 1
  if (right == null) return -1
  return (ascending ? left - right : right - left) || byName
}
