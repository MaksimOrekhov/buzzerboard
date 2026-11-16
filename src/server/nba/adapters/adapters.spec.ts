import fixtures from '../../../../docs/fixtures/nba-normalization-fixtures.json'
import { describe, expect, it } from 'vitest'

import { mapHttpStatusToNbaError, NbaAdapterError } from './errors'
import { dunkApiAdapter } from './dunkApi'
import { espnAdapter } from './espn'
import { nbaProviderAdapters } from './index'
import { createGameId, createPlayer, createTeam, readIdentifier } from './normalizers/primitives'
import { resolveProviderForCapability } from './adapter'

const context = { fetchedAt: '2026-11-16T12:00:00.000Z', stale: false }

function normalizeGames(
  adapter: typeof dunkApiAdapter | typeof espnAdapter,
  payload: unknown,
  normalizationContext = context,
) {
  const capability = adapter.capabilities.games
  if (!capability) throw new Error(`${adapter.provider} does not normalize games`)
  return capability.normalize(payload, normalizationContext)
}

function normalizeStandings(
  adapter: typeof dunkApiAdapter | typeof espnAdapter,
  payload: unknown,
  normalizationContext = context,
) {
  const capability = adapter.capabilities.standings
  if (!capability) throw new Error(`${adapter.provider} does not normalize standings`)
  return capability.normalize(payload, normalizationContext)
}

describe('DunkAPI adapter', () => {
  it('normalizes final and scheduled games without filling missing scores or period data', () => {
    const snapshot = normalizeGames(dunkApiAdapter, fixtures.dunkapi.gamesResponse)
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
    const snapshot = normalizeStandings(dunkApiAdapter, fixtures.dunkapi.standingsResponse)
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
    const snapshot = normalizeGames(dunkApiAdapter, responseWithBadRow)

    expect(snapshot.data).toHaveLength(1)
    expect(snapshot.meta.rejectedRecords).toBe(1)
    expect(() => normalizeGames(dunkApiAdapter, { games: 'not-an-array' })).toThrow(NbaAdapterError)
  })

  it('derives only a missing NBA date from a valid UTC instant and preserves missing timestamps', () => {
    const source = fixtures.dunkapi.gamesResponse.data.games[0]
    const snapshot = normalizeGames(
      dunkApiAdapter,
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
    const snapshot = normalizeGames(espnAdapter, fixtures.espn.scoreboardResponse)
    const [live, postponed, final] = snapshot.data

    expect(live).toMatchObject({
      seasonEndYear: 2027,
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

  it.each([
    ['STATUS_HALFTIME', 'in', 'Halftime'],
    ['STATUS_END_PERIOD', 'in', 'End of Period'],
  ])('keeps ESPN %s games live when its separate state is %s', (name, state, description) => {
    const source = fixtures.espn.scoreboardResponse.events[0]
    const snapshot = normalizeGames(espnAdapter, {
      events: [{ ...source, status: { type: { name, state, description } } }],
    })

    expect(snapshot.data[0]?.status).toBe('live')
  })

  it.each([
    ['STATUS_POSTPONED', 'pre', 'Scheduled', 'postponed'],
    ['STATUS_CANCELED', 'pre', 'Scheduled', 'canceled'],
  ] as const)(
    'prioritizes ESPN %s over the generic %s state and description',
    (name, state, description, expected) => {
      const source = fixtures.espn.scoreboardResponse.events[0]
      const snapshot = normalizeGames(espnAdapter, {
        events: [{ ...source, status: { type: { name, state, description } } }],
      })

      expect(snapshot.data[0]?.status).toBe(expected)
    },
  )

  it('normalizes team ids across providers while namespacing provider game ids', () => {
    const dunk = normalizeGames(dunkApiAdapter, fixtures.dunkapi.gamesResponse)
    const espn = normalizeGames(espnAdapter, fixtures.espn.scoreboardResponse)

    expect(espn.data[0]?.homeTeam.id).toBe(dunk.data[0]?.homeTeam.id)
    expect(espn.data[0]?.awayTeam.id).toBe(dunk.data[0]?.awayTeam.id)
    expect(espn.data[0]?.nbaGameDate).toBe(dunk.data[0]?.nbaGameDate)
    expect(espn.data[0]?.id).not.toBe(dunk.data[0]?.id)
    expect(dunk.data[0]?.id).toBe('dunkapi:game:dunk-game-001')
    expect(espn.data[0]?.id).toBe('espn:game:espn-game-live')
  })

  it('normalizes standings but does not synthesize rank or missing values', () => {
    const snapshot = normalizeStandings(espnAdapter, fixtures.espn.standingsResponse)
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

  it('does not normalize average points or an unverified differential as season totals', () => {
    const snapshot = normalizeStandings(espnAdapter, {
      season: { year: 2027, type: 2, slug: 'regular-season' },
      children: [
        {
          name: 'Eastern Conference',
          standings: {
            entries: [
              {
                team: { id: '2', abbreviation: 'BOS', displayName: 'Boston Celtics' },
                stats: [
                  { name: 'avgPointsFor', value: 115 },
                  { name: 'avgPointsAgainst', value: 110 },
                  { name: 'pointDifferential', value: 5 },
                  { name: 'averageMargin', value: 4.5 },
                ],
              },
            ],
          },
        },
      ],
    })

    expect(snapshot.data[0]).toMatchObject({
      seasonEndYear: 2027,
      record: {
        pointsFor: null,
        pointsAgainst: null,
        averageMargin: 4.5,
      },
    })
  })
})

describe('capability-specific provider selection and identity safety', () => {
  it('selects providers independently per capability and has no implicit fallback', () => {
    const adapters = Object.values(nbaProviderAdapters)
    const selected = {
      games: ['espn', 'dunkapi'],
      standings: ['dunkapi', 'espn'],
    } as const

    expect(resolveProviderForCapability('games', selected, adapters)?.provider).toBe('espn')
    expect(resolveProviderForCapability('standings', selected, adapters)?.provider).toBe('dunkapi')
    expect(resolveProviderForCapability('games', {}, adapters)).toBeNull()
    expect(
      resolveProviderForCapability('liveScores', { liveScores: ['dunkapi', 'espn'] }, adapters),
    ).toBeNull()
  })

  it('maps teams only through recognized abbreviations and keeps game/player ids source-scoped', () => {
    const dunkTeam = createTeam('dunkapi', 'shared-raw-id', 'GS', 'Golden State Warriors')
    const espnTeam = createTeam('espn', 'shared-raw-id', 'GSW', 'Golden State Warriors')
    const conflictingTeam = createTeam('espn', 'shared-raw-id', 'BOS', 'Boston Celtics')
    const unknownDunkTeam = createTeam('dunkapi', 'unknown-id', 'XYZ', 'Unknown')
    const unknownEspnTeam = createTeam('espn', 'unknown-id', 'XYZ', 'Unknown')
    const providerGameId = readIdentifier('shared-game-id')
    const providerPlayerId = readIdentifier('shared-player-id')

    expect(dunkTeam?.id).toBe('nba:team:GSW')
    expect(espnTeam?.id).toBe(dunkTeam?.id)
    expect(conflictingTeam?.id).not.toBe(dunkTeam?.id)
    expect(unknownDunkTeam?.id).not.toBe(unknownEspnTeam?.id)
    expect(createGameId('dunkapi', providerGameId!)).not.toBe(createGameId('espn', providerGameId!))
    expect(createPlayer('dunkapi', providerPlayerId, 'Player', dunkTeam?.id ?? null)?.id).not.toBe(
      createPlayer('espn', providerPlayerId, 'Player', espnTeam?.id ?? null)?.id,
    )
    expect(createPlayer('dunkapi', null, 'Player')).toBeNull()
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
