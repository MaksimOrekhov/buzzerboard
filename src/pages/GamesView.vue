<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import type { GameId, GameStatus, NbaGameDate, Team } from '@/entities/nba/model'
import { WorkerApiError } from '@/features/games/api'
import { useGameFavorites } from '@/features/games/composables/useGameFavorites'
import { useGamesForDate } from '@/features/games/composables/useGamesForDate'
import AppBadge from '@/shared/components/AppBadge.vue'
import AppButton from '@/shared/components/AppButton.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import MatchCard from '@/shared/components/MatchCard.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import { VIEWER_TIME_ZONE, getDefaultNbaGameDate } from '@/shared/utils/nbaDate'

type StatusFilter = GameStatus | 'all'
type SortDirection = 'asc' | 'desc'

const today = getDefaultNbaGameDate() as NbaGameDate
const selectedDate = shallowRef<NbaGameDate>(today)
const minDate = shiftDate(today, -30)
const maxDate = shiftDate(today, 7)
const query = useGamesForDate(() => selectedDate.value)
const { isFavorite, toggleFavorite } = useGameFavorites()

const statusOptions: readonly { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Все статусы' },
  { value: 'final', label: 'Завершённые' },
  { value: 'scheduled', label: 'Запланированные' },
  { value: 'postponed', label: 'Перенесённые' },
  { value: 'canceled', label: 'Отменённые' },
  { value: 'unknown', label: 'Статус уточняется' },
]

const statusFilter = shallowRef<StatusFilter>('all')
const teamFilter = shallowRef('all')
const favoriteOnly = shallowRef(false)
const sortDirection = shallowRef<SortDirection>('asc')
const expandedGameId = shallowRef<GameId | null>(null)

const isToday = computed(() => selectedDate.value === today)
const displayDate = computed(() =>
  new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${selectedDate.value}T12:00:00.000Z`)),
)

const games = computed(() => query.data.value?.data ?? [])
const meta = computed(() => query.data.value?.meta ?? null)
const hasQueryData = computed(() => query.data.value !== undefined)
const isFetching = computed(() => query.isFetching.value)
const isPending = computed(() => query.isPending.value)
const isError = computed(() => query.isError.value)
const isRefetchError = computed(() => query.isRefetchError.value)
const workerError = computed(() =>
  query.error.value instanceof WorkerApiError ? query.error.value.error : null,
)
const errorTitle = computed(() =>
  workerError.value?.code === 'cache_miss'
    ? 'Данные за эту дату не загружены'
    : 'Не удалось получить снимок расписания',
)
const errorDescription = computed(() =>
  workerError.value?.code === 'cache_miss'
    ? 'Worker не подтвердил полное покрытие этого дня. Отсутствие строки в недельном расписании не означает, что матчей не было.'
    : (workerError.value?.message ??
      'Проверьте соединение и повторно прочитайте общий кеш Worker.'),
)

const teamOptions = computed(() => {
  const teams = new Map<string, Team>()
  for (const game of games.value) {
    teams.set(game.homeTeam.id, game.homeTeam)
    teams.set(game.awayTeam.id, game.awayTeam)
  }
  return [...teams.values()].sort((left, right) =>
    teamName(left).localeCompare(teamName(right), 'ru'),
  )
})

const visibleGames = computed(() => {
  const filtered = games.value.filter((game) => {
    if (statusFilter.value !== 'all' && game.status !== statusFilter.value) return false
    if (
      teamFilter.value !== 'all' &&
      game.homeTeam.id !== teamFilter.value &&
      game.awayTeam.id !== teamFilter.value
    ) {
      return false
    }
    return !favoriteOnly.value || isFavorite(game.id)
  })

  const direction = sortDirection.value === 'asc' ? 1 : -1
  return filtered.sort((left, right) => {
    const leftTime = left.startsAt ? Date.parse(left.startsAt) : Number.POSITIVE_INFINITY
    const rightTime = right.startsAt ? Date.parse(right.startsAt) : Number.POSITIVE_INFINITY
    return (leftTime - rightTime) * direction || left.id.localeCompare(right.id)
  })
})

const fetchedAtLabel = computed(() => {
  const fetchedAt = meta.value?.fetchedAt
  if (!fetchedAt) return null
  const formatted = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: VIEWER_TIME_ZONE,
  }).format(new Date(fetchedAt))
  return `${meta.value?.source === 'dunkapi' ? 'DunkAPI' : 'ESPN'} · ${formatted} (${VIEWER_TIME_ZONE})`
})
const refreshWarning = computed(() => meta.value?.refreshError?.message ?? null)

function shiftDate(date: NbaGameDate, days: number): NbaGameDate {
  const shifted = new Date(`${date}T12:00:00.000Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10) as NbaGameDate
}

function teamName(team: Team): string {
  return team.displayName ?? team.abbreviation ?? 'Команда неизвестна'
}

function setDate(date: NbaGameDate): void {
  if (date < minDate || date > maxDate) return
  selectedDate.value = date
}

function onDateInput(event: Event): void {
  const target = event.target
  if (target instanceof HTMLInputElement && /^\d{4}-\d{2}-\d{2}$/.test(target.value)) {
    setDate(target.value as NbaGameDate)
  }
}

function shiftSelectedDate(days: number): void {
  setDate(shiftDate(selectedDate.value, days))
}

function toggleDetails(gameId: GameId): void {
  expandedGameId.value = expandedGameId.value === gameId ? null : gameId
}

async function rereadCache(): Promise<void> {
  await query.refetch()
}

const quickDates = [
  { label: 'Сегодня', date: shiftDate(today, 0) },
  { label: 'Вчера', date: shiftDate(today, -1) },
  { label: 'Позавчера', date: shiftDate(today, -2) },
] as const
</script>

<template>
  <div class="games-view">
    <PageHeading
      eyebrow="Расписание и результаты"
      title="Матчи"
      description="Календарь NBA, подтверждённые результаты и расписание из общего кеша. Live-обновления отключены."
    />

    <section class="games-toolbar" aria-label="Выбор игровой даты">
      <div class="selected-date">
        <span class="date-icon"><AppIcon name="calendar" :size="18" /></span>
        <div>
          <p class="eyebrow">Дата NBA · US/Eastern</p>
          <p class="date-label">{{ displayDate }}</p>
        </div>
      </div>

      <div class="date-tools">
        <div class="quick-dates" aria-label="Быстрый выбор даты">
          <AppButton
            v-for="quickDate in quickDates"
            :key="quickDate.date"
            variant="ghost"
            :aria-label="`${quickDate.label}: ${quickDate.date}`"
            :aria-pressed="selectedDate === quickDate.date"
            @click="setDate(quickDate.date)"
          >
            {{ quickDate.label }}
          </AppButton>
        </div>
        <label class="date-input-label">
          <span>Выбрать дату</span>
          <input
            type="date"
            :value="selectedDate"
            :min="minDate"
            :max="maxDate"
            aria-label="Игровая дата NBA"
            @change="onDateInput"
          />
        </label>
        <div class="date-controls">
          <AppButton
            variant="secondary"
            icon="chevron-left"
            icon-only
            :disabled="selectedDate <= minDate"
            :aria-label="`Предыдущая дата после ${displayDate}`"
            @click="shiftSelectedDate(-1)"
          />
          <AppButton
            variant="secondary"
            icon="chevron-right"
            icon-only
            :disabled="selectedDate >= maxDate"
            :aria-label="`Следующая дата после ${displayDate}`"
            @click="shiftSelectedDate(1)"
          />
        </div>
      </div>
    </section>

    <section class="games-section" aria-labelledby="games-section-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">{{ isToday ? 'Сегодня' : 'Выбранная дата' }}</p>
          <h2 id="games-section-title">Игры на площадке</h2>
        </div>
        <div v-if="meta" class="data-meta">
          <AppBadge :tone="meta.isStale ? 'warning' : 'success'" dot>
            {{ meta.isStale ? 'Кеш устарел' : 'Данные из кеша' }}
          </AppBadge>
          <span v-if="fetchedAtLabel">Обновлено · {{ fetchedAtLabel }}</span>
        </div>
      </div>

      <div class="games-actions">
        <p>Перечитывание обращается к Worker и D1; из браузера DunkAPI не вызывается.</p>
        <AppButton variant="secondary" :disabled="isFetching" @click="rereadCache">
          {{ isFetching ? 'Проверяем кеш…' : 'Перечитать кеш' }}
        </AppButton>
      </div>

      <p v-if="isRefetchError" class="games-warning" role="status">
        Не удалось перечитать кеш Worker; ниже показан последний загруженный снимок.
      </p>
      <p v-else-if="refreshWarning" class="games-warning" role="status">
        Последнее обновление источника завершилось ошибкой: {{ refreshWarning }}
      </p>

      <div v-if="hasQueryData" class="games-filters" aria-label="Фильтры матчей">
        <label>
          <span>Команда</span>
          <select v-model="teamFilter" aria-label="Фильтр по команде">
            <option value="all">Все команды</option>
            <option v-for="team in teamOptions" :key="team.id" :value="team.id">
              {{ teamName(team) }}
            </option>
          </select>
        </label>
        <label>
          <span>Статус</span>
          <select v-model="statusFilter" aria-label="Фильтр по статусу">
            <option v-for="option in statusOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label>
          <span>Порядок</span>
          <select v-model="sortDirection" aria-label="Сортировка матчей">
            <option value="asc">Сначала ранние</option>
            <option value="desc">Сначала поздние</option>
          </select>
        </label>
        <label class="favorite-filter">
          <input v-model="favoriteOnly" type="checkbox" />
          <span>Только избранные</span>
        </label>
      </div>

      <ResourceState v-if="isPending" status="loading" title="Загружаем снимок Worker" />
      <ResourceState
        v-else-if="isError && !hasQueryData"
        status="error"
        :title="errorTitle"
        :description="errorDescription"
        :error="workerError"
        :meta="meta"
      />
      <ResourceState
        v-else-if="games.length === 0"
        status="empty"
        title="Матчей на эту дату нет"
        description="Worker получил подтверждённый снимок этой даты без игр. Для незагруженных дат показано отдельное сообщение о нехватке кеша."
        :meta="meta"
      />
      <ResourceState v-else-if="visibleGames.length === 0" status="ready" :meta="meta">
        <template #default>
          <div class="filtered-empty">
            <h2>Нет матчей по выбранным фильтрам</h2>
            <p>Измените фильтры или снимите отметку «Только избранные».</p>
          </div>
        </template>
      </ResourceState>
      <ResourceState v-else status="ready" :meta="meta">
        <p class="result-count" aria-live="polite">
          Показано матчей: {{ visibleGames.length }} из {{ games.length }}
        </p>
        <div class="games-list">
          <MatchCard
            v-for="game in visibleGames"
            :key="game.id"
            :game="game"
            :favorite="isFavorite(game.id)"
            :details-expanded="expandedGameId === game.id"
            @toggle-favorite="toggleFavorite(game.id)"
            @toggle-details="toggleDetails(game.id)"
          />
        </div>
      </ResourceState>
    </section>

    <p class="games-footnote">
      <AppIcon name="database" :size="15" />
      Можно выбрать дату за последние 30 дней или на неделю вперёд. Неохваченная кешем дата не
      считается пустой.
    </p>
  </div>
</template>

<style scoped>
.games-view {
  display: grid;
  gap: 0;
}

.games-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: linear-gradient(145deg, rgb(255 255 255 / 3%), rgb(255 255 255 / 1%));
  padding: 1rem 1.1rem;
}

.selected-date {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}

.date-icon {
  display: grid;
  width: 2.65rem;
  height: 2.65rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(217 236 121 / 22%);
  border-radius: 0.8rem;
  background: var(--lime-soft);
  color: var(--lime);
}

.date-label {
  margin: 0.25rem 0 0;
  color: var(--ink);
  font-size: 0.89rem;
  font-weight: 690;
  text-transform: capitalize;
}

.date-tools,
.quick-dates,
.date-controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.date-tools {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}

.date-input-label,
.games-filters > label {
  display: grid;
  gap: 0.25rem;
  color: var(--muted);
  font-size: var(--font-size-caption);
}

.date-input-label input,
.games-filters select {
  min-height: 2.45rem;
  border: 1px solid var(--line-strong);
  border-radius: 0.65rem;
  background: var(--surface-1);
  padding: 0.4rem 0.6rem;
  color: var(--ink-soft);
  font: inherit;
}

.date-input-label input:focus-visible,
.games-filters select:focus-visible,
.favorite-filter input:focus-visible {
  outline: 2px solid var(--lime);
  outline-offset: 2px;
}

.games-section {
  margin-top: 2.1rem;
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.8rem;
}

.section-heading h2 {
  margin: 0.4rem 0 0;
  color: var(--ink);
  font-size: clamp(1.35rem, 2.5vw, 1.8rem);
  font-weight: 720;
  letter-spacing: -0.05em;
}

.data-meta {
  display: grid;
  justify-items: end;
  gap: 0.35rem;
  color: var(--muted);
  font-size: var(--font-size-caption);
}

.games-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 0.85rem;
}

.games-actions p,
.filtered-empty p {
  margin: 0;
  color: var(--muted);
  font-size: var(--font-size-caption);
  line-height: 1.5;
}

.games-warning {
  border-left: 3px solid var(--warning);
  margin: 0 0 0.85rem;
  padding: 0.55rem 0.75rem;
  color: var(--ink-soft);
  font-size: var(--font-size-body);
  line-height: 1.5;
}

.games-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.7rem;
  margin-bottom: 0.85rem;
}

.favorite-filter {
  display: flex !important;
  min-height: 2.45rem;
  align-items: center;
  gap: 0.45rem !important;
  padding-inline: 0.4rem;
  color: var(--ink-soft) !important;
  cursor: pointer;
}

.favorite-filter input {
  accent-color: var(--lime);
}

.filtered-empty h2 {
  margin: 0;
  color: var(--ink);
  font-size: 1.1rem;
}

.result-count {
  margin: 0 0 0.75rem;
  color: var(--muted);
  font-size: var(--font-size-caption);
}

.games-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 23rem), 1fr));
  gap: 0.8rem;
}

.games-footnote {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 1rem 0 0;
  color: var(--subtle);
  font-size: var(--font-size-caption);
  line-height: 1.5;
}

.games-footnote :deep(svg) {
  flex: 0 0 auto;
  color: var(--muted);
}

@media (max-width: 760px) {
  .games-toolbar,
  .games-actions,
  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .date-tools,
  .quick-dates {
    justify-content: flex-start;
  }

  .games-actions :deep(.button) {
    align-self: flex-end;
  }

  .data-meta {
    justify-items: start;
  }
}
</style>
