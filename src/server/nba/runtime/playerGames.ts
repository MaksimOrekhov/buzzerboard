import type { PlayerGame } from '../../../entities/nba/players'
import { bbsPlayerId } from '../../../entities/nba/players.ts'
import {
  isGameRef,
  type PlayerGameRef,
  type PlayerLogRow,
} from '../../../entities/nba/playerSnapshotGuards.ts'
import { isGameBoxScoreForGame, isGameRecord } from '../../../shared/api/nba/gameDetailsGuards.ts'
import type { NbaCacheRecord } from './types'

export function verifiedPlayerBox(
  base: NbaCacheRecord | null | undefined,
  box: NbaCacheRecord | null | undefined,
  ref: PlayerGameRef,
  season: number,
  now: number,
) {
  if (
    !isGameRef(ref, season) ||
    base?.capability !== 'games' ||
    box?.capability !== 'boxScore' ||
    base.provider !== 'bbs' ||
    box.provider !== 'bbs' ||
    !(now < base.staleUntil && now < box.staleUntil) ||
    box.gameId !== ref.gameId ||
    !Array.isArray(base.data)
  )
    return null
  const matches = base.data.filter((item) => isGameRecord(item) && item.id === ref.gameId)
  const game = matches.length === 1 ? matches[0] : undefined
  return game &&
    game.provider === 'bbs' &&
    game.id === 'bbs:game:' + game.providerId &&
    game.nbaGameDate === ref.date &&
    game.seasonEndYear === season &&
    Number.isSafeInteger(game.score.home) &&
    (game.score.home ?? -1) >= 0 &&
    Number.isSafeInteger(game.score.away) &&
    (game.score.away ?? -1) >= 0 &&
    isGameBoxScoreForGame(box.data, game) &&
    box.data.game.seasonEndYear === season
    ? box.data
    : null
}

export function boxPlayerLine(
  box: NonNullable<ReturnType<typeof verifiedPlayerBox>>,
  playerId: string,
): PlayerGame | null {
  const line = box.players.find((player) => player.player.id === playerId)
  if (
    !bbsPlayerId.test(playerId) ||
    !line ||
    line.didNotPlay === true ||
    playerId !== 'bbs:player:' + line.player.providerId
  )
    return null
  const game = box.game
  const opponent = line.player.teamId === game.homeTeam.id ? game.awayTeam : game.homeTeam
  const minutes = line.minutes?.match(/^(\d+):([0-5]\d)$/)
  const min = minutes
    ? Number(minutes[1]) + Number(minutes[2]) / 60
    : line.minutes?.trim()
      ? Number(line.minutes)
      : NaN
  const nonnegative = (value: number | null) => (value !== null && value >= 0 ? value : null)
  return {
    date: game.nbaGameDate,
    opponent: opponent.abbreviation,
    gameId: game.id,
    pts: nonnegative(line.points),
    reb: nonnegative(line.rebounds),
    ast: nonnegative(line.assists),
    min: min >= 0 && min <= 80 ? min : null,
  }
}

export function combinePlayerGames(
  log: readonly PlayerLogRow[],
  cached: readonly PlayerGame[],
): PlayerGame[] {
  const rows: PlayerGame[] = log.map(({ matchId, ...row }) => {
    const match = matchId && cached.find((game) => game.gameId === matchId)
    if (
      match &&
      match.date === row.date &&
      match.opponent === row.opponent &&
      (['pts', 'reb', 'ast', 'min'] as const).every(
        (key) => row[key] === null || row[key] === match[key],
      )
    )
      return { ...row, gameId: match.gameId }
    return row
  })
  for (const game of cached) {
    if (
      log.some(
        (row) =>
          row.matchId === game.gameId ||
          (row.date === game.date &&
            (!row.opponent || !game.opponent || row.opponent === game.opponent) &&
            !row.matchId),
      )
    )
      continue
    rows.push(game)
  }
  return rows.sort((left, right) => right.date.localeCompare(left.date)).slice(0, 15)
}
