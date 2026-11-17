import { shallowRef } from 'vue'

import type { GameId } from '@/entities/nba/model'

const STORAGE_KEY = 'buzzerboard.favorite-games.v1'

function loadFavoriteIds(): ReadonlySet<GameId> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) && value.every((id) => typeof id === 'string')
      ? new Set(value as GameId[])
      : new Set()
  } catch {
    return new Set()
  }
}

function persistFavoriteIds(ids: ReadonlySet<GameId>): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // The current session still works when browser storage is unavailable.
  }
}

export function useGameFavorites() {
  const favoriteIds = shallowRef<ReadonlySet<GameId>>(loadFavoriteIds())

  function isFavorite(gameId: GameId): boolean {
    return favoriteIds.value.has(gameId)
  }

  function toggleFavorite(gameId: GameId): void {
    const next = new Set(favoriteIds.value)
    if (next.has(gameId)) next.delete(gameId)
    else next.add(gameId)
    favoriteIds.value = next
    persistFavoriteIds(next)
  }

  return { favoriteIds, isFavorite, toggleFavorite }
}
