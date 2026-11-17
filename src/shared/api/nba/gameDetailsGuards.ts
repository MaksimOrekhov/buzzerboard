import type {
  Game,
  GameBoxScore,
  GameStatus,
  PlayerBoxScore,
  Team,
  TeamBoxScore,
} from '@/entities/nba/model'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isNbaDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function isTeamRecord(value: unknown): value is Team {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.providerId === null || typeof value.providerId === 'string') &&
    (value.abbreviation === null || typeof value.abbreviation === 'string') &&
    (value.displayName === null || typeof value.displayName === 'string')
  )
}

export function isGameRecord(value: unknown): value is Game {
  const statuses: readonly GameStatus[] = [
    'scheduled',
    'live',
    'final',
    'postponed',
    'canceled',
    'suspended',
    'unknown',
  ]
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    (value.provider !== 'dunkapi' && value.provider !== 'espn' && value.provider !== 'bbs') ||
    typeof value.providerId !== 'string' ||
    !isNbaDate(value.nbaGameDate) ||
    (value.seasonEndYear !== null && typeof value.seasonEndYear !== 'number') ||
    (value.startsAt !== null && typeof value.startsAt !== 'string') ||
    !statuses.includes(value.status as GameStatus) ||
    !isTeamRecord(value.homeTeam) ||
    !isTeamRecord(value.awayTeam) ||
    !isRecord(value.score) ||
    !isNullableNumber(value.score.home) ||
    !isNullableNumber(value.score.away) ||
    (value.venue !== null && typeof value.venue !== 'string')
  )
    return false
  if (value.scoreByPeriod === null) return true
  return (
    Array.isArray(value.scoreByPeriod) &&
    value.scoreByPeriod.every(
      (period) =>
        isRecord(period) &&
        Number.isSafeInteger(period.period) &&
        isNullableNumber(period.home) &&
        isNullableNumber(period.away),
    )
  )
}

function isShootingLine(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNullableNumber(value.made) &&
    isNullableNumber(value.attempted) &&
    isNullableNumber(value.percentage)
  )
}

function hasBoxScoreMetrics(value: Record<string, unknown>): boolean {
  return (
    [
      'points',
      'rebounds',
      'offensiveRebounds',
      'defensiveRebounds',
      'assists',
      'steals',
      'blocks',
      'turnovers',
      'fouls',
    ].every((key) => isNullableNumber(value[key])) &&
    isNullableNumber(value.plusMinus) &&
    isShootingLine(value.fieldGoals) &&
    isShootingLine(value.threePointers) &&
    isShootingLine(value.freeThrows)
  )
}

function isTeamBoxScore(value: unknown): value is TeamBoxScore {
  return isRecord(value) && isTeamRecord(value.team) && hasBoxScoreMetrics(value)
}

function isPlayerBoxScore(value: unknown): value is PlayerBoxScore {
  if (!isRecord(value) || !isRecord(value.player)) return false
  const player = value.player
  return (
    typeof player.id === 'string' &&
    (player.provider === 'dunkapi' || player.provider === 'espn' || player.provider === 'bbs') &&
    typeof player.providerId === 'string' &&
    (player.displayName === null || typeof player.displayName === 'string') &&
    (player.teamId === null || typeof player.teamId === 'string') &&
    (value.starter === null || typeof value.starter === 'boolean') &&
    typeof value.didNotPlay === 'boolean' &&
    (value.minutes === null || typeof value.minutes === 'string') &&
    hasBoxScoreMetrics(value)
  )
}

export function isSameFinalGameSnapshot(left: Game, right: Game): boolean {
  return (
    left.id === right.id &&
    left.provider === right.provider &&
    left.providerId === right.providerId &&
    left.nbaGameDate === right.nbaGameDate &&
    left.status === 'final' &&
    right.status === 'final' &&
    left.homeTeam.id === right.homeTeam.id &&
    left.homeTeam.providerId === right.homeTeam.providerId &&
    left.awayTeam.id === right.awayTeam.id &&
    left.awayTeam.providerId === right.awayTeam.providerId &&
    left.score.home === right.score.home &&
    left.score.away === right.score.away
  )
}

export function isGameBoxScoreForGame(value: unknown, game: Game): value is GameBoxScore {
  if (
    !isRecord(value) ||
    !isGameRecord(value.game) ||
    !isSameFinalGameSnapshot(value.game, game) ||
    !Array.isArray(value.teams) ||
    value.teams.length !== 2 ||
    !Array.isArray(value.players) ||
    !value.teams.every(isTeamBoxScore) ||
    !value.players.every(isPlayerBoxScore)
  )
    return false

  const expectedTeams = [game.homeTeam, game.awayTeam]
  const expectedTeamIds = new Set(expectedTeams.map((team) => team.id))
  const teamIds = value.teams.map((team) => team.team.id)
  if (
    new Set(teamIds).size !== 2 ||
    teamIds.some((id) => !expectedTeamIds.has(id)) ||
    value.teams.some((boxTeam) => {
      const gameTeam = expectedTeams.find((team) => team.id === boxTeam.team.id)
      return (
        !gameTeam ||
        gameTeam.providerId !== boxTeam.team.providerId ||
        (boxTeam.team.id === game.homeTeam.id &&
          game.score.home !== null &&
          boxTeam.points !== null &&
          boxTeam.points !== game.score.home) ||
        (boxTeam.team.id === game.awayTeam.id &&
          game.score.away !== null &&
          boxTeam.points !== null &&
          boxTeam.points !== game.score.away)
      )
    })
  )
    return false

  const playerIds = new Set<string>()
  return value.players.every((player) => {
    if (
      !player.player.teamId ||
      !expectedTeamIds.has(player.player.teamId) ||
      player.player.provider !== game.provider ||
      playerIds.has(player.player.id)
    )
      return false
    playerIds.add(player.player.id)
    return true
  })
}
