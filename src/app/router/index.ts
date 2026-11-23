import { createRouter, createWebHistory } from 'vue-router'

import { appRoutes } from './routes'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: appRoutes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (
      to.name === 'team-profile' &&
      from.name === to.name &&
      from.params.teamCode === to.params.teamCode &&
      from.query.tab !== to.query.tab
    )
      return false
    return { top: 0 }
  },
})

router.afterEach((to) => {
  document.title = `${String(to.meta.title ?? 'NBA-хаб')} — BuzzerBoard`
})
