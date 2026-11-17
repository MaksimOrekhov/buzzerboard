<script setup lang="ts">
import { computed } from 'vue'
import GameDatePicker from './GameDatePicker.vue'
import GameScoreRow from './GameScoreRow.vue'
import GameDayInsights from './GameDayInsights.vue'
import { shiftGameDate, useGameCenter } from '../composables/useGameCenter'
import type { GameStatus } from '@/entities/nba/model'
import AppIcon from '@/shared/components/AppIcon.vue'
import CenterIcon from '@/shared/components/v2/CenterIcon.vue'
import CenterSelect from '@/shared/components/v2/CenterSelect.vue'
import { VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'
const {
  today,
  minDate,
  maxDate,
  selectedDate,
  query,
  games,
  meta,
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
  fetchedAtLabel,
  sourceLabel,
  errorTitle,
  errorDescription,
  weekDates,
  setDate,
  resetFilters,
  toggleDetails,
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
  { value: 'all' as const, label: 'Все матчи', count: games.value.length },
  { value: 'final' as const, label: 'Завершённые', count: finalGames.value.length },
  { value: 'scheduled' as const, label: 'Предстоящие', count: scheduledCount.value },
  ...Object.entries(labels)
    .filter(([status]) => games.value.some((game) => game.status === status))
    .map(([value, label]) => ({
      value: value as GameStatus,
      label: label!,
      count: games.value.filter((game) => game.status === value).length,
    })),
])
const scoredCount = computed(
  () =>
    finalGames.value.filter((game) => game.score.home !== null && game.score.away !== null).length,
)
</script>
<template>
  <div class="gc-view">
    <header class="gc-page-heading">
      <div>
        <div class="gc-page-kicker">
          <span class="gc-league-dot" />NBA<span class="gc-heading-divider">/</span>Расписание и
          результаты
        </div>
        <h1>Game Center<span class="gc-title-dot">.</span></h1>
        <p>Весь игровой день. Каждый результат.</p>
      </div>
      <button class="gc-control gc-refresh" :disabled="isFetching" @click="query.refetch()">
        <CenterIcon name="refresh" :class="{ 'gc-spinning': isFetching }" :size="17" />{{
          isFetching ? 'Обновляем…' : 'Обновить данные'
        }}
      </button>
    </header>
    <section class="gc-date-panel" aria-label="Выбор игровой даты">
      <div class="gc-date-panel-top">
        <GameDatePicker
          :model-value="selectedDate"
          :min="minDate"
          :max="maxDate"
          @update:model-value="setDate"
        />
        <div class="gc-quick-dates">
          <button
            v-for="quick in [
              { label: 'Позавчера', offset: -2 },
              { label: 'Вчера', offset: -1 },
              { label: 'Сегодня', offset: 0 },
            ]"
            :key="quick.offset"
            class="gc-quick-date"
            :aria-pressed="selectedDate === shiftGameDate(today, quick.offset)"
            @click="setDate(shiftGameDate(today, quick.offset))"
          >
            {{ quick.label }}
          </button>
        </div>
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
        <div class="gc-status-tabs" role="group" aria-label="Статус матчей">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            class="gc-status-tab"
            :aria-pressed="statusFilter === tab.value"
            @click="statusFilter = tab.value"
          >
            {{ tab.label }}<span v-if="data">{{ tab.count }}</span>
          </button>
        </div>
        <div v-if="data" class="gc-filters" aria-label="Фильтры матчей">
          <label class="gc-search"
            ><CenterIcon name="search" :size="17" /><input
              v-model="search"
              type="search"
              placeholder="Найти команду"
              aria-label="Поиск команды" /></label
          ><CenterSelect
            v-model="teamFilter"
            label="Фильтр по команде"
            :options="teamOptions"
          /><button
            class="gc-control gc-favorites-filter"
            :aria-pressed="favoriteOnly"
            aria-label="Только избранные"
            title="Только избранные"
            @click="favoriteOnly = !favoriteOnly"
          >
            <CenterIcon name="star" :size="17" /><span>Избранные</span>
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
            <CenterIcon name="sort" :size="14" />{{
              sortDirection === 'asc' ? 'По времени' : 'Сначала поздние'
            }}
          </button>
        </div>
        <p v-if="isRefetchError" class="gc-notice gc-notice--warning" role="status">
          Не удалось обновить данные. Показаны последние загруженные результаты.
        </p>
        <p v-else-if="meta?.refreshError" class="gc-notice gc-notice--warning" role="status">
          Источник временно недоступен. Показаны последние загруженные результаты.
        </p>
        <div v-if="isPending" class="gc-skeleton-list" aria-busy="true">
          <span class="visually-hidden">Загрузка матчей</span>
          <div v-for="n in 6" :key="n" class="gc-skeleton-row"><span /><span /><span /></div>
        </div>
        <div v-else-if="isError && !data" class="gc-state" role="alert">
          <AppIcon name="calendar" :size="32" />
          <h3>{{ errorTitle }}</h3>
          <p>{{ errorDescription }}</p>
          <button class="gc-control" @click="query.refetch()">Попробовать снова</button>
        </div>
        <div v-else-if="games.length === 0" class="gc-state">
          <AppIcon name="calendar" :size="32" />
          <h3>В этот день матчей нет</h3>
          <p>В расписании на выбранный день нет игр.<br />Выберите другую дату.</p>
        </div>
        <div v-else-if="visibleGames.length === 0" class="gc-state">
          <CenterIcon name="search" :size="32" />
          <h3>Матчи не найдены</h3>
          <p>Попробуйте изменить запрос или фильтры.</p>
          <button class="gc-control" @click="resetFilters">Сбросить фильтры</button>
        </div>
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
            @favorite="toggleFavorite(game.id)"
            @details="toggleDetails(game.id)"
          />
        </div>
        <div
          v-if="meta"
          class="gc-data-status"
          :class="{ 'gc-data-status--stale': meta.isStale }"
          role="status"
        >
          <span class="gc-data-dot" /><span
            >{{ meta.isStale ? 'Данные устарели' : 'Обновлено'
            }}<span v-if="meta.isStale"> · Обновлено</span> {{ fetchedAtLabel }}</span
          >
          <details class="gc-source-details">
            <summary>Источник<CenterIcon name="down" :size="12" /></summary>
            <p>
              {{ sourceLabel }} · {{ VIEWER_TIME_ZONE }}<br />Время загрузки:
              {{ fetchedAtLabel }}.<br />{{
                meta.providerUpdatedAt
                  ? `Обновление источника: ${meta.providerUpdatedAt}`
                  : 'Источник не указал точное время обновления.'
              }}<br />Отклонено записей: {{ meta.rejectedRecords }}.
            </p>
          </details>
        </div>
      </section>
      <GameDayInsights
        v-if="games.length"
        :closest="closestGame"
        :highest="highestGame"
        :total-points="totalPoints"
        :final-count="scoredCount"
      />
    </div>
    <footer class="gc-page-footer">
      <span><AppIcon name="basketball" :size="15" />Баскетбол в деталях.</span
      ><span>NBA · BuzzerBoard</span>
    </footer>
  </div>
</template>
