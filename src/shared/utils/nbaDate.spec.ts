import timezoneFixtures from '../../../docs/fixtures/dunkapi-timezone-cases.json'
import { describe, expect, it } from 'vitest'

import {
  getDateKeyInTimeZone,
  getDefaultNbaGameDate,
  getViewerGameDate,
  VIEWER_TIME_ZONE,
} from './nbaDate'

describe('NBA and viewer game dates', () => {
  it.each(timezoneFixtures.cases)(
    '$name keeps NBA game day separate from the viewer and Nicosia calendar dates',
    ({ startsAt, nbaGameDate, nicosiaDate }) => {
      const instant = new Date(startsAt)
      expect(getDefaultNbaGameDate(instant)).toBe(nbaGameDate)
      expect(getViewerGameDate(instant)).toBe(getDateKeyInTimeZone(instant, VIEWER_TIME_ZONE))
      expect(getDateKeyInTimeZone(instant, 'Europe/Nicosia')).toBe(nicosiaDate)
    },
  )
})
