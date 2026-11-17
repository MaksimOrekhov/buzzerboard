import type { PlayerBoxScore } from '@/entities/nba/model'
import { describe, expect, it } from 'vitest'
import { sortPlayerLines } from './useGameDetailsModel'

function player(
  id: string,
  minutes: string | null,
  points: number | null,
  plusMinus: number | null = null,
): PlayerBoxScore {
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
    plusMinus,
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

  it.each([
    ['descending', ['12:05', '8.5', '0', null]],
    ['ascending', ['0', '8.5', '12:05', null]],
  ] as const)(
    'sorts mixed minute formats in seconds and keeps zero last only when appropriate (%s)',
    (direction, expected) => {
      const players = [
        player('decimal', '8.5', null),
        player('clock', '12:05', null),
        player('zero', '0', null),
        player('missing', null, null),
      ]
      expect(sortPlayerLines(players, 'minutes', direction).map((row) => row.minutes)).toEqual(
        expected,
      )
    },
  )

  it.each([
    ['descending', ['positive', 'minus-one', 'negative', 'unknown']],
    ['ascending', ['negative', 'minus-one', 'positive', 'unknown']],
  ] as const)(
    'sorts negative +/- values and leaves null last in both directions (%s)',
    (direction, expected) => {
      const players = [
        player('unknown', '0', null, null),
        player('negative', '0', null, -8),
        player('minus-one', '0', null, -1),
        player('positive', '0', null, 4),
      ]
      expect(
        sortPlayerLines(players, 'plusMinus', direction).map((row) => row.player.displayName),
      ).toEqual(expected)
    },
  )

  it('orders two null values deterministically by player identity', () => {
    expect(
      sortPlayerLines(
        [player('zulu', '0', null), player('alpha', '0', null)],
        'points',
        'descending',
      ).map((row) => row.player.displayName),
    ).toEqual(['alpha', 'zulu'])
  })
})
