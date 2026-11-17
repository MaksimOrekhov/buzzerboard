import type { PlayerBoxScore } from '@/entities/nba/model'
import { describe, expect, it } from 'vitest'
import { sortPlayerLines } from './useGameDetailsModel'

function player(id: string, minutes: string | null, points: number | null): PlayerBoxScore {
  return {
    player: {
      id: `dunkapi:player:${id}` as PlayerBoxScore['player']['id'],
      provider: 'dunkapi',
      providerId: id as PlayerBoxScore['player']['providerId'],
      displayName: id,
      teamId: 'nba:team:BOS' as PlayerBoxScore['player']['teamId'],
    },
    starter: null,
    didNotPlay: false,
    minutes,
    points,
    fieldGoals: { made: null, attempted: null, percentage: null },
    threePointers: { made: null, attempted: null, percentage: null },
    freeThrows: { made: null, attempted: null, percentage: null },
    rebounds: null,
    offensiveRebounds: null,
    defensiveRebounds: null,
    assists: null,
    steals: null,
    blocks: null,
    turnovers: null,
    fouls: null,
    plusMinus: null,
  }
}

describe('game details player sort', () => {
  it('sorts descending and leaves unavailable values last', () => {
    expect(
      sortPlayerLines(
        [player('unknown', null, null), player('low', '8:00', 4), player('high', '30:00', 19)],
        'points',
        'descending',
      ).map((row) => row.player.displayName),
    ).toEqual(['high', 'low', 'unknown'])
  })

  it('sorts minutes as elapsed time, not as a decimal string', () => {
    expect(
      sortPlayerLines(
        [player('8', '8:50', null), player('12', '12:05', null)],
        'minutes',
        'descending',
      ).map((row) => row.player.displayName),
    ).toEqual(['12', '8'])
  })
})
