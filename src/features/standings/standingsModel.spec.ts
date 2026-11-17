import { describe, expect, it } from 'vitest'

import type { SeasonEndYear } from '@/entities/nba/model'
import { deriveConferenceStandings, sortStandingsRows } from './standingsModel'
import { makeStandingsRows } from './standingsTestData'

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
})

describe('sortStandingsRows', () => {
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
