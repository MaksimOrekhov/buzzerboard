import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import { navigationItems } from '../navigation'
import { appRoutes } from './routes'

describe('application routes', () => {
  it.each([
    ['/', 'home', 'Главная'],
    ['/games', 'games', 'Матчи'],
    ['/games/dunkapi%3Agame%3Asynthetic-1?date=2026-11-15', 'game-details', 'Матч'],
    ['/standings', 'standings', 'Турнирная таблица'],
    ['/teams', 'teams', 'Команды'],
    ['/teams/LAL', 'team-profile', 'Профиль команды'],
    ['/news', 'news', 'Новости'],
    ['/favorites', 'favorites', 'Избранное'],
    ['/somewhere-else', 'not-found', 'Страница не найдена'],
  ])('resolves %s to the %s view with a Russian title', async (path, routeName, title) => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: appRoutes,
    })

    await testRouter.push(path)

    expect(testRouter.currentRoute.value.name).toBe(routeName)
    expect(testRouter.currentRoute.value.meta.title).toBe(title)
  })

  it('exposes stable navigation IDs and Russian labels', () => {
    expect(navigationItems.map(({ id }) => id)).toEqual([
      'home',
      'games',
      'standings',
      'teams',
      'news',
      'favorites',
    ])
    expect(navigationItems.map(({ label }) => label)).toEqual([
      'Обзор',
      'Матчи',
      'Турнирная таблица',
      'Команды',
      'Новости',
      'Избранное',
    ])
  })
})
