<script setup lang="ts">
import { computed } from 'vue'
import GameCenterDatePanel from './GameCenterDatePanel.vue'
import GameCenterFilters from './GameCenterFilters.vue'
import GameScoreRow from './GameScoreRow.vue'
import GameDayInsights from './GameDayInsights.vue'
import { useGameCenter } from '../composables/useGameCenter'
import type { GameStatus } from '@/entities/nba/model'
import AppButton from '@/shared/components/AppButton.vue'

import PageHeading from '@/shared/components/PageHeading.vue'

import ResourceState from '@/shared/components/ResourceState.vue'
import SnapshotStatus from '@/shared/components/SnapshotStatus.vue'

const {
  today,
  minDate,
  maxDate,
  selectedDate,
  query,
  games,
  hasHiddenGames,
  statusOf,
  meta,
  yesterdayPending,
  visibleGames,
  teamOptions,
  statusFilter,
  teamFilter,
  search,
  favoriteOnly,
  sortDirection,
  expandedGameId,
  finalGames,
  scheduledCount,
  closestGame,
  highestGame,
  activeFilters,
  activeFilterCount,
  errorTitle,
  errorDescription,
  setDate,
  resetFilters,
  toggleDetails,
  detailsTo,
  isFavorite,
  toggleFavorite,
} = useGameCenter()
const { isFetching, isPending, isError, isRefetchError, data } = query
const labels: Partial<Record<GameStatus, string>> = {
  postponed: 'Перенесённые',
  canceled: 'Отменённые',
  suspended: 'Приостановленные',
  unknown: 'Уточняются',
  live: 'Уточняются',
}
const tabs = computed(() => [
  { value: 'all' as const, label: 'Все', count: games.value.length },
  { value: 'final' as const, label: 'Завершены', count: finalGames.value.length },
  { value: 'scheduled' as const, label: 'Впереди', count: scheduledCount.value },
  ...Object.entries(labels)
    .filter(([status]) => games.value.some((game) => statusOf(game) === status))
    .map(([value, label]) => ({
      value: value as GameStatus,
      label: label!,
      count: games.value.filter((game) => statusOf(game) === value).length,
    })),
])
const scoredCount = computed(
  () =>
    finalGames.value.filter((game) => game.score.home !== null && game.score.away !== null).length,
)
</script>
<template>
  <div class="gc-view">
    <PageHeading
      eyebrow="Расписание и результаты"
      title="Game Center"
      description="Весь игровой день. Каждый результат."
      ><template #actions
        ><AppButton
          class="gc-refresh"
          icon="refresh"
          aria-label="Обновить данные"
          :loading="isFetching"
          @click="query.refetch()"
        >
          {{ isFetching ? 'Обновляем…' : 'Обновить данные' }}
        </AppButton></template
      ></PageHeading
    >
    <GameCenterDatePanel
      :date="selectedDate"
      :today="today"
      :min="minDate"
      :max="maxDate"
      @select="setDate"
    />
    <div class="gc-workspace">
      <section class="gc-games" aria-labelledby="gc-day-heading">
        <div class="gc-day-heading">
          <div>
            <span class="gc-section-kicker">Результаты и расписание</span>
            <h2 id="gc-day-heading">
              Матчи дня
              <span v-if="data && !hasHiddenGames" class="gc-game-count">{{ games.length }}</span>
            </h2>
          </div>
        </div>
        <GameCenterFilters
          v-show="!!data"
          v-model:status="statusFilter"
          v-model:team="teamFilter"
          v-model:search="search"
          v-model:favorite="favoriteOnly"
          v-model:sort="sortDirection"
          :tabs="tabs"
          :team-options="teamOptions"
          :show-status="!hasHiddenGames"
          :active-count="activeFilterCount"
          @reset="resetFilters"
        />
        <div v-if="data && activeFilters" class="gc-filter-summary" aria-live="polite">
          {{ visibleGames.length }} из {{ games.length }} матчей
          <button class="gc-reset" @click="resetFilters">Сбросить</button>
        </div>
        <SnapshotStatus v-if="meta" :meta="meta" show-source :refresh-failed="isRefetchError" />
        <p v-if="isRefetchError" class="gc-notice gc-notice--warning" role="status">
          Не удалось обновить данные. Показаны последние загруженные результаты.
        </p>
        <p v-else-if="meta?.refreshError" class="gc-notice gc-notice--warning" role="status">
          Обновление из источника задерживается. Показаны последние загруженные данные.
        </p>
        <p v-else-if="yesterdayPending" class="gc-notice" role="status">
          Ждём подтверждённые результаты от источника.
        </p>
        <ResourceState v-if="isPending" status="loading" />
        <ResourceState
          v-else-if="isError && !data"
          status="error"
          icon="calendar"
          :title="errorTitle"
          :description="errorDescription"
          ><template #action
            ><button class="gc-control" @click="query.refetch()">
              Попробовать снова
            </button></template
          ></ResourceState
        >
        <ResourceState
          v-else-if="games.length === 0"
          status="empty"
          icon="calendar"
          title="В этот день матчей нет"
          description="В расписании на выбранный день нет игр. Выберите другую дату."
        />
        <ResourceState
          v-else-if="visibleGames.length === 0"
          status="empty"
          icon="search"
          title="Матчи не найдены"
          description="Попробуйте изменить запрос или фильтры."
          ><template #action
            ><button class="gc-control" @click="resetFilters">Сбросить фильтры</button></template
          ></ResourceState
        >
        <div v-else class="gc-scoreboard">
          <div class="gc-scoreboard-labels" aria-hidden="true">
            <span>Начало</span><span>Гости</span><span>Счёт</span><span>Хозяева</span><span />
          </div>
          <GameScoreRow
            v-for="game in visibleGames"
            :key="game.id"
            :game="game"
            :favorite="isFavorite(game.id)"
            :expanded="expandedGameId === game.id"
            :details-to="detailsTo(game)"
            scoreboard
            @favorite="toggleFavorite(game.id)"
            @details="toggleDetails(game.id)"
          />
        </div>
      </section>
      <GameDayInsights
        v-if="games.length && !hasHiddenGames"
        :closest="closestGame"
        :highest="highestGame"
        :final-count="scoredCount"
        :details-to="detailsTo"
      />
    </div>
  </div>
</template>
