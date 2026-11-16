import fixtures from '../../../../docs/fixtures/nba-normalization-fixtures.json'
import { describe, expect, it } from 'vitest'

import { mapHttpStatusToNbaError, NbaAdapterError } from './errors'
import { dunkApiAdapter } from './dunkApi'
import { espnAdapter } from './espn'

const context = { fetchedAt: '2026-11-16T12:00:00.000Z', stale: false }

describe('DunkAPI adapter', () => {
  it('normalizes final and scheduled games without filling missing scores or period data', () => {
    const snapshot = dunkApiAdapter.normalizeGames(fixtures.dunkapi.gamesResponse, context)
    const [final, scheduled] = snapshot.data

    expect(snapshot.meta).toMatchObject({
      provider: 'dunkapi',
      fetchedAt: '2026-11-16T12:00:00.000Z',
      providerUpdatedAt: null,
      stale: false,
      rejectedRecords: 0,
    })
    expect(final).toMatchObject({
      nbaGameDate: '2026-11-15',
      startsAt: '2026-11-16T00:30:00.000Z',
      status: 'final',
      score: { home: 112, away: 108 },
      scoreByPeriod: null,
      homeTeam: { id: 'nba:team:GSW', abbreviation: 'GSW' },
      awayTeam: { id: 'nba:team:NYK', abbreviation: 'NYK' },
    })
    expect(scheduled).toMatchObject({
      nbaGameDate: '2026-11-16',
      startsAt: '2026-11-17T00:00:00.000Z',
      status: 'scheduled',
      score: { home: null, away: null },
      scoreByPeriod: null,
    })
  })

  it('keeps zero metrics and absent rank, seed, and metrics distinct', () => {
    const snapshot = dunkApiAdapter.normalizeStandings(fixtures.dunkapi.standingsResponse, context)
    const [celtics, thunder] = snapshot.data

    expect(celtics).toMatchObject({
      seasonEndYear: 2027,
      conference: 'east',
      record: { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: null },
      winPercentage: 0,
      officialRank: null,
      playoffSeed: null,
      providerOrder: 1,
    })
    expect(thunder).toMatchObject({
      conference: 'west',
      record: { wins: 1, losses: 0, homeWins: null },
      officialRank: null,
      playoffSeed: null,
      providerOrder: 2,
    })
  })

  it('rejects malformed records and malformed top-level collections', () => {
    const responseWithBadRow = {
      games: [{ game_id: 'missing-teams' }, fixtures.dunkapi.gamesResponse.data.games[0]],
    }
    const snapshot = dunkApiAdapter.normalizeGames(responseWithBadRow, context)

    expect(snapshot.data).toHaveLength(1)
    expect(snapshot.meta.rejectedRecords).toBe(1)
    expect(() => dunkApiAdapter.normalizeGames({ games: 'not-an-array' }, context)).toThrow(
      NbaAdapterError,
    )
  })

  it('derives only a missing NBA date from a valid UTC instant and preserves missing timestamps', () => {
    const source = fixtures.dunkapi.gamesResponse.data.games[0]
    const snapshot = dunkApiAdapter.normalizeGames(
      {
        games: [
          { ...source, date: null, starts_at: '2026-11-16T00:30:00.000Z' },
          { ...source, game_id: 'missing-start', starts_at: 'not-a-timestamp' },
        ],
      },
      { ...context, stale: true },
    )

    expect(snapshot.data[0]).toMatchObject({
      nbaGameDate: '2026-11-15',
      startsAt: '2026-11-16T00:30:00.000Z',
    })
    expect(snapshot.data[1]).toMatchObject({
      nbaGameDate: '2026-11-15',
      startsAt: null,
    })
    expect(snapshot.meta.stale).toBe(true)
  })
})

describe('ESPN adapter candidate', () => {
  it('normalizes live, postponed, and final states and keeps explicit period scores', () => {
    const snapshot = espnAdapter.normalizeGames(fixtures.espn.scoreboardResponse, context)
    const [live, postponed, final] = snapshot.data

    expect(live).toMatchObject({
      nbaGameDate: '2026-11-15',
      startsAt: '2026-11-16T00:30:00.000Z',
      status: 'live',
      score: { home: 54, away: 51 },
      scoreByPeriod: [
        { period: 1, home: 24, away: 26 },
        { period: 2, home: 30, away: 25 },
      ],
    })
    expect(postponed).toMatchObject({
      status: 'postponed',
      score: { home: null, away: null },
      scoreByPeriod: null,
    })
    expect(final).toMatchObject({
      status: 'final',
      score: { home: 101, away: 99 },
    })
    expect(snapshot.meta.rejectedRecords).toBe(0)
  })

  it('normalizes team ids across providers while namespacing provider game ids', () => {
    const dunk = dunkApiAdapter.normalizeGames(fixtures.dunkapi.gamesResponse, context)
    const espn = espnAdapter.normalizeGames(fixtures.espn.scoreboardResponse, context)

    expect(espn.data[0]?.homeTeam.id).toBe(dunk.data[0]?.homeTeam.id)
    expect(espn.data[0]?.awayTeam.id).toBe(dunk.data[0]?.awayTeam.id)
    expect(espn.data[0]?.nbaGameDate).toBe(dunk.data[0]?.nbaGameDate)
    expect(espn.data[0]?.id).not.toBe(dunk.data[0]?.id)
    expect(dunk.data[0]?.id).toBe('dunkapi:game:dunk-game-001')
    expect(espn.data[0]?.id).toBe('espn:game:espn-game-live')
  })

  it('normalizes standings but does not synthesize rank or missing values', () => {
    const snapshot = espnAdapter.normalizeStandings(fixtures.espn.standingsResponse, context)
    const [row] = snapshot.data

    expect(row).toMatchObject({
      seasonEndYear: 2027,
      conference: 'east',
      record: { wins: 0, losses: 0, pointsFor: null },
      winPercentage: 0,
      officialRank: null,
      playoffSeed: null,
      providerOrder: 1,
    })
  })
})

describe('NBA API error mapping', () => {
  it.each([
    [400, 'invalid_request', false],
    [401, 'authentication', false],
    [403, 'forbidden', false],
    [404, 'not_found', false],
    [408, 'timeout', true],
    [429, 'rate_limited', true],
    [503, 'upstream_unavailable', true],
  ] as const)('maps HTTP %s to a stable internal error', (status, code, retryable) => {
    expect(mapHttpStatusToNbaError('dunkapi', status)).toMatchObject({
      code,
      retryable,
      provider: 'dunkapi',
      upstreamStatus: status,
    })
  })
})
