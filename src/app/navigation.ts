import type { AppIconName } from '@/shared/icons'

export interface NavigationItem {
  label: string
  to: string
  icon: AppIconName
}

export const navigationItems = [
  { label: 'Home', to: '/', icon: 'home' },
  { label: 'Games', to: '/games', icon: 'calendar' },
  { label: 'Standings', to: '/standings', icon: 'trophy' },
  { label: 'News', to: '/news', icon: 'news' },
  { label: 'Favorites', to: '/favorites', icon: 'bookmark' },
] as const satisfies readonly NavigationItem[]
