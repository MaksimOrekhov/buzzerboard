<script setup lang="ts">
import '../../standings/standings.css'
import '../teams.css'
import { computed, defineAsyncComponent } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { arenaPath, getTeamArena } from '@/entities/nba/arenaDirectory'
import { cityPath, getTeamCity } from '@/entities/nba/cityDirectory'
import CityTeamSpotlight from '@/features/cities/components/CityTeamSpotlight.vue'
import { findNbaTeam } from '@/entities/nba/teamCatalog'
import { useTeamFavorites } from '@/features/standings/composables/useTeamFavorites'
import PageHeading from '@/shared/components/PageHeading.vue'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import AppButton from '@/shared/components/AppButton.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import TeamProfileOverview from './TeamProfileOverview.vue'

const TeamHistoryPanel = defineAsyncComponent(() => import('./TeamHistoryPanel.vue'))
const TeamCoachesPanel = defineAsyncComponent(() => import('./TeamCoachesPanel.vue'))
const sections = [
  { label: 'Обзор', tab: null },
  { label: 'История', tab: 'history' },
  { label: 'Тренеры', tab: 'coaches' },
]
const route = useRoute()
const code = computed(() =>
  typeof route.params.teamCode === 'string' ? route.params.teamCode.toUpperCase() : '',
)
const team = computed(() => findNbaTeam(code.value))
const arena = computed(() => getTeamArena(code.value))
const city = computed(() => getTeamCity(code.value))
const activeTab = computed(() => sections.find(({ tab }) => tab === route.query.tab)?.tab ?? null)
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
      class="teams-profile-heading"
      eyebrow="Профиль франшизы"
      :title="team.name"
      :description="`${team.conference === 'east' ? 'Восточная' : 'Западная'} конференция · дивизион ${team.division}`"
      :title-dot="false"
    >
      <template #leading><TeamLogo :team="team.team" :size="64" /></template>
      <template #actions>
        <AppButton
          class="teams-profile-favorite"
          icon="star"
          :aria-label="`Избранное: ${team.name}`"
          :aria-pressed="favorite"
          @click="toggleFavorite(team.team.id)"
        >
          {{ favorite ? 'В избранном' : 'В избранное' }}
        </AppButton>
      </template>
    </PageHeading>
    <nav class="teams-profile-links" aria-label="Связанные разделы">
      <RouterLink v-if="arena" :to="arenaPath(arena)" class="ui-text-link">
        Арена<AppIcon name="pin" :size="14" />
      </RouterLink>
      <RouterLink v-if="city" :to="cityPath(city)" class="ui-text-link">
        Город<AppIcon name="globe" :size="14" />
      </RouterLink>
      <RouterLink :to="{ path: '/players', query: { team: code } }" class="ui-text-link">
        Игроки<AppIcon name="arrow" :size="14" />
      </RouterLink>
      <RouterLink to="/standings" class="ui-text-link">
        Турнирная таблица<AppIcon name="arrow" :size="14" />
      </RouterLink>
      <RouterLink to="/games" class="ui-text-link">
        Матчи<AppIcon name="arrow" :size="14" />
      </RouterLink>
    </nav>
    <nav class="gc-status-tabs teams-profile-nav" aria-label="Разделы профиля">
      <RouterLink
        v-for="section in sections"
        :key="section.label"
        v-slot="{ href, navigate }"
        :to="{
          path: route.path,
          query: section.tab ? { ...overviewQuery, tab: section.tab } : overviewQuery,
        }"
        custom
      >
        <a
          :href="href"
          class="gc-status-tab"
          :aria-current="section.tab === activeTab ? 'page' : undefined"
          @click="navigate"
        >
          {{ section.label }}
        </a>
      </RouterLink>
    </nav>
    <TeamHistoryPanel v-if="activeTab === 'history'" :key="team.code" :team-code="team.code" />
    <TeamCoachesPanel v-else-if="activeTab === 'coaches'" :key="team.code" :team-code="team.code" />
    <template v-else>
      <CityTeamSpotlight v-if="city" :city="city" />
      <TeamProfileOverview :code="team.code" />
    </template>
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
