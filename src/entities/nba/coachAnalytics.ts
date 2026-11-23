import { getDefaultNbaGameDate } from '@/shared/utils/nbaDate'
import {
  appointmentCoversDate,
  validCoachingDate,
  type CoachingAssignment,
} from './coachingDirectory'
import { NBA_TEAMS } from './teamCatalog'

interface ScheduledGame {
  date: string
  homeTeamId: string
  awayTeamId: string
}

interface CachedGame extends ScheduledGame {
  id: string
  startsAt: string
  seasonEndYear: number
  status: string
  homePoints: number
  awayPoints: number
}

/** A manually verified, closed regular-season window with an independent schedule comparison. */
export interface CoachGameWindow {
  teamId: string
  source: 'd1'
  stage: 'regular-season'
  from: string
  through: string
  asOf: string
  seasonEndYear: number
  scheduleUrl: string
  expected: readonly ScheduledGame[]
  games: readonly CachedGame[]
}

interface RecordSplit {
  wins: number
  losses: number
}

const teamIds = new Set<string>(NBA_TEAMS.map(({ team }) => team.id))

function dateInSeason(date: string, seasonEndYear: number) {
  return (
    validCoachingDate(date) &&
    date >= `${seasonEndYear - 1}-08-01` &&
    date < `${seasonEndYear}-08-01`
  )
}

export function calculateCoachRecord(
  appointment: CoachingAssignment,
  window: CoachGameWindow | null,
  appointmentVerifiedAt: string,
) {
  if (
    !window ||
    window.source !== 'd1' ||
    window.stage !== 'regular-season' ||
    appointment.role !== 'head-coach' ||
    window.teamId !== appointment.teamId ||
    !/^https:\/\/(?:[a-z0-9-]+\.)*nba\.com\//.test(window.scheduleUrl) ||
    !Number.isInteger(window.seasonEndYear) ||
    !dateInSeason(window.from, window.seasonEndYear) ||
    !dateInSeason(window.through, window.seasonEndYear) ||
    !validCoachingDate(window.asOf) ||
    window.through >= window.asOf ||
    !validCoachingDate(appointmentVerifiedAt) ||
    window.through > appointmentVerifiedAt ||
    window.from > window.through ||
    !appointmentCoversDate(appointment, window.from) ||
    !appointmentCoversDate(appointment, window.through) ||
    !window.expected.length ||
    window.expected.length !== window.games.length
  )
    return null

  const key = (g: ScheduledGame) => `${g.date}/${g.homeTeamId}/${g.awayTeamId}`
  const remaining = new Set(window.expected.map(key))
  const gameIds = new Set<string>()
  if (remaining.size !== window.expected.length) return null
  const home: RecordSplit = { wins: 0, losses: 0 }
  const away: RecordSplit = { wins: 0, losses: 0 }
  const monthly = new Map<string, RecordSplit>()
  for (const game of window.games) {
    const atHome = game.homeTeamId === window.teamId
    const tipoff = new Date(game.startsAt)
    if (
      !remaining.delete(key(game)) ||
      !game.id.trim() ||
      gameIds.has(game.id) ||
      !teamIds.has(game.homeTeamId) ||
      !teamIds.has(game.awayTeamId) ||
      game.homeTeamId === game.awayTeamId ||
      (!atHome && game.awayTeamId !== window.teamId) ||
      game.date < window.from ||
      game.date > window.through ||
      !validCoachingDate(game.date) ||
      game.seasonEndYear !== window.seasonEndYear ||
      game.status !== 'final' ||
      !/(?:Z|[+-]\d\d:\d\d)$/.test(game.startsAt) ||
      !Number.isFinite(+tipoff) ||
      getDefaultNbaGameDate(tipoff) !== game.date ||
      ![game.homePoints, game.awayPoints].every(
        (points) => Number.isSafeInteger(points) && points > 0,
      ) ||
      game.homePoints === game.awayPoints
    )
      return null
    gameIds.add(game.id)
    const split = atHome ? home : away
    const month = game.date.slice(0, 7)
    const period = monthly.get(month) ?? { wins: 0, losses: 0 }
    const homeWon = game.homePoints > game.awayPoints
    const outcome = atHome === homeWon ? 'wins' : 'losses'
    split[outcome] += 1
    period[outcome] += 1
    monthly.set(month, period)
  }

  const wins = home.wins + away.wins
  const losses = home.losses + away.losses
  const gp = wins + losses
  return {
    wins,
    losses,
    gp,
    winRate: wins / gp,
    home,
    away,
    months: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)),
    from: window.from,
    through: window.through,
    scheduleUrl: window.scheduleUrl,
  }
}
