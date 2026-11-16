import type { RouteRecordRaw } from 'vue-router'

export const appRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/HomeView.vue'),
    meta: { title: 'Главная' },
  },
  {
    path: '/games',
    name: 'games',
    component: () => import('@/pages/GamesView.vue'),
    meta: { title: 'Матчи' },
  },
  {
    path: '/standings',
    name: 'standings',
    component: () => import('@/pages/StandingsView.vue'),
    meta: { title: 'Турнирная таблица' },
  },
  {
    path: '/news',
    name: 'news',
    component: () => import('@/pages/NewsView.vue'),
    meta: { title: 'Новости' },
  },
  {
    path: '/favorites',
    name: 'favorites',
    component: () => import('@/pages/FavoritesView.vue'),
    meta: { title: 'Избранное' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFoundView.vue'),
    meta: { title: 'Страница не найдена' },
  },
]
