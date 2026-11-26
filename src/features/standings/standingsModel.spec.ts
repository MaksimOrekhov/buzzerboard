import { describe, expect, it } from 'vitest'

import type { SeasonEndYear } from '@/entities/nba/model'
import { deriveConferenceStandings, sortStandingsRows } from './standingsModel'
import { makeStandingsRows } from './standingsTestData'
import { formatPercentage } from './formatters'

const seasonEndYear = 2027 as SeasonEndYear

describe('deriveConferenceStandings', () => {
  it('calculates GB only for a complete conference with valid records and a unique leader', () => {
    const rows = makeStandingsRows()
    const standings = deriveConferenceStandings(rows, 'east', seasonEndYear)

    expect(standings.gamesBehindAvailable).toBe(true)
    expect(standings.gamesBehindByTeamId.get(rows[0]!.team.id)).toBe(0)
    expect(standings.gamesBehindByTeamId.get(rows[1]!.team.id)).toBe(1)
    expect(standings.warning).toBeNull()
  })

  it('does not calculate GB for an incomplete roster', () => {
    const standings = deriveConferenceStandings(
      makeStandingsRows('east', 14),
      'east',
      seasonEndYear,
    )

    expect(standings.gamesBehindAvailable).toBe(false)
    expect(standings.gamesBehindByTeamId.size).toBe(0)
    expect(standings.warning).toContain('14 из 15')
  })

  it('does not calculate GB when the top PCT is tied', () => {
    const rows = makeStandingsRows()
    rows[1]!.record.wins = rows[0]!.record.wins
    rows[1]!.record.losses = rows[0]!.record.losses
    rows[1]!.winPercentage = rows[0]!.winPercentage
    const standings = deriveConferenceStandings(rows, 'east', seasonEndYear)

    expect(standings.gamesBehindAvailable).toBe(false)
    expect(standings.warning).toContain('равный PCT')
  })

  it('does not calculate GB when W-L and PCT contradict each other', () => {
    const rows = makeStandingsRows()
    rows[2]!.winPercentage = 0.999
    const standings = deriveConferenceStandings(rows, 'east', seasonEndYear)

    expect(standings.gamesBehindAvailable).toBe(false)
    expect(standings.warning).toContain('противоречат')
  })

  it.each([null, -0.1, 1.42, NaN, Infinity])('withholds GB with an unknown PCT (%s)', (pct) => {
    const rows = makeStandingsRows('west')
    rows[1]!.winPercentage = pct
    const standings = deriveConferenceStandings(rows, 'west', seasonEndYear)

    expect(standings.gamesBehindByTeamId.size).toBe(0)
    expect(standings.warning).toContain('W–L и PCT неполны')
  })
})

describe('sortStandingsRows', () => {
  it.each(['east', 'west'] as const)(
    'puts unknown PCT last in both directions in the %s',
    (conference) => {
      const rows = makeStandingsRows(conference, 8)
      const pcts = [1.42, -0.1, 0, null, NaN, 1, 0.5, 0.5]
      for (const [index, row] of rows.entries()) row.winPercentage = pcts[index]!
      const values = (indices: number[]) => indices.map((i) => rows[i]!.team.id)
      const sort = (direction: 'ascending' | 'descending') =>
        sortStandingsRows(rows, 'winPercentage', direction).map((row) => row.team.id)

      expect(sort('ascending')).toEqual(values([2, 6, 7, 5, 0, 1, 3, 4]))
      expect(sort('descending')).toEqual(values([5, 6, 7, 2, 0, 1, 3, 4]))
      expect(pcts.map(formatPercentage)).toEqual([
        '—',
        '—',
        '.000',
        '—',
        '—',
        '1.000',
        '.500',
        '.500',
      ])
      expect(rows.every((row) => row.officialRank === null)).toBe(true)
    },
  )

  it('uses metric sorting and an alphabetical fallback instead of provider order', () => {
    const rows = makeStandingsRows('east', 2)
    rows[0]!.providerOrder = 2
    rows[1]!.providerOrder = 1

    const sorted = sortStandingsRows(rows, 'winPercentage', 'descending')

    expect(sorted[0]!.team.id).toBe(rows[0]!.team.id)
    expect(sorted.map((row) => row.providerOrder)).toEqual([2, 1])
  })

  it('keeps unavailable sort values after known values', () => {
    const rows = makeStandingsRows('east', 2)
    rows[0]!.record.homeWins = null

    const sorted = sortStandingsRows(rows, 'homeWins', 'descending')

    expect(sorted.at(-1)?.record.homeWins).toBeNull()
  })
})
