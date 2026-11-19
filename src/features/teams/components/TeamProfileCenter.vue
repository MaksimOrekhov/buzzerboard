<script setup lang="ts">
import '../../standings/standings.css'
import '../teams.css'
import { computed, defineAsyncComponent } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { findNbaTeam } from '@/entities/nba/teamCatalog'
import { useTeamFavorites } from '@/features/standings/composables/useTeamFavorites'
import PageHeading from '@/shared/components/PageHeading.vue'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import TeamProfileOverview from './TeamProfileOverview.vue'

const TeamHistoryPanel = defineAsyncComponent(() => import('./TeamHistoryPanel.vue'))
const sections = [
  { label: 'Обзор', history: false },
  { label: 'История', history: true },
]
const route = useRoute()
const code = computed(() =>
  typeof route.params.teamCode === 'string' ? route.params.teamCode.toUpperCase() : '',
)
const team = computed(() => findNbaTeam(code.value))
const historyActive = computed(() => route.query.tab === 'history')
const overviewQuery = computed(() => {
  const query = { ...route.query }
  delete query.tab
  return query
})
const { isFavorite, toggleFavorite } = useTeamFavorites()
const favorite = computed(() => Boolean(team.value && isFavorite(team.value.team.id)))
</script>

<template>
  <div v-if="team" class="team-profile-center">
    <nav class="teams-breadcrumb" aria-label="Навигация по разделу">
      <RouterLink to="/teams"><AppIcon name="arrow" :size="14" />Команды NBA</RouterLink
      ><span>/</span><span>{{ team.code }}</span>
    </nav>
    <PageHeading
      eyebrow="Профиль франшизы"
      :title="team.name"
      :description="`${team.conference === 'east' ? 'Восточная' : 'Западная'} конференция · дивизион ${team.division}`"
      :title-dot="false"
    >
      <template #actions
        ><button
          class="gc-control teams-profile-favorite"
          type="button"
          :aria-pressed="favorite"
          @click="toggleFavorite(team.team.id)"
        >
          <AppIcon name="star" :size="17" />{{ favorite ? 'В избранном' : 'В избранное' }}
        </button></template
      >
    </PageHeading>
    <section class="teams-profile-hero" aria-label="Карточка команды">
      <div class="teams-profile-brand">
        <TeamLogo :team="team.team" :size="86" />
        <div>
          <span>{{ team.code }}<span class="teams-hero-separator">·</span>NBA</span
          ><strong>{{ team.name }}</strong
          ><small>{{ team.division }} division</small>
        </div>
      </div>
      <div class="teams-profile-hero-links">
        <RouterLink :to="{ path: '/players', query: { team: code } }" class="gc-control"
          >Игроки в каталоге<AppIcon name="arrow" :size="14"
        /></RouterLink>
        <RouterLink to="/standings" class="gc-control"
          >Турнирная таблица<AppIcon name="arrow" :size="14" /></RouterLink
        ><RouterLink to="/games" class="gc-control"
          >Матчи<AppIcon name="arrow" :size="14"
        /></RouterLink>
      </div>
    </section>
    <nav class="teams-profile-nav" aria-label="Разделы профиля">
      <RouterLink
        v-for="section in sections"
        :key="section.label"
        v-slot="{ href, navigate }"
        :to="{
          path: route.path,
          query: section.history ? { ...overviewQuery, tab: 'history' } : overviewQuery,
        }"
        custom
      >
        <a
          :href="href"
          :aria-current="section.history === historyActive ? 'page' : undefined"
          @click="navigate"
        >
          {{ section.label }}
        </a>
      </RouterLink>
    </nav>
    <TeamHistoryPanel v-if="historyActive" :key="team.code" :team-code="team.code" />
    <TeamProfileOverview v-else :code="team.code" />
  </div>
  <ResourceState
    v-else
    status="error"
    icon="search"
    title="Команда не найдена"
    description="Выберите франшизу из каталога NBA."
    ><template #action
      ><RouterLink to="/teams" class="gc-control"
        >Открыть каталог<AppIcon name="arrow" :size="15" /></RouterLink></template
  ></ResourceState>
</template>
