import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import { appRoutes } from './routes'

describe('application routes', () => {
  it.each([
    ['/', 'home'],
    ['/games', 'games'],
    ['/standings', 'standings'],
    ['/news', 'news'],
    ['/favorites', 'favorites'],
    ['/somewhere-else', 'not-found'],
  ])('resolves %s to the %s view', async (path, routeName) => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: appRoutes,
    })

    await testRouter.push(path)

    expect(testRouter.currentRoute.value.name).toBe(routeName)
    expect(testRouter.currentRoute.value.meta.title).toBeTypeOf('string')
  })
})
