<script setup lang="ts">
import '../overview.css'
import { RouterLink } from 'vue-router'
import AppIcon from '@/shared/components/AppIcon.vue'
import { useTeamFavorites } from '@/features/standings/composables/useTeamFavorites'
import { useHomeGameDay } from '../composables/useHomeGameDay'
import HomeDateControls from './HomeDateControls.vue'
import HomeScoreboard from './HomeScoreboard.vue'
import HomeStandings from './HomeStandings.vue'
import HomeFavorites from './HomeFavorites.vue'

const {
  query,
  selectedDate,
  today,
  minDate,
  maxDate,
  selectDate,
  games,
  displayDate,
  meta,
  hasHiddenGames,
  statusOf,
  errorTitle,
  errorDescription,
  favoriteIds,
  toggleFavorite,
} = useHomeGameDay()
const { isPending, isError, isFetching, isRefetchError, refetch } = query
const { favoriteIds: favoriteTeams, toggleFavorite: toggleFavoriteTeam } = useTeamFavorites()
const shortcuts = [
  { path: '/teams', icon: 'users', title: 'Команды', description: 'Каталог NBA' },
  { path: '/players', icon: 'basketball', title: 'Игроки', description: 'Каталог и профили' },
  { path: '/news', icon: 'news', title: 'Новости', description: 'Источник не подключён' },
] as const
</script>

<template>
  <div class="overview-view home-hub">
    <header class="home-masthead">
      <p><span aria-hidden="true"></span> NBA</p>
      <h1>NBA Hub<span>.</span></h1>
    </header>
    <HomeDateControls
      :date="selectedDate"
      :today="today"
      :min="minDate"
      :max="maxDate"
      @select="selectDate"
    />
    <div class="home-columns">
      <HomeScoreboard
        :date="selectedDate"
        :display-date="displayDate"
        :games="games"
        :meta="meta"
        :pending="isPending"
        :error="isError"
        :fetching="isFetching"
        :refresh-failed="isRefetchError"
        :error-title="errorTitle"
        :error-description="errorDescription"
        :has-hidden-games="hasHiddenGames"
        :status-of="statusOf"
        :team-ids="favoriteTeams"
        :saved-game-ids="favoriteIds"
        @favorite="toggleFavorite"
        @retry="refetch()"
      />
      <HomeStandings />
    </div>
    <HomeFavorites
      :date="selectedDate"
      :games="games"
      :team-ids="favoriteTeams"
      :game-ids="favoriteIds"
      @team="toggleFavoriteTeam"
      @game="toggleFavorite"
    />
    <nav class="home-shortcuts" aria-label="Разделы NBA">
      <RouterLink v-for="link in shortcuts" :key="link.path" class="home-shortcut" :to="link.path">
        <AppIcon :name="link.icon" :size="20" />
        <span
          ><strong>{{ link.title }}</strong
          ><small>{{ link.description }}</small></span
        >
        <AppIcon name="arrow-up-right" :size="15" />
      </RouterLink>
      <div class="home-shortcut home-shortcut--unavailable">
        <AppIcon name="grid" :size="20" />
        <span><strong>Видео</strong><small>Раздел пока недоступен</small></span>
      </div>
    </nav>
  </div>
</template>
