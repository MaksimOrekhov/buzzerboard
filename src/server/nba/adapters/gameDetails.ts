import type {
  Game,
  GameBoxScore,
  PlayerBoxScore,
  ShootingLine,
  TeamBoxScore,
} from '@/entities/nba/model'
import { NbaAdapterError, invalidResponseError } from '@/server/nba/adapters/errors'
import {
  isRecord,
  readIdentifier,
  readNonNegativeNumber,
  readNumber,
  readString,
  parseNbaGameDate,
} from '@/server/nba/adapters/normalizers/primitives'

function percentage(value: unknown): number | null {
  const parsed = readNonNegativeNumber(value)
  if (parsed === null) return null
  if (parsed <= 1) return parsed
  return parsed <= 100 ? parsed / 100 : null
}

function shootingLine(row: Record<string, unknown>, prefix: 'fg' | 'fg3' | 'ft'): ShootingLine {
  const made = readNonNegativeNumber(row[`${prefix}m`])
  const attempted = readNonNegativeNumber(row[`${prefix}a`])
  const rate = percentage(row[`${prefix}_pct`])
  return { made, attempted, percentage: rate }
}

function boxStats(row: Record<string, unknown>) {
  return {
    points: readNonNegativeNumber(row.pts),
    fieldGoals: shootingLine(row, 'fg'),
    threePointers: shootingLine(row, 'fg3'),
    freeThrows: shootingLine(row, 'ft'),
    rebounds: readNonNegativeNumber(row.reb),
    offensiveRebounds: readNonNegativeNumber(row.oreb),
    defensiveRebounds: readNonNegativeNumber(row.dreb),
    assists: readNonNegativeNumber(row.ast),
    steals: readNonNegativeNumber(row.stl),
    blocks: readNonNegativeNumber(row.blk),
    turnovers: readNonNegativeNumber(row.tov),
    fouls: readNonNegativeNumber(row.pf),
    plusMinus: readNumber(row.plus_minus),
  }
}

function readTeamRow(row: unknown, game: Game, home: boolean): TeamBoxScore | null {
  if (!isRecord(row) || row.home !== home) return null
  const team = home ? game.homeTeam : game.awayTeam
  if (String(row.team_id ?? '') !== team.providerId) return null
  return { team, ...boxStats(row) }
}

function readPlayerRow(row: unknown, game: Game): PlayerBoxScore | null {
  if (!isRecord(row)) return null
  const teamId = String(row.team_id ?? '')
  const team = [game.homeTeam, game.awayTeam].find((candidate) => candidate.providerId === teamId)
  const providerId = readIdentifier(row.player_id)
  if (!team || !providerId) return null

  const playerName = readString(row.player_name ?? row.name)
  const didNotPlay = row.dnp === true || row.did_not_play === true
  const starter = typeof row.starter === 'boolean' ? row.starter : null
  const rawMinutes = row.minutes ?? row.min
  const minutes =
    typeof rawMinutes === 'string'
      ? readString(rawMinutes)
      : typeof rawMinutes === 'number' && Number.isFinite(rawMinutes)
        ? String(rawMinutes)
        : null

  return {
    player: {
      id: `dunkapi:player:${providerId}` as PlayerBoxScore['player']['id'],
      provider: 'dunkapi',
      providerId,
      displayName: playerName,
      teamId: team.id,
    },
    starter,
    didNotPlay,
    minutes,
    ...boxStats(row),
  }
}

function reportedScore(team: Record<string, unknown>): { valid: boolean; value: number | null } {
  if (!Object.hasOwn(team, 'score') || team.score === null || team.score === undefined)
    return { valid: true, value: null }
  const value = readNonNegativeNumber(team.score)
  return { valid: value !== null, value }
}

export function normalizeDunkGameDetails(payload: unknown, selectedGame: Game): GameBoxScore {
  const root = isRecord(payload) && isRecord(payload.data) ? payload.data : payload
  if (!isRecord(root) || 'error' in root) {
    throw new NbaAdapterError(invalidResponseError('dunkapi'))
  }
  const game = isRecord(root.game) ? root.game : root
  const home = isRecord(game.home) ? game.home : null
  const away = isRecord(game.away) ? game.away : null
  const gameId = readIdentifier(game.game_id)
  const reportedDate =
    game.date === null || game.date === undefined ? null : parseNbaGameDate(game.date)
  const homeScore = home ? reportedScore(home) : { valid: false, value: null }
  const awayScore = away ? reportedScore(away) : { valid: false, value: null }
  if (
    !home ||
    !away ||
    !gameId ||
    gameId !== selectedGame.providerId ||
    (game.date !== null &&
      game.date !== undefined &&
      (!reportedDate || reportedDate !== selectedGame.nbaGameDate)) ||
    !homeScore.valid ||
    !awayScore.valid ||
    (homeScore.value !== null &&
      selectedGame.score.home !== null &&
      homeScore.value !== selectedGame.score.home) ||
    (awayScore.value !== null &&
      selectedGame.score.away !== null &&
      awayScore.value !== selectedGame.score.away) ||
    String(home.team_id ?? '') !== selectedGame.homeTeam.providerId ||
    String(away.team_id ?? '') !== selectedGame.awayTeam.providerId ||
    !Array.isArray(root.team_stats) ||
    !Array.isArray(root.players)
  ) {
    throw new NbaAdapterError(invalidResponseError('dunkapi'))
  }

  const homeRows = root.team_stats.filter((row) => isRecord(row) && row.home === true)
  const awayRows = root.team_stats.filter((row) => isRecord(row) && row.home === false)
  if (homeRows.length !== 1 || awayRows.length !== 1) {
    throw new NbaAdapterError(invalidResponseError('dunkapi'))
  }
  const homeStats = readTeamRow(homeRows[0], selectedGame, true)
  const awayStats = readTeamRow(awayRows[0], selectedGame, false)
  if (!homeStats || !awayStats) throw new NbaAdapterError(invalidResponseError('dunkapi'))

  if (
    (selectedGame.score.home !== null &&
      homeStats.points !== null &&
      homeStats.points !== selectedGame.score.home) ||
    (selectedGame.score.away !== null &&
      awayStats.points !== null &&
      awayStats.points !== selectedGame.score.away) ||
    (homeScore.value !== null &&
      homeStats.points !== null &&
      homeStats.points !== homeScore.value) ||
    (awayScore.value !== null && awayStats.points !== null && awayStats.points !== awayScore.value)
  ) {
    throw new NbaAdapterError(invalidResponseError('dunkapi'))
  }

  const players: PlayerBoxScore[] = []
  const seen = new Set<string>()
  for (const value of root.players) {
    const player = readPlayerRow(value, selectedGame)
    if (!player || seen.has(player.player.id)) {
      throw new NbaAdapterError(invalidResponseError('dunkapi'))
    }
    seen.add(player.player.id)
    players.push(player)
  }

  return { game: selectedGame, teams: [awayStats, homeStats], players }
}
