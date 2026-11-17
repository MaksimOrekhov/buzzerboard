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
    path: '/games/:gameId',
    name: 'game-details',
    component: () => import('@/pages/GameDetailsView.vue'),
    meta: { title: 'Матч' },
  },
  {
    path: '/standings',
    name: 'standings',
    component: () => import('@/pages/StandingsView.vue'),
    meta: { title: 'Турнирная таблица' },
  },
  {
    path: '/teams',
    name: 'teams',
    component: () => import('@/pages/TeamsView.vue'),
    meta: { title: 'Команды' },
  },
  {
    path: '/teams/:teamCode',
    name: 'team-profile',
    component: () => import('@/pages/TeamProfileView.vue'),
    meta: { title: 'Профиль команды' },
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
