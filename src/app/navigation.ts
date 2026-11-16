import type { AppIconName } from '@/shared/icons'

export interface NavigationItem {
  id: 'home' | 'games' | 'standings' | 'news' | 'favorites'
  label: string
  to: string
  icon: AppIconName
}

export const navigationItems = [
  { id: 'home', label: 'Главная', to: '/', icon: 'home' },
  { id: 'games', label: 'Матчи', to: '/games', icon: 'calendar' },
  { id: 'standings', label: 'Турнирная таблица', to: '/standings', icon: 'trophy' },
  { id: 'news', label: 'Новости', to: '/news', icon: 'news' },
  { id: 'favorites', label: 'Избранное', to: '/favorites', icon: 'bookmark' },
] as const satisfies readonly NavigationItem[]
