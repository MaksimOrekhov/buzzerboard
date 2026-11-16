<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'

import { navigationItems } from './navigation'
import AppIcon from '@/shared/components/AppIcon.vue'
</script>

<template>
  <a class="skip-link focus-ring" href="#main-content">Skip to content</a>

  <div class="app-shell">
    <aside class="sidebar" aria-label="BuzzerBoard navigation">
      <RouterLink class="brand" to="/" aria-label="BuzzerBoard home">
        <span class="brand-mark"><AppIcon name="basketball" :size="22" /></span>
        <span class="brand-copy">
          <span class="brand-name">BUZZERBOARD</span>
          <span class="brand-caption">THE NBA, IN FOCUS</span>
        </span>
      </RouterLink>

      <div class="sidebar-label eyebrow">Your hub</div>
      <nav class="primary-nav" aria-label="Primary navigation">
        <RouterLink
          v-for="item in navigationItems"
          :key="item.to"
          class="nav-link focus-ring"
          :to="item.to"
          active-class="nav-link--active"
          exact-active-class="nav-link--exact-active"
        >
          <AppIcon :name="item.icon" :size="18" />
          <span>{{ item.label }}</span>
          <span v-if="item.label === 'Home'" class="nav-link-mark" aria-hidden="true" />
        </RouterLink>
      </nav>

      <div class="sidebar-bottom">
        <div class="data-status">
          <span class="status-dot" aria-hidden="true" />
          <div>
            <p class="data-status-title">Data source</p>
            <p class="data-status-copy">Not connected</p>
          </div>
        </div>
        <p class="sidebar-note">Scores and standings will appear when a data feed is connected.</p>
        <span class="sidebar-version">BUZZERBOARD · EARLY ACCESS</span>
      </div>
    </aside>

    <div class="app-main">
      <header class="mobile-header">
        <RouterLink class="brand brand--compact" to="/" aria-label="BuzzerBoard home">
          <span class="brand-mark"><AppIcon name="basketball" :size="20" /></span>
          <span class="brand-name">BUZZERBOARD</span>
        </RouterLink>
        <span class="mobile-status"><span class="status-dot" />No data feed</span>
      </header>

      <main id="main-content" class="page-content" tabindex="-1">
        <RouterView v-slot="{ Component }">
          <Transition name="route-enter" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>

      <footer class="app-footer">
        <span>Built for the love of the game.</span>
        <span>Scores will appear when a verified data source is connected.</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.skip-link {
  position: fixed;
  z-index: 10;
  top: 1rem;
  left: 1rem;
  transform: translateY(-160%);
  border-radius: 0.5rem;
  background: var(--accent);
  padding: 0.7rem 1rem;
  color: #101114;
  font-weight: 700;
}

.skip-link:focus {
  transform: translateY(0);
}

.app-shell {
  min-height: 100vh;
}

.sidebar {
  position: fixed;
  z-index: 2;
  inset: 0 auto 0 0;
  display: flex;
  width: 15.5rem;
  flex-direction: column;
  border-right: 1px solid var(--line);
  background: rgb(10 12 15 / 94%);
  padding: 2rem 1.2rem 1.4rem;
  backdrop-filter: blur(22px);
}

.brand {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 0.8rem;
  color: var(--ink);
  text-decoration: none;
}

.brand-mark {
  display: grid;
  width: 2.7rem;
  height: 2.7rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(255 112 72 / 32%);
  border-radius: 0.9rem;
  background: linear-gradient(145deg, rgb(255 112 72 / 20%), rgb(255 112 72 / 4%));
  color: var(--accent);
}

.brand-copy {
  display: grid;
  gap: 0.22rem;
}

.brand-name {
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.brand-caption {
  color: var(--muted);
  font-size: 0.57rem;
  font-weight: 700;
  letter-spacing: 0.15em;
}

.sidebar-label {
  margin: 3.2rem 0 0.9rem 0.7rem;
}

.primary-nav {
  display: grid;
  gap: 0.3rem;
}

.nav-link {
  position: relative;
  display: flex;
  min-height: 2.9rem;
  align-items: center;
  gap: 0.8rem;
  border: 1px solid transparent;
  border-radius: 0.85rem;
  padding: 0 0.8rem;
  color: #a0a5ac;
  font-size: 0.9rem;
  font-weight: 550;
  text-decoration: none;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.nav-link:hover {
  background: rgb(255 255 255 / 4%);
  color: var(--ink);
}

.nav-link--active,
.nav-link--exact-active {
  border-color: rgb(255 255 255 / 6%);
  background: linear-gradient(100deg, rgb(255 112 72 / 14%), rgb(255 112 72 / 4%));
  color: var(--ink);
}

.nav-link--active :deep(svg),
.nav-link--exact-active :deep(svg) {
  color: var(--accent);
}

.nav-link-mark {
  width: 0.35rem;
  height: 0.35rem;
  margin-left: auto;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 12px rgb(255 112 72 / 90%);
  opacity: 0;
}

.nav-link--exact-active .nav-link-mark {
  opacity: 1;
}

.sidebar-bottom {
  margin-top: auto;
}

.data-status {
  display: flex;
  align-items: center;
  gap: 0.72rem;
  border: 1px solid var(--line);
  border-radius: 0.9rem;
  background: rgb(255 255 255 / 2.5%);
  padding: 0.9rem;
}

.status-dot {
  width: 0.52rem;
  height: 0.52rem;
  flex: 0 0 auto;
  border: 1px solid rgb(204 164 98 / 52%);
  border-radius: 50%;
  background: #b78951;
  box-shadow: 0 0 10px rgb(183 137 81 / 35%);
}

.data-status-title,
.data-status-copy {
  margin: 0;
}

.data-status-title {
  color: #dedbd4;
  font-size: 0.72rem;
  font-weight: 700;
}

.data-status-copy {
  margin-top: 0.15rem;
  color: var(--muted);
  font-size: 0.66rem;
}

.sidebar-note {
  margin: 0.75rem 0.25rem 1.25rem;
  color: #777e86;
  font-size: 0.67rem;
  line-height: 1.55;
}

.sidebar-version {
  padding-left: 0.25rem;
  color: #666c73;
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.app-main {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  margin-left: 15.5rem;
}

.page-content {
  width: min(100%, 88rem);
  flex: 1;
  align-self: center;
  padding: clamp(2rem, 5vw, 4.5rem) clamp(1.25rem, 5vw, 5rem) 3rem;
}

.app-footer {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  border-top: 1px solid var(--line);
  margin: 0 clamp(1.25rem, 5vw, 5rem);
  padding: 1rem 0 1.25rem;
  color: #70767d;
  font-size: 0.68rem;
}

.mobile-header {
  display: none;
}

.route-enter-enter-active,
.route-enter-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.route-enter-enter-from,
.route-enter-leave-to {
  transform: translateY(0.4rem);
  opacity: 0;
}

@media (max-width: 760px) {
  .sidebar {
    position: sticky;
    inset: auto;
    display: block;
    width: auto;
    border-right: 0;
    border-bottom: 1px solid var(--line);
    padding: 0.8rem 1rem 0.6rem;
  }

  .sidebar > .brand,
  .sidebar-label,
  .sidebar-bottom {
    display: none;
  }

  .primary-nav {
    display: flex;
    overflow-x: auto;
    gap: 0.35rem;
    scrollbar-width: none;
  }

  .primary-nav::-webkit-scrollbar {
    display: none;
  }

  .nav-link {
    min-height: 2.65rem;
    flex: 0 0 auto;
    gap: 0.55rem;
    padding: 0 0.75rem;
    font-size: 0.82rem;
  }

  .nav-link-mark {
    display: none;
  }

  .app-main {
    margin-left: 0;
  }

  .mobile-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem 0;
  }

  .brand--compact {
    gap: 0.6rem;
  }

  .brand--compact .brand-mark {
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 0.7rem;
  }

  .brand--compact .brand-name {
    font-size: 0.72rem;
  }

  .mobile-status {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--muted);
    font-size: 0.65rem;
    white-space: nowrap;
  }

  .mobile-status .status-dot {
    width: 0.42rem;
    height: 0.42rem;
  }

  .page-content {
    padding-top: 2.1rem;
  }
}

@media (max-width: 520px) {
  .app-footer {
    flex-direction: column;
    font-size: 0.64rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
