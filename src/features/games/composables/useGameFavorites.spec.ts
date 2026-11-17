import { beforeEach, describe, expect, it } from 'vitest'

import { useGameFavorites } from './useGameFavorites'
import type { GameId } from '@/entities/nba/model'

const gameId = 'dunkapi:game:401800001' as GameId

beforeEach(() => localStorage.clear())

describe('useGameFavorites', () => {
  it('persists favorite game IDs and restores them for a later view', () => {
    const firstView = useGameFavorites()
    firstView.toggleFavorite(gameId)

    expect(firstView.isFavorite(gameId)).toBe(true)
    expect(localStorage.getItem('buzzerboard.favorite-games.v1')).toContain(gameId)
    expect(useGameFavorites().isFavorite(gameId)).toBe(true)
  })

  it('removes an unselected game from favorites', () => {
    const favorites = useGameFavorites()
    favorites.toggleFavorite(gameId)
    favorites.toggleFavorite(gameId)

    expect(favorites.isFavorite(gameId)).toBe(false)
  })
})
