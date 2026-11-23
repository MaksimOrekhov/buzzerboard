<script setup lang="ts">
import '../../standings/standings.css'
import '../teams.css'
import SpoilerAggregateGate from '@/features/spoilers/SpoilerAggregateGate.vue'
import { RouterLink } from 'vue-router'
import { useTeamsDirectory } from '../composables/useTeamsDirectory'
import PageHeading from '@/shared/components/PageHeading.vue'
import AppSearch from '@/shared/components/AppSearch.vue'
import AppSelect from '@/shared/components/AppSelect.vue'
import AppButton from '@/shared/components/AppButton.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import AppBadge from '@/shared/components/AppBadge.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import SnapshotStatus from '@/shared/components/SnapshotStatus.vue'
import TeamDirectoryCard from './TeamDirectoryCard.vue'
const {
  statsHidden,
  query,
  favoriteIds,
  isFavorite,
  toggleFavorite,
  search,
  conference,
  favoriteOnly,
  sortBy,
  sortDirection,
  sortOptions,
  teams,
  visibleTeams,
  activeFilters,
  resetFilters,
  toggleSortDirection,
} = useTeamsDirectory()
const { data, isPending, isError, isFetching, isRefetchError } = query
</script>

<template>
  <div class="teams-center">
    <PageHeading
      eyebrow="30 франшиз · единая лига"
      title="Команды NBA"
      description="Сезонные показатели из BBS, избранное и профили каждой команды — в одном месте."
    >
      <template #actions
        ><AppButton icon="refresh" :loading="isFetching" @click="query.refetch()">{{
          isFetching ? 'Обновляем…' : 'Обновить каталог'
        }}</AppButton></template
      >
    </PageHeading>
    <section class="teams-intro" aria-label="Сводка каталога">
      <div class="teams-intro-copy">
        <span class="teams-eyebrow">BBS · сезон 2026/27</span
        ><strong>Все 30 команд. Данные по мере доступности.</strong
        ><span
          >Поиск по названию, конференции и дивизиону. Откройте профиль для полного сезонного
          среза.</span
        >
      </div>
      <div v-if="!statsHidden" class="teams-intro-stat">
        <span>Профили с данными</span
        ><strong>{{ data?.coverage.available ?? 0 }}<small> / 30</small></strong>
        <div class="teams-coverage-meter">
          <span :style="{ width: `${((data?.coverage.available ?? 0) / 30) * 100}%` }" />
        </div>
      </div>
      <div class="teams-intro-mark" aria-hidden="true">
        <span>NBA</span><AppIcon name="basketball" :size="44" />
      </div>
    </section>
    <nav class="teams-directory-guides" aria-label="Справочники NBA">
      <RouterLink :to="{ name: 'arenas' }" class="gc-control">
        <AppIcon name="pin" :size="16" />Арены NBA<AppIcon name="arrow" :size="15" />
      </RouterLink>
      <RouterLink :to="{ name: 'cities' }" class="gc-control">
        <AppIcon name="globe" :size="16" />Города NBA<AppIcon name="arrow" :size="15" />
      </RouterLink>
    </nav>
    <div class="teams-toolbar">
      <AppSegmented
        v-model="conference"
        label="Фильтр по конференции"
        :options="[
          { value: 'all', label: 'Все', count: teams.length },
          {
            value: 'east',
            label: 'Восток',
            count: teams.filter((team) => team.conference === 'east').length,
          },
          {
            value: 'west',
            label: 'Запад',
            count: teams.filter((team) => team.conference === 'west').length,
          },
        ]"
      />
      <div class="teams-toolbar-controls">
        <AppSearch v-model="search" label="Поиск команды" placeholder="Команда или дивизион" />
        <AppSelect
          v-if="!statsHidden"
          v-model="sortBy"
          label="Сортировать команды"
          :options="sortOptions"
        />
        <AppButton
          v-if="!statsHidden"
          icon="sort"
          :aria-label="`Порядок сортировки: ${sortDirection === 'descending' ? 'по убыванию' : 'по возрастанию'}`"
          @click="toggleSortDirection"
          ><span>{{
            sortDirection === 'descending' ? 'По убыванию' : 'По возрастанию'
          }}</span></AppButton
        >
        <AppButton
          icon="star"
          :aria-pressed="favoriteOnly"
          :class="{ 'ui-selected': favoriteOnly }"
          @click="favoriteOnly = !favoriteOnly"
          >Избранные <span>{{ favoriteIds.size }}</span></AppButton
        >
      </div>
    </div>
    <SpoilerAggregateGate
      v-if="statsHidden && data"
      scope="team-directory"
      title="Сезонные показатели команд скрыты"
    />
    <div v-if="data" class="teams-results-meta">
      <span>{{ visibleTeams.length }} из {{ teams.length }} команд</span
      ><button v-if="activeFilters" class="gc-reset" @click="resetFilters">Сбросить фильтры</button>
    </div>
    <p
      v-if="isRefetchError || data?.meta?.refreshError"
      class="gc-notice gc-notice--warning"
      role="status"
    >
      Обновить данные не удалось. Показан последний доступный снимок.
    </p>
    <ResourceState v-if="isPending" status="loading" /><ResourceState
      v-else-if="isError && !data"
      status="error"
      icon="users"
      title="Каталог пока не загружен"
      description="Данные команд пока недоступны. Попробуйте ещё раз позже."
      ><template #action
        ><AppButton @click="query.refetch()">Повторить</AppButton></template
      ></ResourceState
    >
    <ResourceState
      v-else-if="visibleTeams.length === 0"
      status="empty"
      icon="search"
      :title="activeFilters ? 'Команды не найдены' : 'Данных пока нет'"
      :description="
        activeFilters ? 'Измените поиск или фильтры.' : 'Попробуйте обновить каталог позже.'
      "
      ><template v-if="activeFilters" #action
        ><AppButton @click="resetFilters">Сбросить фильтры</AppButton></template
      ></ResourceState
    >
    <div v-else class="teams-grid">
      <TeamDirectoryCard
        v-for="entry in visibleTeams"
        :key="entry.code"
        :entry="entry"
        :stats-hidden="statsHidden"
        :favorite="isFavorite(entry.team.id)"
        @toggle-favorite="toggleFavorite"
      />
    </div>
    <div class="teams-directory-note">
      <AppBadge tone="neutral" dot>Составы не публикуются</AppBadge>
      <p>
        Каталог использует BBS и официальное соответствие конференций и дивизионов NBA. Расширенная
        статистика появится, если источник её предоставит.
      </p>
      <RouterLink to="/standings">Турнирная таблица<AppIcon name="arrow" :size="14" /></RouterLink>
    </div>
    <SnapshotStatus v-if="data?.meta" :meta="data.meta" />
  </div>
</template>
