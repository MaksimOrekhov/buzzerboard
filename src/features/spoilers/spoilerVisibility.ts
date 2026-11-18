import type { Game } from '@/entities/nba/model'
import { getDefaultNbaGameDate, shiftNbaGameDate } from '@/shared/utils/nbaDate'

export interface SpoilerWindow {
  today: string
  yesterday: string
  now: number
}
export type GameIdentity = { id: string | null; nbaGameDate: string }

export function spoilerWindow(now: number): SpoilerWindow {
  const today = getDefaultNbaGameDate(new Date(now))
  return { today, yesterday: shiftNbaGameDate(today, -1), now }
}

export function completedRowIsProtected(date: string, window: SpoilerWindow) {
  return date === window.yesterday || date === window.today
}

export function gameIsProtected(game: Game, window: SpoilerWindow) {
  if (game.nbaGameDate === window.yesterday) return true
  if (game.nbaGameDate !== window.today) return false
  if (game.score.home !== null || game.score.away !== null || game.scoreByPeriod?.length)
    return true
  if (game.status === 'postponed' || game.status === 'canceled') return false
  return (
    game.status === 'final' ||
    game.status === 'live' ||
    game.status === 'suspended' ||
    (game.startsAt !== null && Date.parse(game.startsAt) <= window.now)
  )
}

/** Only pass a timestamp that covers every constituent of this aggregate. */
export function predatesProtectedGames(
  timestamp: string | null | undefined,
  window: SpoilerWindow,
) {
  if (!timestamp || !/(Z|[+-]\d{2}:\d{2})$/.test(timestamp)) return false
  const instant = new Date(timestamp)
  return Number.isFinite(instant.getTime()) && getDefaultNbaGameDate(instant) < window.yesterday
}

export function gameRevealKey(game: GameIdentity) {
  return game.id ? JSON.stringify([game.id, game.nbaGameDate]) : null
}
