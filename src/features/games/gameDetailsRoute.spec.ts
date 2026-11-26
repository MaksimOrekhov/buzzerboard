import { describe, expect, it } from 'vitest'
import { safeGameReturnTo } from './gameDetailsRoute'

describe('safeGameReturnTo', () => {
  it('allows canonical team profile routes while rejecting external or nested routes', () => {
    expect(safeGameReturnTo('/teams/BOS')).toBe('/teams/BOS')
    expect(safeGameReturnTo('/teams/UTA?tab=season')).toBe('/teams/UTA?tab=season')
    expect(safeGameReturnTo('//example.com')).toBe('/games')
    expect(safeGameReturnTo('/teams/BOS/anything')).toBe('/games')
  })
  it('preserves a player match anchor and the originating filtered catalog', () => {
    const player = '/players/bbs%3Aplayer%3A00000000-0000-4000-8000-000000008101'
    expect(safeGameReturnTo(player + '#player-matches')).toBe(player + '#player-matches')
    const from = player + '?from=%2Fplayers%3Fq%3DLuka%26team%3DLAL#player-matches'
    expect(safeGameReturnTo(from)).toBe(from)
    expect(safeGameReturnTo('/players/%2F%2Fevil.com#player-matches')).toBe('/games')
  })
})
