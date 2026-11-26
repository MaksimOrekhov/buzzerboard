import type { PlayerGame } from '@/entities/nba/players'

export const gameMetrics = [
  { value: 'pts', label: 'Очки', code: 'PTS' },
  { value: 'reb', label: 'Подборы', code: 'REB' },
  { value: 'ast', label: 'Передачи', code: 'AST' },
  { value: 'min', label: 'Минуты', code: 'MIN' },
] as const

export type GameMetric = (typeof gameMetrics)[number]['value']
export type GameLogSort = GameMetric | 'date' | 'opponent'
export type PlayerLogRow = { game: PlayerGame; hidden: boolean }
export const gameIdentity = (game: PlayerGame) => ({ id: game.gameId, nbaGameDate: game.date })

export function compareLogRows(
  left: PlayerLogRow,
  right: PlayerLogRow,
  key: GameLogSort,
  ascending: boolean,
) {
  const a = left.game
  const b = right.game
  const direction = ascending ? 1 : -1
  const date = a.date.localeCompare(b.date)
  const tie =
    b.date.localeCompare(a.date) ||
    (a.gameId ?? '').localeCompare(b.gameId ?? '') ||
    (a.opponent ?? '').localeCompare(b.opponent ?? '')
  if (key === 'date') return direction * date || tie
  if (key === 'opponent') {
    if (a.opponent === null) return b.opponent === null ? tie : 1
    if (b.opponent === null) return -1
    return direction * a.opponent.localeCompare(b.opponent) || tie
  }
  const first = left.hidden ? null : a[key]
  const second = right.hidden ? null : b[key]
  if (first === null) return second === null ? tie : 1
  if (second === null) return -1
  return direction * (first - second) || tie
}

export function playerTrend(rows: readonly PlayerLogRow[], metric: GameMetric) {
  const games = [...rows].sort((a, b) => compareLogRows(a, b, 'date', true))
  const shown = games.filter((row) => !row.hidden).length
  const values = games.map(({ game, hidden }) => (hidden ? null : game[metric]))
  const max = Math.max(5, Math.ceil(Math.max(0, ...values.map((value) => value ?? 0)) / 5) * 5)
  const points = values.flatMap((value, index) => {
    if (value === null) return []
    return [
      {
        index,
        value,
        date: games[index]!.game.date,
        x: 48 + 504 * (values.length === 1 ? 0.5 : index / (values.length - 1)),
        y: 168 - (146 * value) / max,
      },
    ]
  })
  const edges = points.slice(1).flatMap((end, index) => {
    const start = points[index]!
    return end.index === start.index + 1 ? [{ start, end }] : []
  })
  return { shown, max, points, edges }
}

const logNumber = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 20 })
export function formatGameStat(value: number | null) {
  return value === null ? '—' : logNumber.format(value)
}
