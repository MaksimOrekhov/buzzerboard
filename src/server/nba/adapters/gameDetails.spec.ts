import fixture from '../../../../docs/fixtures/game-details.synthetic.json'
import baseFixture from '../../../../docs/fixtures/nba-normalization-fixtures.json'
import { describe, expect, it } from 'vitest'
import { normalizeDunkGameDetails } from './gameDetails'
import { dunkApiAdapter } from './dunkApi'

const context = { fetchedAt: '2026-11-17T12:00:00.000Z', stale: false }
const normalizeBase = dunkApiAdapter.capabilities.games
if (!normalizeBase) throw new Error('DunkAPI game normalizer not configured')
const game = normalizeBase.normalize(baseFixture.dunkapi.gamesResponse, context).data[0]!

describe('DunkAPI game details adapter', () => {
  it('normalizes the verified game and team IDs, nullable values, and DNP lines', () => {
    const result = normalizeDunkGameDetails(fixture, game)

    expect(result.game.id).toBe(game.id)
    expect(result.teams.map((team) => team.team.providerId)).toEqual(['20', '9'])
    expect(result.teams[0]?.fieldGoals).toEqual({ made: 36, attempted: 80, percentage: 0.45 })
    expect(result.players[0]).toMatchObject({
      player: { providerId: 'fixture-player-1', teamId: game.homeTeam.id },
      starter: true,
      minutes: '35:12',
      points: 24,
    })
    expect(result.players[1]).toMatchObject({
      didNotPlay: true,
      minutes: null,
      points: null,
      rebounds: null,
    })
  })

  it('keeps omitted metrics nullable instead of converting them to zero', () => {
    const partial = structuredClone(fixture)
    Reflect.deleteProperty(partial.data.team_stats[0]!, 'stl')
    Reflect.deleteProperty(partial.data.players[0]!, 'ast')
    const result = normalizeDunkGameDetails(partial, game)

    expect(result.teams[0]?.steals).toBeNull()
    expect(result.players[0]?.assists).toBeNull()
  })

  it.each([
    [
      'another game id',
      (payload: typeof fixture) => {
        payload.data.game.game_id = 'other-game'
      },
    ],
    [
      'cross-team player row',
      (payload: typeof fixture) => {
        payload.data.players[0]!.team_id = 'not-a-game-team'
      },
    ],
    [
      'score mismatch',
      (payload: typeof fixture) => {
        payload.data.team_stats[0]!.pts = 77
      },
    ],
    [
      'duplicate player id',
      (payload: typeof fixture) => {
        payload.data.players.push({ ...payload.data.players[0]! })
      },
    ],
  ])('rejects %s without publishing a partial box score', (_label, mutate) => {
    const invalid = structuredClone(fixture)
    mutate(invalid)
    expect(() => normalizeDunkGameDetails(invalid, game)).toThrow()
  })
})
