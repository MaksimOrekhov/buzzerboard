import { shallowRef } from 'vue'

import type { TeamId } from '@/entities/nba/model'

const STORAGE_KEY = 'buzzerboard.favorite-teams.v1'

function loadFavoriteIds(): ReadonlySet<TeamId> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) && value.every((id) => typeof id === 'string')
      ? new Set(value as TeamId[])
      : new Set()
  } catch {
    return new Set()
  }
}

function persistFavoriteIds(ids: ReadonlySet<TeamId>): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // The current view still works when browser storage is unavailable.
  }
}

export function useTeamFavorites() {
  const favoriteIds = shallowRef<ReadonlySet<TeamId>>(loadFavoriteIds())

  function isFavorite(teamId: TeamId): boolean {
    return favoriteIds.value.has(teamId)
  }

  function toggleFavorite(teamId: TeamId): void {
    const next = new Set(favoriteIds.value)
    if (next.has(teamId)) next.delete(teamId)
    else next.add(teamId)
    favoriteIds.value = next
    persistFavoriteIds(next)
  }

  return { favoriteIds, isFavorite, toggleFavorite }
}
