import type { Game } from '@/entities/nba/model'

export function gameDetailsPath(game: Game, returnTo: string): string {
  const query = new URLSearchParams({ date: game.nbaGameDate, from: returnTo })
  return `/games/${encodeURIComponent(game.id)}?${query.toString()}`
}

export function gameCenterReturnTo(state: {
  date: string
  status: string
  team: string
  favoriteOnly: boolean
  search: string
  sort: string
}): string {
  const query = new URLSearchParams({ date: state.date })
  if (state.status !== 'all') query.set('status', state.status)
  if (state.team !== 'all') query.set('team', state.team)
  if (state.favoriteOnly) query.set('favorites', '1')
  if (state.search.trim()) query.set('q', state.search)
  if (state.sort !== 'asc') query.set('sort', state.sort)
  return `/games?${query.toString()}`
}

export function safeGameReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/games'
  const path = value.split('?')[0] ?? ''
  if (
    path !== '/games' &&
    path !== '/' &&
    path !== '/favorites' &&
    !/^\/teams\/[A-Z0-9]+$/.test(path)
  )
    return '/games'
  return value
}
