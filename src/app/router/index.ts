import { createRouter, createWebHistory } from 'vue-router'

import { appRoutes } from './routes'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: appRoutes,
  scrollBehavior(to, from, savedPosition) {
    if (
      to.name === 'game-details' &&
      to.fullPath.split('#')[0] === from.fullPath.split('#')[0] &&
      [
        '#game-overview',
        '#player-box-score-heading',
        '#game-leaders-heading',
        '#team-box-score-heading',
        '#game-arena',
      ].includes(to.hash) &&
      document.getElementById(to.hash.slice(1))
    )
      return { el: to.hash }
    if (to.name === 'player-profile' && /^#player-(overview|stats|matches)$/.test(to.hash)) {
      // The profile scrolls after its asynchronous data and anchor sections are available.
      return false
    }
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
