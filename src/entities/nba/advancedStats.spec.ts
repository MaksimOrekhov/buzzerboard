import { describe, expect, it } from 'vitest'
import type { PlayerBoxScore, TeamBoxScore } from './model'
import { comparePlayers, type NbaPlayerEntry, type PlayerStats } from './players'
import {
  calculateBoxScoreAdvanced,
  meetsPlayerThresholds,
  parseMinutes,
  playerBoxScoreAdvanced,
  seasonAdvancedMetric,
  teamBoxScoreAdvanced,
} from './advancedStats'

const seasonStats: PlayerStats = {
  gp: 20,
  min: 32,
  pts: 28,
  reb: 8,
  ast: 4,
  fgm: 10,
  fga: 20,
  fg: 0.5,
  threeM: 3,
  threeA: 7,
  three: 3 / 7,
  ftm: 5,
  fta: 6,
  ft: 5 / 6,
  stl: 1,
  blk: 1,
  oreb: 2,
  dreb: 6,
  tov: 2,
  pf: 3,
}

const line = {
  points: 28,
  fieldGoals: { made: 10, attempted: 20, percentage: 0.5 },
  threePointers: { made: 3, attempted: 7, percentage: 3 / 7 },
  freeThrows: { made: 5, attempted: 6, percentage: 5 / 6 },
  rebounds: 8,
  offensiveRebounds: 2,
  defensiveRebounds: 6,
  assists: 4,
  steals: 1,
  blocks: 1,
  turnovers: 2,
  fouls: 3,
} as const

const playerBox: PlayerBoxScore = {
  player: {
    id: 'bbs:player:00000000-0000-4000-8000-000000000001' as PlayerBoxScore['player']['id'],
    provider: 'bbs',
    providerId: '00000000-0000-4000-8000-000000000001' as PlayerBoxScore['player']['providerId'],
    displayName: 'Test Player',
    teamId: 'nba:team:BOS' as PlayerBoxScore['player']['teamId'],
  },
  starter: true,
  didNotPlay: false,
  minutes: '36:00',
  ...line,
  plusMinus: 2,
}

const teamBox: TeamBoxScore = {
  team: playerBox.player.teamId
    ? ({
        id: playerBox.player.teamId,
        providerId: null,
        abbreviation: 'BOS',
        displayName: 'Boston Celtics',
      } as TeamBoxScore['team'])
    : (null as never),
  ...line,
  plusMinus: 0,
}

describe('Advanced Stats v1 calculations', () => {
  it('calculates eFG% and estimated TS% from season averages and verified box lines', () => {
    expect(seasonAdvancedMetric(seasonStats, 'efg')).toBe(0.575)
    expect(seasonAdvancedMetric(seasonStats, 'ts')).toBeCloseTo(28 / (2 * (20 + 0.44 * 6)), 12)
    expect(playerBoxScoreAdvanced(playerBox, 'efg')).toBe(0.575)
    expect(playerBoxScoreAdvanced(playerBox, 'ts')).toBeCloseTo(28 / (2 * (20 + 0.44 * 6)), 12)
    expect(teamBoxScoreAdvanced(teamBox, 'efg')).toBe(0.575)
    expect(teamBoxScoreAdvanced(teamBox, 'ts')).toBeCloseTo(28 / (2 * (20 + 0.44 * 6)), 12)
  })

  it('calculates assist, three-point, free-throw, and optional two-point rates', () => {
    expect(seasonAdvancedMetric(seasonStats, 'astTo')).toBe(2)
    expect(seasonAdvancedMetric(seasonStats, 'threeRate')).toBe(7 / 20)
    expect(seasonAdvancedMetric(seasonStats, 'freeThrowRate')).toBe(6 / 20)
    expect(seasonAdvancedMetric(seasonStats, 'twoPoint')).toBe(7 / 13)
  })

  it('uses rounded per-game means directly without pretending they are exact season totals', () => {
    const rounded = { ...seasonStats, gp: 2, fgm: 10, fga: 9.9, threeM: 3.2, threeA: 3.3 }
    expect(seasonAdvancedMetric(rounded, 'efg')).toBe((10 + 0.5 * 3.2) / 9.9)
    expect(seasonAdvancedMetric({ ...rounded, gp: 80 }, 'efg')).toBe(
      seasonAdvancedMetric(rounded, 'efg'),
    )
    expect(
      calculateBoxScoreAdvanced(
        {
          ...line,
          fieldGoals: { made: 10, attempted: 9.9 },
          threePointers: { made: 3, attempted: 3.3 },
        },
        'efg',
      ),
    ).toBeNull()
    expect(
      calculateBoxScoreAdvanced(
        {
          ...line,
          fieldGoals: { made: 10, attempted: 9.9 },
          threePointers: { made: 3, attempted: 3.3 },
        },
        'efg',
        { precision: 'rounded' },
      ),
    ).toBeCloseTo((10 + 0.5 * 3) / 9.9, 12)
  })

  it('computes rates from only their required inputs and rejects known contradictions', () => {
    expect(
      calculateBoxScoreAdvanced(
        {
          ...line,
          fieldGoals: { made: null, attempted: 20 },
          freeThrows: { made: null, attempted: 6 },
        },
        'ts',
      ),
    ).toBeCloseTo(28 / (2 * (20 + 0.44 * 6)), 12)
    expect(
      calculateBoxScoreAdvanced(
        {
          ...line,
          fieldGoals: { made: null, attempted: 20 },
          threePointers: { made: null, attempted: 7 },
        },
        'threeRate',
      ),
    ).toBe(7 / 20)
    expect(
      calculateBoxScoreAdvanced(
        {
          ...line,
          fieldGoals: { made: null, attempted: 20 },
          freeThrows: { made: null, attempted: 6 },
        },
        'freeThrowRate',
      ),
    ).toBe(6 / 20)
    expect(
      calculateBoxScoreAdvanced(
        {
          ...line,
          fieldGoals: { made: -1, attempted: 20 },
          freeThrows: { made: null, attempted: 6 },
        },
        'ts',
      ),
    ).toBeNull()
    expect(
      calculateBoxScoreAdvanced(
        {
          ...line,
          fieldGoals: { made: 10, attempted: 20 },
          threePointers: { made: 4, attempted: null },
        },
        'efg',
      ),
    ).toBe(0.6)
    expect(
      calculateBoxScoreAdvanced(
        {
          ...line,
          fieldGoals: { made: 10, attempted: 20 },
          threePointers: { made: 4, attempted: 21 },
        },
        'threeRate',
      ),
    ).toBeNull()
  })

  it('rejects impossible derived two-point makes and attempts without clamping', () => {
    expect(
      calculateBoxScoreAdvanced(
        {
          ...line,
          fieldGoals: { made: 9, attempted: 10 },
          threePointers: { made: 0, attempted: 8 },
        },
        'twoPoint',
      ),
    ).toBeNull()
    expect(
      calculateBoxScoreAdvanced(
        {
          ...line,
          fieldGoals: { made: 9, attempted: 10 },
          threePointers: { made: 10, attempted: 8 },
        },
        'twoPoint',
      ),
    ).toBeNull()
  })

  it('calculates the hand-checked Game Score and allows a negative result', () => {
    expect(seasonAdvancedMetric(seasonStats, 'gmSc')).toBeCloseTo(22.1, 12)
    expect(playerBoxScoreAdvanced(playerBox, 'gmSc')).toBeCloseTo(22.1, 12)
    expect(
      calculateBoxScoreAdvanced(
        {
          points: 0,
          fieldGoals: { made: 0, attempted: 20 },
          threePointers: { made: 0, attempted: 0 },
          freeThrows: { made: 0, attempted: 10 },
          rebounds: 0,
          offensiveRebounds: 0,
          defensiveRebounds: 0,
          assists: 0,
          steals: 0,
          blocks: 0,
          turnovers: 10,
          fouls: 6,
        },
        'gmSc',
      ),
    ).toBeCloseTo(-30.4, 12)
  })

  it('keeps zero values distinct from missing and makes AST/TO undefined at zero turnovers', () => {
    expect(seasonAdvancedMetric({ ...seasonStats, ast: null }, 'astTo')).toBeNull()
    expect(seasonAdvancedMetric({ ...seasonStats, tov: 0 }, 'astTo')).toBeNull()
    expect(seasonAdvancedMetric({ ...seasonStats, ast: 0, tov: 2 }, 'astTo')).toBe(0)
    expect(seasonAdvancedMetric({ ...seasonStats, gp: 0 }, 'gmSc')).toBeNull()
    expect(seasonAdvancedMetric({ ...seasonStats, pts: null }, 'ts')).toBeNull()
  })

  it('does not invent rates for DNP or invalid shooting input', () => {
    expect(playerBoxScoreAdvanced({ ...playerBox, didNotPlay: true }, 'efg')).toBeNull()
    expect(
      calculateBoxScoreAdvanced({ ...line, fieldGoals: { made: -1, attempted: 20 } }, 'efg'),
    ).toBeNull()
    expect(
      calculateBoxScoreAdvanced({ ...line, threePointers: { made: 4, attempted: 21 } }, 'efg'),
    ).toBeNull()
    expect(
      calculateBoxScoreAdvanced({ ...line, freeThrows: { made: 7, attempted: 6 } }, 'ts'),
    ).toBeNull()
  })

  it('keeps legitimate values above 100% and returns null for zero denominators', () => {
    expect(
      calculateBoxScoreAdvanced(
        {
          ...line,
          fieldGoals: { made: 20, attempted: 20 },
          threePointers: { made: 20, attempted: 20 },
        },
        'efg',
      ),
    ).toBe(1.5)
    expect(
      calculateBoxScoreAdvanced(
        {
          ...line,
          points: 3,
          fieldGoals: { made: 1, attempted: 1 },
          threePointers: { made: 1, attempted: 1 },
          freeThrows: { made: 0, attempted: 0 },
        },
        'ts',
      ),
    ).toBe(1.5)
    expect(
      calculateBoxScoreAdvanced(
        {
          ...line,
          fieldGoals: { made: 0, attempted: 0 },
          threePointers: { made: 0, attempted: 0 },
        },
        'threeRate',
      ),
    ).toBeNull()
    expect(
      calculateBoxScoreAdvanced(
        { ...line, fieldGoals: { made: 0, attempted: 0 }, freeThrows: { made: 0, attempted: 0 } },
        'freeThrowRate',
      ),
    ).toBeNull()
    expect(
      calculateBoxScoreAdvanced(
        { ...line, freeThrows: { made: 0, attempted: 30 } },
        'freeThrowRate',
      ),
    ).toBe(1.5)
  })

  it('calculates per-36 rates only from complete season minutes and GP', () => {
    expect(seasonAdvancedMetric(seasonStats, 'pts36')).toBe(31.5)
    expect(seasonAdvancedMetric({ ...seasonStats, min: 0 }, 'pts36')).toBeNull()
    expect(seasonAdvancedMetric({ ...seasonStats, gp: 0 }, 'pts36')).toBeNull()
    expect(seasonAdvancedMetric({ ...seasonStats, min: null }, 'pts36')).toBeNull()
  })

  it('parses MM:SS and decimal minutes without accepting invalid values', () => {
    expect(parseMinutes('35:30')).toBe(35.5)
    expect(parseMinutes('35:5')).toBeCloseTo(35 + 5 / 60, 12)
    expect(parseMinutes('35.5')).toBe(35.5)
    expect(parseMinutes(0)).toBe(0)
    expect(parseMinutes('35:75')).toBeNull()
    expect(parseMinutes('-1')).toBeNull()
    expect(parseMinutes(null)).toBeNull()
  })

  it('applies optional sample thresholds while preserving the unfiltered default', () => {
    expect(meetsPlayerThresholds(null, {})).toBe(true)
    expect(meetsPlayerThresholds(seasonStats, { gp: 15, minutes: 30, fga: 18 })).toBe(true)
    expect(meetsPlayerThresholds(seasonStats, { gp: 21 })).toBe(false)
    expect(meetsPlayerThresholds(seasonStats, { minutes: 33 })).toBe(false)
    expect(meetsPlayerThresholds(seasonStats, { fga: 21 })).toBe(false)
    expect(meetsPlayerThresholds(null, { fga: 1 })).toBe(false)
  })

  it('sorts the full 645-row synthetic catalog by unrounded values and keeps missing values last', () => {
    const rows: NbaPlayerEntry[] = Array.from({ length: 645 }, (_, index) => ({
      id: `player-${index}`,
      name: `Player ${index.toString().padStart(3, '0')}`,
      team: null,
      position: null,
      number: null,
      height: null,
      weight: null,
      stats:
        index === 644 ? null : { ...seasonStats, fgm: index / 100, fga: 20, threeM: 0, threeA: 0 },
    }))
    const sorted = [...rows].sort((left, right) =>
      comparePlayers(left, right, 'efg', false, seasonAdvancedMetric),
    )
    expect(sorted).toHaveLength(645)
    expect(sorted.at(-1)?.stats).toBeNull()
    expect(sorted.at(0)?.id).toBe('player-643')
    const ascending = [...rows].sort((left, right) =>
      comparePlayers(left, right, 'efg', true, seasonAdvancedMetric),
    )
    expect(ascending.at(-1)?.stats).toBeNull()
    expect(ascending.at(0)?.id).toBe('player-0')
    expect(rows.at(0)?.id).toBe('player-0')
  })
})
