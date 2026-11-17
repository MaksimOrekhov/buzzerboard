<script setup lang="ts">
import '@/assets/app-shell.css'
import '@/assets/page-layouts.css'
import { TooltipProvider } from 'reka-ui'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { navigationItems, comingSoonItems } from './navigation'
import AppIcon from '@/shared/components/AppIcon.vue'
import '@/assets/design-system.css'
const route = useRoute()
</script>
<template>
  <TooltipProvider
    ><div class="game-center-theme gc-shell">
      <a class="gc-skip" href="#game-center-content">Перейти к содержимому</a>
      <aside class="gc-sidebar" aria-label="Навигация BuzzerBoard">
        <RouterLink to="/" class="gc-brand" aria-label="BuzzerBoard — на главную"
          ><span class="gc-brand-mark"><AppIcon name="basketball" :size="23" /></span
          ><span>buzzerboard<span class="gc-brand-period">.</span></span></RouterLink
        >
        <div class="gc-league">
          <span class="gc-league-symbol">NBA</span>
          <div>
            <strong>Национальная<br />баскетбольная ассоциация</strong>
          </div>
        </div>
        <nav class="gc-primary-nav" aria-label="Основная навигация">
          <RouterLink
            v-for="item in navigationItems"
            :key="item.id"
            :to="item.to"
            class="gc-nav-link"
            :class="{
              'gc-nav-link--active': item.id === 'teams' && route.path.startsWith('/teams'),
            }"
            active-class="gc-nav-link--active"
            :aria-label="item.label"
            :title="item.label"
            ><AppIcon :name="item.id === 'games' ? 'basketball' : item.icon" :size="20" /><span>{{
              item.id === 'games' ? 'Game Center' : item.id === 'standings' ? 'Таблица' : item.label
            }}</span
            ><span
              v-if="
                route.name === item.id || (item.id === 'teams' && route.path.startsWith('/teams'))
              "
              class="gc-nav-active-dot"
          /></RouterLink>
        </nav>
        <div class="gc-upcoming">
          <p>Больше о баскетболе</p>
          <div
            v-for="item in comingSoonItems"
            :key="item.id"
            class="gc-nav-link gc-nav-link--disabled"
            :title="`${item.label} — скоро`"
          >
            <AppIcon :name="item.icon" :size="20" /><span>{{ item.label }}</span
            ><span class="gc-soon">Скоро</span>
          </div>
        </div>
        <div class="gc-sidebar-bottom">
          <span class="gc-sidebar-ball"><AppIcon name="basketball" :size="30" /></span>
          <p>Игра начинается<br /><strong>с деталей.</strong></p>
          <RouterLink to="/standings"
            >Турнирная таблица<AppIcon name="arrow" :size="15"
          /></RouterLink>
        </div>
        <span class="gc-sidebar-signature">BuzzerBoard © {{ new Date().getFullYear() }}</span>
      </aside>
      <div class="gc-main">
        <header class="gc-topbar">
          <RouterLink to="/" class="gc-brand gc-mobile-brand" aria-label="BuzzerBoard — на главную"
            ><span class="gc-brand-mark"><AppIcon name="basketball" :size="21" /></span
            ><span>buzzerboard.</span></RouterLink
          >
          <div class="gc-breadcrumb">
            <AppIcon name="basketball" :size="17" /><span>Баскетбол</span><span>/</span
            ><strong>NBA</strong>
          </div>
          <span class="gc-topbar-caption">Твоя игра. Твои цифры.</span
          ><RouterLink to="/favorites" class="gc-topbar-favorites" aria-label="Открыть избранное"
            ><AppIcon name="star" :size="18" /><span>Избранное</span></RouterLink
          >
        </header>
        <main id="game-center-content" class="gc-main-content" tabindex="-1"><RouterView /></main>
        <footer class="gc-page-footer gc-app-footer">
          <span><AppIcon name="basketball" :size="15" />Баскетбол в деталях.</span
          ><span>NBA · BuzzerBoard</span>
        </footer>
      </div>
      <nav class="gc-mobile-nav" aria-label="Мобильная навигация">
        <RouterLink
          v-for="item in navigationItems"
          :key="item.id"
          :to="item.to"
          active-class="gc-mobile-nav--active"
          :class="{
            'gc-mobile-nav--active': item.id === 'teams' && route.path.startsWith('/teams'),
          }"
          ><AppIcon :name="item.id === 'games' ? 'basketball' : item.icon" :size="21" /><span>{{
            item.shortLabel
          }}</span></RouterLink
        >
      </nav>
    </div></TooltipProvider
  >
</template>
