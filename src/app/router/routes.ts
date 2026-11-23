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
    path: '/arenas',
    name: 'arenas',
    component: () => import('@/pages/ArenasView.vue'),
    meta: { title: 'Арены NBA' },
  },
  {
    path: '/arenas/:arenaId',
    name: 'arena-profile',
    component: () => import('@/pages/ArenaProfileView.vue'),
    meta: { title: 'Профиль арены' },
  },
  {
    path: '/cities',
    name: 'cities',
    component: () => import('@/pages/CitiesView.vue'),
    meta: { title: 'Города NBA' },
  },
  {
    path: '/cities/:cityId',
    name: 'city-profile',
    component: () => import('@/pages/CityProfileView.vue'),
    meta: { title: 'Профиль города' },
  },
  {
    path: '/players',
    name: 'players',
    component: () => import('@/pages/PlayersView.vue'),
    meta: { title: 'Игроки' },
  },
  {
    path: '/players/:playerId',
    name: 'player-profile',
    component: () => import('@/pages/PlayerProfileView.vue'),
    meta: { title: 'Профиль игрока' },
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
