import { computed, onScopeDispose, shallowRef } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useGameCenter } from '@/features/games/composables/useGameCenter'
import { useStandings } from '@/features/standings/composables/useStandings'
import { CURRENT_SEASON } from '@/features/standings/composables/useStandingsCenter'
import { useTeamFavorites } from '@/features/standings/composables/useTeamFavorites'
import type { Game, GameId } from '@/entities/nba/model'
import type { GamesResponse } from '@/shared/api/nba/contracts'
interface CachedGame {
  game: Game
  meta: GamesResponse['meta']
}
export function useFavoriteCollections() {
  const center = useGameCenter()
  const standings = useStandings(CURRENT_SEASON)
  const teams = useTeamFavorites()
  const client = useQueryClient()
  const cachedGames = shallowRef<readonly CachedGame[]>([])
  function syncGames() {
    const records = new Map<GameId, CachedGame>()
    for (const [, snapshot] of client.getQueriesData<GamesResponse>({
      queryKey: ['nba', 'games'],
    })) {
      for (const game of snapshot?.data ?? []) {
        if (
          snapshot &&
          (!records.has(game.id) || records.get(game.id)!.meta.fetchedAt < snapshot.meta.fetchedAt)
        )
          records.set(game.id, { game, meta: snapshot.meta })
      }
    }
    cachedGames.value = [...records.values()]
  }
  syncGames()
  onScopeDispose(client.getQueryCache().subscribe(syncGames))
  const favoriteGames = computed(() =>
    cachedGames.value
      .filter(({ game }) => center.isFavorite(game.id))
      .sort((a, b) => (a.game.startsAt ?? '').localeCompare(b.game.startsAt ?? '')),
  )
  const favoriteGameGroups = computed(() => {
    const groups = new Map<
      string,
      { date: string; label: string; games: Game[]; meta: GamesResponse['meta'] }
    >()
    for (const { game, meta } of favoriteGames.value) {
      const date = game.nbaGameDate
      if (!groups.has(date))
        groups.set(date, {
          date,
          label: new Intl.DateTimeFormat('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(`${date}T12:00:00Z`)),
          games: [],
          meta,
        })
      groups.get(date)!.games.push(game)
    }
    return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date))
  })
  const favoriteTeams = computed(() =>
    (standings.data.value?.data ?? []).filter((row) => teams.isFavorite(row.team.id)),
  )
  const unknownGames = computed(() =>
    Math.max(0, center.favoriteIds.value.size - favoriteGames.value.length),
  )
  return {
    center,
    standings,
    teams,
    favoriteGames,
    favoriteGameGroups,
    favoriteTeams,
    unknownGames,
  }
}
