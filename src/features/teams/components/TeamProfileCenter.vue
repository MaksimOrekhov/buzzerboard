<script setup lang="ts">
import '../../standings/standings.css'
import '../teams.css'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { findNbaTeam } from '@/entities/nba/teamCatalog'
import { WorkerApiError } from '@/shared/api/nba/workerClient'
import { useTeamSeason } from '../composables/useTeamSeason'
import { TEAM_SEASON_END_YEAR } from '../season'
import { useTeamFavorites } from '@/features/standings/composables/useTeamFavorites'
import PageHeading from '@/shared/components/PageHeading.vue'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import AppButton from '@/shared/components/AppButton.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import SnapshotStatus from '@/shared/components/SnapshotStatus.vue'
import TeamSeasonPanel from './TeamSeasonPanel.vue'
import TeamResultsPanel from './TeamResultsPanel.vue'
const route = useRoute()
const code = computed(() =>
  typeof route.params.teamCode === 'string' ? route.params.teamCode.toUpperCase() : '',
)
const team = computed(() => findNbaTeam(code.value))
const query = useTeamSeason(code, TEAM_SEASON_END_YEAR)
const { data, isPending, isFetching, isRefetchError } = query
const { isFavorite, toggleFavorite } = useTeamFavorites()
const favorite = computed(() => Boolean(team.value && isFavorite(team.value.team.id)))
const errorTitle = computed(() =>
  query.error.value instanceof WorkerApiError && query.error.value.error.code === 'cache_miss'
    ? 'Профиль ещё не кэширован'
    : 'Не удалось загрузить профиль',
)
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
        <RouterLink to="/standings" class="gc-control"
          >Турнирная таблица<AppIcon name="arrow" :size="14" /></RouterLink
        ><RouterLink to="/games" class="gc-control"
          >Матчи<AppIcon name="arrow" :size="14"
        /></RouterLink>
      </div>
    </section>
    <p v-if="isRefetchError" class="gc-notice gc-notice--warning" role="status">
      Последнее обновление не удалось. Доступный снимок остаётся виден.
    </p>
    <ResourceState v-if="isPending" status="loading" /><ResourceState
      v-else-if="!data"
      status="error"
      icon="basketball"
      :title="errorTitle"
      description="Профиль читается только из локального BBS cache. Вернитесь позже или откройте другой раздел."
      ><template #action
        ><AppButton :loading="isFetching" @click="query.refetch()">Повторить запрос</AppButton
        ><RouterLink to="/teams" class="gc-control">Все команды</RouterLink></template
      ></ResourceState
    >
    <template v-else>
      <div class="teams-profile-overview">
        <div>
          <span class="teams-eyebrow"
            >Сезон {{ data.data.seasonEndYear - 1 }}/{{
              String(data.data.seasonEndYear).slice(-2)
            }}</span
          ><strong>{{ data.data.wins ?? '—' }}–{{ data.data.losses ?? '—' }}</strong
          ><small>победы — поражения</small>
        </div>
        <div>
          <span>Место в лиге</span
          ><strong>{{ data.data.overallRank ? `#${data.data.overallRank}` : '—' }}</strong
          ><small>из 30 команд</small>
        </div>
        <div>
          <span>Последние 10</span
          ><strong>{{
            data.data.lastTen
              ? `${data.data.lastTen.filter((game) => game.result === 'W').length}–${data.data.lastTen.filter((game) => game.result === 'L').length}`
              : '—'
          }}</strong
          ><small>по сезонному срезу BBS</small>
        </div>
        <div>
          <span>Сезонных лидеров</span><strong>{{ data.data.leaders.length }}</strong
          ><small>строк от источника</small>
        </div>
      </div>
      <div class="teams-profile-columns">
        <TeamSeasonPanel :profile="data.data" /><TeamResultsPanel :profile="data.data" />
      </div>
      <p v-if="data.data.conferenceRank === null" class="teams-profile-note">
        <AppIcon name="database" :size="16" />Ранг в конференции не возвращается BBS. Конференция и
        дивизион показаны по текущему справочнику NBA.
      </p>
      <SnapshotStatus :meta="data.meta" />
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
