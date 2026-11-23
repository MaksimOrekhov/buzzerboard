<script setup lang="ts">
import { computed } from 'vue'
import AppDatePicker from '@/shared/components/AppDatePicker.vue'
import GameScoreRow from './GameScoreRow.vue'
import GameDayInsights from './GameDayInsights.vue'
import { shiftGameDate, useGameCenter } from '../composables/useGameCenter'
import type { GameStatus } from '@/entities/nba/model'
import AppButton from '@/shared/components/AppButton.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import AppSelect from '@/shared/components/AppSelect.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
import AppSearch from '@/shared/components/AppSearch.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import SnapshotStatus from '@/shared/components/SnapshotStatus.vue'
import { VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'
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
  totalPoints,
  activeFilters,
  displayDate,
  errorTitle,
  errorDescription,
  weekDates,
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
const recentDates = computed(() => [
  { label: 'Позавчера', value: shiftGameDate(today.value, -2) },
  { label: 'Вчера', value: shiftGameDate(today.value, -1) },
  { label: 'Сегодня', value: today.value },
])
const tabs = computed(() => [
  { value: 'all' as const, label: 'Все матчи', count: games.value.length },
  { value: 'final' as const, label: 'Завершённые', count: finalGames.value.length },
  { value: 'scheduled' as const, label: 'Предстоящие', count: scheduledCount.value },
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
        ><AppButton icon="refresh" :loading="isFetching" @click="query.refetch()">
          {{ isFetching ? 'Обновляем…' : 'Обновить данные' }}
        </AppButton></template
      ></PageHeading
    >
    <section class="gc-date-panel" aria-label="Выбор игровой даты">
      <div class="gc-date-panel-top">
        <AppDatePicker
          :model-value="selectedDate"
          :min="minDate"
          :max="maxDate"
          @update:model-value="setDate"
        />
        <AppSegmented
          class="gc-quick-dates"
          label="Недавние игровые даты"
          :model-value="selectedDate"
          :options="recentDates"
          @update:model-value="setDate"
        />
        <span class="gc-date-hint">Игровой день · ET</span>
      </div>
      <div class="gc-date-strip">
        <button
          class="gc-icon-button gc-week-arrow"
          aria-label="Предыдущий день"
          :disabled="selectedDate <= minDate"
          @click="setDate(shiftGameDate(selectedDate, -1))"
        >
          <AppIcon name="chevron-left" />
        </button>
        <div class="gc-week-days">
          <button
            v-for="day in weekDates"
            :key="day.date"
            class="gc-day"
            :class="{ 'gc-day--selected': day.date === selectedDate }"
            :aria-label="`${day.label}, ${day.date}`"
            :aria-pressed="day.date === selectedDate"
            :disabled="day.disabled"
            @click="setDate(day.date)"
          >
            <span>{{ day.label }}</span><strong>{{ day.day }}</strong
            ><span class="gc-day-indicator" />
          </button>
        </div>
        <button
          class="gc-icon-button gc-week-arrow"
          aria-label="Следующий день"
          :disabled="selectedDate >= maxDate"
          @click="setDate(shiftGameDate(selectedDate, 1))"
        >
          <AppIcon name="chevron-right" />
        </button>
      </div>
    </section>
    <div class="gc-workspace">
      <section class="gc-games" aria-labelledby="gc-day-heading">
        <div class="gc-day-heading">
          <div>
            <h2 id="gc-day-heading">{{ displayDate }}</h2>
            <p><AppIcon name="clock" :size="14" />Время матчей · {{ VIEWER_TIME_ZONE }}</p>
          </div>
          <span v-if="data" class="gc-game-count">{{ games.length }} матчей</span>
        </div>
        <AppSegmented
          v-if="!hasHiddenGames"
          v-model="statusFilter"
          variant="underline"
          label="Статус матчей"
          :options="tabs"
        />
        <div v-if="data" class="gc-filters" aria-label="Фильтры матчей">
          <AppSearch v-model="search" label="Поиск команды" placeholder="Найти команду" />
          <AppSelect v-model="teamFilter" label="Фильтр по команде" :options="teamOptions" /><button
            class="gc-control gc-favorites-filter"
            :aria-pressed="favoriteOnly"
            aria-label="Только избранные"
            title="Только избранные"
            @click="favoriteOnly = !favoriteOnly"
          >
            <AppIcon name="star" :size="17" /><span>Избранные</span>
          </button>
        </div>
        <div v-if="data" class="gc-list-toolbar">
          <span aria-live="polite"
            >{{
              activeFilters ? `${visibleGames.length} из ${games.length} матчей` : 'Все матчи дня'
            }}<button v-if="activeFilters" class="gc-reset" @click="resetFilters">
              Сбросить
            </button></span
          ><button
            class="gc-sort"
            :aria-label="
              sortDirection === 'asc'
                ? 'Сначала ранние. Изменить порядок'
                : 'Сначала поздние. Изменить порядок'
            "
            @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'"
          >
            <AppIcon name="sort" :size="14" />{{
              sortDirection === 'asc' ? 'По времени' : 'Сначала поздние'
            }}
          </button>
        </div>
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
            @favorite="toggleFavorite(game.id)"
            @details="toggleDetails(game.id)"
          />
        </div>
        <SnapshotStatus v-if="meta" :meta="meta" />
      </section>
      <GameDayInsights
        v-if="games.length && !hasHiddenGames"
        :closest="closestGame"
        :highest="highestGame"
        :total-points="totalPoints"
        :final-count="scoredCount"
      />
    </div>
  </div>
</template>
