import { describe, expect, it } from 'vitest'
import {
  comparePlayers,
  formatPlayerStat,
  playerPath,
  type NbaPlayerEntry,
  type PlayerStats,
} from './players'

const entry = (id: string, gp: number | null): NbaPlayerEntry => ({
  id,
  name: id,
  team: null,
  position: null,
  number: null,
  height: null,
  weight: null,
  stats: gp === null ? null : ({ gp } as PlayerStats),
})
describe('player directory', () => {
  it.each([true, false])('keeps null after zero in both directions (%s)', (ascending) => {
    const entries = [entry('unknown', null), entry('two', 2), entry('zero', 0)]
    expect(
      entries.sort((a, b) => comparePlayers(a, b, 'gp', ascending)).map((row) => row.id),
    ).toEqual(ascending ? ['zero', 'two', 'unknown'] : ['two', 'zero', 'unknown'])
  })
  it('formats percentages, missing rates, and provider-scoped routes', () => {
    expect(formatPlayerStat('three', 0.42)).toMatch(/42\s?%/)
    expect(formatPlayerStat('fg', null)).toBe('—')
    expect(playerPath('bbs:player:test')).toBe('/players/bbs%3Aplayer%3Atest')
  })
})
