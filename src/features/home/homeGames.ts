import type { Game, GameId, GameStatus, TeamId } from '@/entities/nba/model'

export function homeGameRows(
  games: readonly Game[],
  teams: ReadonlySet<TeamId>,
  savedGames: ReadonlySet<GameId>,
  matchesOnly: boolean,
  status: GameStatus | 'all',
  statusOf: (game: Game) => GameStatus,
): Game[] {
  return games
    .filter(
      (game) =>
        (!matchesOnly ||
          savedGames.has(game.id) ||
          teams.has(game.awayTeam.id) ||
          teams.has(game.homeTeam.id)) &&
        (status === 'all' || statusOf(game) === status),
    )
    .sort(
      (a, b) =>
        (a.startsAt ?? '\uffff').localeCompare(b.startsAt ?? '\uffff') || a.id.localeCompare(b.id),
    )
    .slice(0, 5)
}
