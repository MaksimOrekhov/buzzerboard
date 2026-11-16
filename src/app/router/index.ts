import { createRouter, createWebHistory } from 'vue-router'

import { appRoutes } from './routes'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: appRoutes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

router.afterEach((to) => {
  document.title = `${String(to.meta.title ?? 'NBA Hub')} — BuzzerBoard`
})
