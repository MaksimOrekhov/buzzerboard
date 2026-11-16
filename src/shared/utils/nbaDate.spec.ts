import timezoneFixtures from '../../../docs/fixtures/dunkapi-timezone-cases.json'
import { describe, expect, it } from 'vitest'

import { getDefaultNbaGameDate, getViewerGameDate } from './nbaDate'

describe('NBA and viewer game dates', () => {
  it.each(timezoneFixtures.cases)(
    '$name keeps NBA game day separate from the Nicosia calendar date',
    ({ startsAt, nbaGameDate, nicosiaDate }) => {
      expect(getDefaultNbaGameDate(new Date(startsAt))).toBe(nbaGameDate)
      expect(getViewerGameDate(startsAt)).toBe(nicosiaDate)
    },
  )
})
