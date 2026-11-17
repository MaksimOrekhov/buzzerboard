import { describe, expect, it } from 'vitest'
import { safeGameReturnTo } from './gameDetailsRoute'

describe('safeGameReturnTo', () => {
  it('allows canonical team profile routes while rejecting external or nested routes', () => {
    expect(safeGameReturnTo('/teams/BOS')).toBe('/teams/BOS')
    expect(safeGameReturnTo('/teams/UTA?tab=season')).toBe('/teams/UTA?tab=season')
    expect(safeGameReturnTo('//example.com')).toBe('/games')
    expect(safeGameReturnTo('/teams/BOS/anything')).toBe('/games')
  })
})
