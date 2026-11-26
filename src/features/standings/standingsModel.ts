import type { Conference, SeasonEndYear, StandingsRow, TeamId } from '@/entities/nba/model'

export const TEAMS_PER_CONFERENCE = 15

export type StandingsSortKey =
  | 'winPercentage'
  | 'wins'
  | 'gamesBehind'
  | 'conferenceWins'
  | 'homeWins'
  | 'awayWins'
  | 'lastTenWins'
  | 'averageMargin'

export type SortDirection = 'ascending' | 'descending'

export interface ConferenceStandings {
  rows: readonly StandingsRow[]
  gamesBehindByTeamId: ReadonlyMap<TeamId, number>
  gamesBehindAvailable: boolean
  warning: string | null
}

export function knownWinPercentage(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null
}

function isCounter(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0
}

function isValidRecord(row: StandingsRow, seasonEndYear: SeasonEndYear): boolean {
  const { wins, losses } = row.record
  const winPercentage = knownWinPercentage(row.winPercentage)
  if (
    row.seasonEndYear !== seasonEndYear ||
    !isCounter(wins) ||
    !isCounter(losses) ||
    winPercentage === null
  ) {
    return false
  }

  const gamesPlayed = wins + losses
  if (gamesPlayed === 0) return false
  const calculatedPercentage = wins / gamesPlayed
  return Math.abs(calculatedPercentage - winPercentage) <= 0.001
}

export function deriveConferenceStandings(
  rows: readonly StandingsRow[],
  conference: Conference,
  seasonEndYear: SeasonEndYear,
): ConferenceStandings {
  const conferenceRows = rows.filter((row) => row.conference === conference)
  const uniqueTeamIds = new Set(conferenceRows.map((row) => row.team.id))
  const hasFullRoster =
    conferenceRows.length === TEAMS_PER_CONFERENCE && uniqueTeamIds.size === TEAMS_PER_CONFERENCE
  const hasValidRecords =
    hasFullRoster && conferenceRows.every((row) => isValidRecord(row, seasonEndYear))

  if (!hasFullRoster) {
    return {
      rows: conferenceRows,
      gamesBehindByTeamId: new Map(),
      gamesBehindAvailable: false,
      warning: `Получено ${conferenceRows.length} из ${TEAMS_PER_CONFERENCE} команд; GB не рассчитывается.`,
    }
  }

  if (!hasValidRecords) {
    return {
      rows: conferenceRows,
      gamesBehindByTeamId: new Map(),
      gamesBehindAvailable: false,
      warning: 'W–L и PCT неполны или противоречат друг другу; GB не рассчитывается.',
    }
  }

  const topPercentage = Math.max(...conferenceRows.map((row) => row.winPercentage!))
  const leaders = conferenceRows.filter(
    (row) => Math.abs(row.winPercentage! - topPercentage) <= 0.0005,
  )
  if (leaders.length !== 1) {
    return {
      rows: conferenceRows,
      gamesBehindByTeamId: new Map(),
      gamesBehindAvailable: false,
      warning: 'У лидера равный PCT; GB не рассчитывается без подтверждённого порядка.',
    }
  }

  const leader = leaders[0]!
  const gamesBehindByTeamId = new Map<TeamId, number>()
  for (const row of conferenceRows) {
    const gamesBehind =
      (leader.record.wins! - row.record.wins! + row.record.losses! - leader.record.losses!) / 2
    gamesBehindByTeamId.set(row.team.id, gamesBehind)
  }

  return {
    rows: conferenceRows,
    gamesBehindByTeamId,
    gamesBehindAvailable: true,
    warning: null,
  }
}

export function sortStandingsRows(
  rows: readonly StandingsRow[],
  sortBy: StandingsSortKey,
  direction: SortDirection,
  gamesBehindByTeamId: ReadonlyMap<TeamId, number> = new Map(),
): readonly StandingsRow[] {
  const multiplier = direction === 'descending' ? -1 : 1
  const valueFor = (row: StandingsRow): number | null => {
    switch (sortBy) {
      case 'winPercentage':
        return knownWinPercentage(row.winPercentage)
      case 'wins':
        return row.record.wins
      case 'gamesBehind':
        return gamesBehindByTeamId.get(row.team.id) ?? null
      case 'conferenceWins':
        return row.record.conferenceWins
      case 'homeWins':
        return row.record.homeWins
      case 'awayWins':
        return row.record.awayWins
      case 'lastTenWins':
        return row.record.lastTenWins
      case 'averageMargin':
        return row.record.averageMargin
    }
  }

  return [...rows].sort((left, right) => {
    const leftValue = valueFor(left)
    const rightValue = valueFor(right)
    if (leftValue === null && rightValue !== null) return 1
    if (leftValue !== null && rightValue === null) return -1
    if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
      return (leftValue - rightValue) * multiplier
    }

    return (left.team.displayName ?? left.team.abbreviation ?? left.team.id).localeCompare(
      right.team.displayName ?? right.team.abbreviation ?? right.team.id,
      'en',
    )
  })
}
