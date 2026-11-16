export const NBA_TIME_ZONE = 'America/New_York'
export const VIEWER_TIME_ZONE = 'Europe/Nicosia'

export function getDateKeyInTimeZone(instant: Date, timeZone: string): string {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('Cannot format an invalid date')
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const dateParts = Object.fromEntries(parts.map(({ type, value }) => [type, value]))

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`
}

export function getDefaultNbaGameDate(now: Date = new Date()): string {
  return getDateKeyInTimeZone(now, NBA_TIME_ZONE)
}

export function getViewerGameDate(startsAt: string | Date): string {
  const instant = startsAt instanceof Date ? startsAt : new Date(startsAt)

  return getDateKeyInTimeZone(instant, VIEWER_TIME_ZONE)
}
