import type { AppIconName } from '@/shared/icons'

export interface NavigationItem {
  id: 'home' | 'games' | 'standings' | 'news' | 'favorites'
  label: string
  shortLabel: string
  to: string
  icon: AppIconName
}

export interface ComingSoonItem {
  id: 'teams' | 'players' | 'analytics'
  label: string
  icon: AppIconName
}

export const navigationItems = [
  { id: 'home', label: 'Обзор', shortLabel: 'Обзор', to: '/', icon: 'home' },
  { id: 'games', label: 'Матчи', shortLabel: 'Матчи', to: '/games', icon: 'calendar' },
  {
    id: 'standings',
    label: 'Турнирная таблица',
    shortLabel: 'Таблица',
    to: '/standings',
    icon: 'trophy',
  },
  { id: 'news', label: 'Новости', shortLabel: 'Новости', to: '/news', icon: 'news' },
  {
    id: 'favorites',
    label: 'Избранное',
    shortLabel: 'Избранное',
    to: '/favorites',
    icon: 'bookmark',
  },
] as const satisfies readonly NavigationItem[]

export const comingSoonItems = [
  { id: 'teams', label: 'Команды', icon: 'users' },
  { id: 'players', label: 'Игроки', icon: 'basketball' },
  { id: 'analytics', label: 'Аналитика', icon: 'chart' },
] as const satisfies readonly ComingSoonItem[]
