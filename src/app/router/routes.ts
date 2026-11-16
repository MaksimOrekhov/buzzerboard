import type { RouteRecordRaw } from 'vue-router'

export const appRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/HomeView.vue'),
    meta: { title: 'Home' },
  },
  {
    path: '/games',
    name: 'games',
    component: () => import('@/pages/GamesView.vue'),
    meta: { title: 'Games' },
  },
  {
    path: '/standings',
    name: 'standings',
    component: () => import('@/pages/StandingsView.vue'),
    meta: { title: 'Standings' },
  },
  {
    path: '/news',
    name: 'news',
    component: () => import('@/pages/NewsView.vue'),
    meta: { title: 'News' },
  },
  {
    path: '/favorites',
    name: 'favorites',
    component: () => import('@/pages/FavoritesView.vue'),
    meta: { title: 'Favorites' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFoundView.vue'),
    meta: { title: 'Page not found' },
  },
]
