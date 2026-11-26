import { describe, expect, it } from 'vitest'
import { compareLogRows, playerTrend, type PlayerLogRow } from './playerGameLog'

function row(
  date: string,
  opponent: string | null,
  pts: number | null,
  hidden = false,
): PlayerLogRow {
  return { game: { date, opponent, gameId: null, pts, reb: 0, ast: 0, min: 32 }, hidden }
}
const rows = [
  row('2026-11-12', 'BOS', 0),
  row('2026-11-13', 'POR', null),
  row('2026-11-14', 'SAS', 25),
  row('2026-11-15', 'BOS', 25),
  row('2026-11-16', 'LAL', 99, true),
  row('2026-11-17', null, 70, true),
]

describe('player analytics game log', () => {
  it('sorts protected and missing values last with stable recent dates in ties', () => {
    const dates = (ascending: boolean) =>
      [...rows]
        .sort((a, b) => compareLogRows(a, b, 'pts', ascending))
        .map(({ game }) => game.date.slice(-2))
    expect(dates(true)).toEqual(['12', '15', '14', '17', '16', '13'])
    expect(dates(false)).toEqual(['15', '14', '12', '17', '16', '13'])
  })
  it('sorts public opponent and date independently of stat protection', () => {
    expect(
      [...rows]
        .sort((a, b) => compareLogRows(a, b, 'opponent', true))
        .map(({ game }) => game.date.slice(-2)),
    ).toEqual(['15', '12', '16', '13', '14', '17'])
    expect(
      [...rows]
        .sort((a, b) => compareLogRows(a, b, 'opponent', false))
        .map(({ game }) => game.opponent),
    ).toEqual(['SAS', 'POR', 'LAL', 'BOS', 'BOS', null])
    expect([...rows].sort((a, b) => compareLogRows(a, b, 'date', false))[0]).toBe(rows.at(-1))
  })
  it('keeps zero, breaks the series at nulls and excludes protected values from points and scale', () => {
    const trend = playerTrend(rows, 'pts')
    expect(trend.shown).toBe(4)
    expect(trend.max).toBe(25)
    expect(trend.points.map(({ value }) => value)).toEqual([0, 25, 25])
    expect(trend.edges.map(({ start, end }) => [start.index, end.index])).toEqual([[2, 3]])
  })
  it('keeps the scale and geometry valid when every point is hidden', () => {
    expect(playerTrend(rows.slice(-2), 'pts')).toEqual({ shown: 0, max: 5, points: [], edges: [] })
  })
})
