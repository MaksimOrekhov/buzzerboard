<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

import { comingSoonItems, navigationItems } from './navigation'
import AppBadge from '@/shared/components/AppBadge.vue'
import AppIcon from '@/shared/components/AppIcon.vue'

const route = useRoute()
const currentPageTitle = computed(() => String(route.meta.title ?? 'Обзор'))
const todayLabel = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}).format(new Date())
</script>

<template>
  <a class="skip-link focus-ring" href="#main-content">Перейти к содержимому</a>

  <div class="app-shell">
    <aside class="sidebar" aria-label="Навигация BuzzerBoard">
      <RouterLink class="brand focus-ring" to="/" aria-label="BuzzerBoard — на главную">
        <span class="brand-mark"><AppIcon name="basketball" :size="23" /></span>
        <span class="brand-copy">
          <span class="brand-name">BuzzerBoard</span>
          <span class="brand-caption">NBA · В ФОКУСЕ</span>
        </span>
      </RouterLink>

      <div class="nav-group">
        <p class="nav-label">Пространство</p>
        <nav class="primary-nav" aria-label="Основная навигация">
          <RouterLink
            v-for="item in navigationItems"
            :key="item.id"
            class="nav-link focus-ring"
            :to="item.to"
            :aria-label="item.label"
            active-class="nav-link--active"
            exact-active-class="nav-link--exact-active"
          >
            <span class="nav-icon"><AppIcon :name="item.icon" :size="18" /></span>
            <span class="nav-link-label">{{ item.label }}</span>
            <span class="nav-tooltip" aria-hidden="true">{{ item.label }}</span>
            <span v-if="item.id === 'home'" class="nav-active-mark" aria-hidden="true" />
          </RouterLink>
        </nav>
      </div>

      <div class="nav-group nav-group--upcoming">
        <p class="nav-label">Скоро</p>
        <div class="primary-nav" aria-label="Будущие разделы">
          <div
            v-for="item in comingSoonItems"
            :key="item.id"
            class="nav-link nav-link--muted"
            :aria-label="`${item.label} — скоро`"
            :title="`${item.label} — скоро`"
          >
            <span class="nav-icon"><AppIcon :name="item.icon" :size="18" /></span>
            <span class="nav-link-label">{{ item.label }}</span>
            <span class="nav-tooltip" aria-hidden="true">{{ item.label }} — скоро</span>
            <span class="nav-coming-soon">Скоро</span>
          </div>
        </div>
      </div>

      <div class="sidebar-bottom">
        <div class="sidebar-data-card">
          <div class="sidebar-data-icon"><AppIcon name="database" :size="17" /></div>
          <div class="sidebar-data-copy">
            <span class="sidebar-data-label">Источник данных</span>
            <span class="sidebar-data-status">Ожидает подключения</span>
          </div>
          <span class="status-pip" aria-hidden="true" />
        </div>
        <p class="sidebar-footnote">Показываем только проверенные данные. Без предположений.</p>
        <span class="sidebar-signature">BUZZERBOARD <span>·</span> RU-RU</span>
      </div>
    </aside>

    <div class="app-main">
      <header class="mobile-header">
        <RouterLink
          class="brand brand--compact focus-ring"
          to="/"
          aria-label="BuzzerBoard — на главную"
        >
          <span class="brand-mark"><AppIcon name="basketball" :size="21" /></span>
          <span class="brand-name">BuzzerBoard</span>
        </RouterLink>
        <AppBadge tone="warning" dot>Нет данных</AppBadge>
      </header>

      <header class="topbar">
        <div class="topbar-context">
          <span class="topbar-overline">BuzzerBoard <span>/</span> NBA</span>
          <p class="topbar-page-label">{{ currentPageTitle }}</p>
        </div>
        <div class="topbar-meta">
          <span class="topbar-date">{{ todayLabel }}</span>
          <span class="topbar-divider" aria-hidden="true" />
          <AppBadge tone="warning" dot>Источник не подключён</AppBadge>
        </div>
      </header>

      <main id="main-content" class="page-content" tabindex="-1">
        <RouterView v-slot="{ Component }">
          <Transition name="route-enter" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>

      <footer class="app-footer">
        <span class="footer-brand">BUZZERBOARD <span>·</span> NBA, разборчиво</span>
        <span>Результаты появятся после подключения проверенного источника.</span>
      </footer>
    </div>

    <nav class="mobile-nav" aria-label="Основная навигация">
      <RouterLink
        v-for="item in navigationItems"
        :key="item.id"
        class="mobile-nav-link focus-ring"
        :to="item.to"
        active-class="mobile-nav-link--active"
        exact-active-class="mobile-nav-link--exact-active"
      >
        <AppIcon :name="item.icon" :size="18" />
        <span>{{ item.shortLabel }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.skip-link {
  position: fixed;
  z-index: 20;
  top: 1rem;
  left: 1rem;
  transform: translateY(-160%);
  border-radius: var(--radius-sm);
  background: var(--lime);
  padding: 0.75rem 1rem;
  color: #11140c;
  font-size: 0.8rem;
  font-weight: 760;
  text-decoration: none;
}

.skip-link:focus {
  transform: translateY(0);
}

.app-shell {
  display: grid;
  min-height: 100vh;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
}

.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  height: 100vh;
  min-height: 42rem;
  flex-direction: column;
  border-right: 1px solid var(--line);
  background: rgb(11 14 16 / 92%);
  padding: 1.65rem 1.1rem 1.15rem;
  backdrop-filter: blur(22px);
}

.brand {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 0.76rem;
  color: var(--ink);
  text-decoration: none;
}

.brand-mark {
  display: grid;
  width: 2.65rem;
  height: 2.65rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(242 122 86 / 38%);
  border-radius: 0.9rem;
  background:
    radial-gradient(circle at 30% 20%, rgb(255 158 119 / 24%), transparent 55%),
    linear-gradient(145deg, rgb(242 122 86 / 19%), rgb(242 122 86 / 5%));
  color: var(--accent-bright);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 9%);
}

.brand-copy {
  display: grid;
  gap: 0.23rem;
}

.brand-name {
  font-size: 0.84rem;
  font-weight: 820;
  letter-spacing: 0.09em;
}

.brand-caption {
  color: var(--muted);
  font-size: var(--font-size-caption);
  font-weight: 740;
  letter-spacing: 0.16em;
}

.nav-group {
  margin-top: 3.15rem;
}

.nav-group--upcoming {
  margin-top: 1.55rem;
}

.nav-label {
  margin: 0 0 0.7rem 0.8rem;
  color: var(--subtle);
  font-size: var(--font-size-caption);
  font-weight: 760;
  letter-spacing: 0.17em;
  text-transform: uppercase;
}

.primary-nav {
  display: grid;
  gap: 0.22rem;
}

.nav-link {
  position: relative;
  display: flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.78rem;
  border: 1px solid transparent;
  border-radius: 0.78rem;
  padding: 0 0.72rem;
  color: #9ea7a7;
  font-size: 0.82rem;
  font-weight: 590;
  text-decoration: none;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    color 150ms ease;
}

.nav-icon {
  display: grid;
  width: 1.55rem;
  flex: 0 0 auto;
  place-items: center;
  color: #748082;
}

.nav-link:hover {
  background: rgb(255 255 255 / 4%);
  color: var(--ink);
}

.nav-link:hover .nav-icon {
  color: var(--ink-soft);
}

.nav-link--active,
.nav-link--exact-active {
  border-color: rgb(242 122 86 / 16%);
  background: linear-gradient(100deg, rgb(242 122 86 / 12%), rgb(242 122 86 / 3%));
  color: #f4e5de;
}

.nav-link--active .nav-icon,
.nav-link--exact-active .nav-icon {
  color: var(--accent-bright);
}

.nav-active-mark {
  width: 0.32rem;
  height: 0.32rem;
  margin-left: auto;
  border-radius: 50%;
  background: var(--accent-bright);
  box-shadow: 0 0 10px rgb(242 122 86 / 78%);
  opacity: 0;
}

.nav-tooltip {
  display: none;
}

.nav-link--exact-active .nav-active-mark {
  opacity: 1;
}

.nav-link--muted {
  color: var(--subtle);
  cursor: default;
}

.nav-link--muted .nav-icon {
  color: var(--subtle);
}

.nav-coming-soon {
  margin-left: auto;
  color: var(--subtle);
  font-size: var(--font-size-caption);
  font-weight: 660;
}

.sidebar-bottom {
  margin-top: auto;
}

.sidebar-data-card {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  border: 1px solid var(--line);
  border-radius: 0.92rem;
  background: linear-gradient(145deg, rgb(255 255 255 / 3%), rgb(255 255 255 / 1%));
  padding: 0.78rem 0.75rem;
}

.sidebar-data-icon {
  display: grid;
  width: 2rem;
  height: 2rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(228 182 107 / 23%);
  border-radius: 0.63rem;
  background: rgb(228 182 107 / 7%);
  color: var(--warning);
}

.sidebar-data-copy {
  display: grid;
  min-width: 0;
  gap: 0.18rem;
}

.sidebar-data-label {
  color: var(--muted);
  font-size: var(--font-size-caption);
  font-weight: 620;
}

.sidebar-data-status {
  overflow: hidden;
  color: var(--ink-soft);
  font-size: var(--font-size-caption);
  font-weight: 690;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-pip {
  width: 0.38rem;
  height: 0.38rem;
  flex: 0 0 auto;
  margin-left: auto;
  border-radius: 50%;
  background: var(--warning);
  box-shadow: 0 0 8px rgb(228 182 107 / 55%);
}

.sidebar-footnote {
  margin: 0.7rem 0.25rem 1rem;
  color: var(--subtle);
  font-size: var(--font-size-caption);
  line-height: 1.55;
}

.sidebar-signature {
  padding-left: 0.25rem;
  color: var(--subtle);
  font-size: var(--font-size-caption);
  font-weight: 780;
  letter-spacing: 0.15em;
}

.sidebar-signature span,
.footer-brand span {
  color: var(--accent);
}

.app-main {
  display: flex;
  min-width: 0;
  min-height: 100vh;
  flex-direction: column;
}

.topbar {
  position: sticky;
  z-index: 4;
  top: 0;
  display: flex;
  min-height: 4.65rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--line);
  background: rgb(8 10 12 / 84%);
  padding: 0.72rem clamp(1.5rem, 3.5vw, 3.4rem);
  backdrop-filter: blur(18px);
}

.topbar-page-label {
  margin: 0.1rem 0 0;
  color: var(--ink-soft);
  font-size: 0.83rem;
  font-weight: 680;
  letter-spacing: -0.015em;
}

.topbar-overline {
  color: var(--subtle);
  font-size: var(--font-size-caption);
  font-weight: 760;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.topbar-overline span {
  padding: 0 0.3rem;
  color: #485255;
}

.topbar-meta {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.topbar-date {
  color: var(--muted);
  font-size: var(--font-size-caption);
  text-transform: capitalize;
}

.topbar-divider {
  width: 1px;
  height: 1.25rem;
  background: var(--line-strong);
}

.page-content {
  width: 100%;
  max-width: 1500px;
  flex: 1;
  align-self: center;
  padding: clamp(1.55rem, 3.5vw, 3rem) clamp(1.3rem, 3.5vw, 3.4rem) 3.2rem;
}

.app-footer {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid var(--line);
  margin: 0 clamp(1.3rem, 3.5vw, 3.4rem);
  padding: 1.05rem 0 1.2rem;
  color: var(--subtle);
  font-size: var(--font-size-caption);
}

.footer-brand {
  color: #7c8586;
  font-size: var(--font-size-caption);
  font-weight: 790;
  letter-spacing: 0.11em;
  white-space: nowrap;
}

.mobile-header,
.mobile-nav {
  display: none;
}

.route-enter-enter-active,
.route-enter-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}

.route-enter-enter-from,
.route-enter-leave-to {
  transform: translateY(0.3rem);
  opacity: 0;
}

@media (max-width: 1040px) {
  .app-shell {
    --sidebar-width: 5.2rem;
  }

  .sidebar {
    align-items: center;
    padding: 1.4rem 0.55rem 1rem;
  }

  .brand {
    justify-content: center;
  }

  .brand-copy,
  .nav-label,
  .nav-coming-soon,
  .sidebar-data-copy,
  .sidebar-footnote,
  .sidebar-signature {
    display: none;
  }

  .nav-group {
    width: 100%;
    margin-top: 2.2rem;
  }

  .nav-group--upcoming {
    margin-top: 1rem;
  }

  .nav-link {
    justify-content: center;
    padding: 0;
  }

  .nav-link-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .nav-tooltip {
    position: absolute;
    z-index: 12;
    top: 50%;
    left: calc(100% + 0.55rem);
    display: block;
    border: 1px solid var(--line-strong);
    border-radius: 0.6rem;
    background: var(--surface-raised);
    padding: 0.45rem 0.6rem;
    color: var(--ink);
    font-size: var(--font-size-caption);
    font-weight: 650;
    line-height: 1.3;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-50%);
    transition: opacity 120ms ease;
    white-space: nowrap;
  }

  .nav-link:hover .nav-tooltip,
  .nav-link:focus-visible .nav-tooltip {
    opacity: 1;
  }

  .nav-icon {
    width: auto;
  }

  .nav-active-mark {
    position: absolute;
    right: 0.35rem;
    width: 0.28rem;
    height: 0.28rem;
  }

  .sidebar-data-card {
    justify-content: center;
    padding: 0.55rem;
  }

  .status-pip {
    position: absolute;
    transform: translate(0.68rem, -0.68rem);
  }
}

@media (max-width: 760px) {
  .app-shell {
    display: block;
  }

  .sidebar,
  .topbar {
    display: none;
  }

  .mobile-header {
    position: sticky;
    z-index: 5;
    top: 0;
    display: flex;
    min-height: 4.4rem;
    align-items: center;
    justify-content: space-between;
    gap: 0.65rem;
    border-bottom: 1px solid var(--line);
    background: rgb(8 10 12 / 88%);
    padding: 0.65rem 1rem;
    backdrop-filter: blur(18px);
  }

  .brand--compact {
    gap: 0.55rem;
  }

  .brand--compact .brand-mark {
    width: 2.28rem;
    height: 2.28rem;
    border-radius: 0.75rem;
  }

  .brand--compact .brand-name {
    font-size: var(--font-size-caption);
    letter-spacing: 0.055em;
  }

  .mobile-header :deep(.badge) {
    min-height: 1.45rem;
    padding-inline: 0.45rem;
    font-size: var(--font-size-caption);
    letter-spacing: 0.05em;
  }

  .page-content {
    padding: 1.3rem 1rem 2.4rem;
  }

  .app-footer {
    flex-direction: column;
    gap: 0.5rem;
    margin: 0 1rem 5.5rem;
    font-size: var(--font-size-caption);
  }

  .mobile-nav {
    position: fixed;
    z-index: 8;
    inset: auto 0 0;
    display: flex;
    min-height: calc(4.25rem + env(safe-area-inset-bottom));
    align-items: stretch;
    justify-content: space-around;
    gap: 0.1rem;
    border-top: 1px solid var(--line-strong);
    background: rgb(11 14 16 / 94%);
    padding: 0.45rem 0.45rem calc(0.4rem + env(safe-area-inset-bottom));
    backdrop-filter: blur(20px);
  }

  .mobile-nav-link {
    position: relative;
    display: grid;
    min-width: 0;
    flex: 1 1 0;
    align-content: center;
    justify-items: center;
    gap: 0.28rem;
    border-radius: 0.65rem;
    color: #788284;
    font-size: var(--font-size-caption);
    font-weight: 620;
    text-decoration: none;
    white-space: nowrap;
  }

  .mobile-nav-link--active,
  .mobile-nav-link--exact-active {
    color: var(--accent-bright);
  }

  .mobile-nav-link--exact-active::before {
    position: absolute;
    top: -0.45rem;
    width: 1.25rem;
    height: 2px;
    border-radius: 99px;
    background: var(--accent-bright);
    box-shadow: 0 0 10px rgb(242 122 86 / 55%);
    content: '';
  }
}

@media (prefers-reduced-motion: reduce) {
  .route-enter-enter-active,
  .route-enter-leave-active {
    transition: none;
  }
}
</style>
