import { beforeEach, describe, expect, it } from 'vitest'

import { useTeamFavorites } from './useTeamFavorites'
import type { TeamId } from '@/entities/nba/model'

const teamId = 'test:team:favorite' as TeamId

beforeEach(() => localStorage.clear())

describe('useTeamFavorites', () => {
  it('toggles and persists a team favorite', () => {
    const favorites = useTeamFavorites()

    expect(favorites.isFavorite(teamId)).toBe(false)
    favorites.toggleFavorite(teamId)
    expect(favorites.isFavorite(teamId)).toBe(true)
    expect(useTeamFavorites().isFavorite(teamId)).toBe(true)

    favorites.toggleFavorite(teamId)
    expect(favorites.isFavorite(teamId)).toBe(false)
  })
})
