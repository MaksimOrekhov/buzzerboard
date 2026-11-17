<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import type { Conference, SeasonEndYear } from '@/entities/nba/model'
import { WorkerApiError } from '@/shared/api/nba/workerClient'
import { useStandings } from '@/features/standings/composables/useStandings'
import { useTeamFavorites } from '@/features/standings/composables/useTeamFavorites'
import { deriveConferenceStandings, sortStandingsRows } from '@/features/standings/standingsModel'
import type { SortDirection, StandingsSortKey } from '@/features/standings/standingsModel'
import AppBadge from '@/shared/components/AppBadge.vue'
import AppButton from '@/shared/components/AppButton.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import StandingsTable from '@/shared/components/StandingsTable.vue'
import { VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'

const SEASON_END_YEAR = 2027 as SeasonEndYear
const query = useStandings(SEASON_END_YEAR)
const { favoriteIds, isFavorite, toggleFavorite } = useTeamFavorites()

const conference = shallowRef<Conference>('east')
const favoriteOnly = shallowRef(false)
const sortBy = shallowRef<StandingsSortKey>('winPercentage')
const sortDirection = shallowRef<SortDirection>('descending')

const snapshot = computed(() => query.data.value ?? null)
const meta = computed(() => snapshot.value?.meta ?? null)
const rows = computed(() => snapshot.value?.data ?? [])
const activeStandings = computed(() =>
  deriveConferenceStandings(rows.value, conference.value, SEASON_END_YEAR),
)
const visibleRows = computed(() => {
  const filtered = favoriteOnly.value
    ? activeStandings.value.rows.filter((row) => isFavorite(row.team.id))
    : activeStandings.value.rows

  return sortStandingsRows(
    filtered,
    sortBy.value,
    sortDirection.value,
    activeStandings.value.gamesBehindByTeamId,
  )
})
const sourceLabel = computed(() => {
  if (!meta.value) return null
  return meta.value.source === 'dunkapi' ? 'DunkAPI' : 'ESPN'
})
const fetchedAtLabel = computed(() => {
  if (!meta.value?.fetchedAt) return null
  const date = new Date(meta.value.fetchedAt)
  if (!Number.isFinite(date.getTime())) return 'время не указано'

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: VIEWER_TIME_ZONE,
  }).format(date)
})
const workerError = computed(() =>
  query.error.value instanceof WorkerApiError ? query.error.value.error : null,
)
const isPending = computed(() => query.isPending.value)
const hasData = computed(() => query.data.value !== undefined)
const isFetching = computed(() => query.isFetching.value)
const isRefetchError = computed(() => query.isRefetchError.value)
const isInitialError = computed(() => query.isError.value && !hasData.value)
const errorTitle = computed(() =>
  workerError.value?.code === 'cache_miss'
    ? 'Снимок таблицы ещё не сохранён'
    : 'Не удалось получить таблицу NBA',
)
const errorDescription = computed(() =>
  workerError.value?.code === 'cache_miss'
    ? 'Worker не подтвердил наличие снимка в D1. Перечитывание проверит кеш и не запускает запрос к DunkAPI.'
    : (workerError.value?.message ?? 'Проверьте соединение и повторно прочитайте кеш Worker.'),
)
const conferenceLabel = computed(() =>
  conference.value === 'east' ? 'Восточная конференция' : 'Западная конференция',
)
const visibleTeamCount = computed(() => visibleRows.value.length)
const seasonLabel = computed(() => `${SEASON_END_YEAR - 1}/${String(SEASON_END_YEAR).slice(-2)}`)

watch(
  () => activeStandings.value.gamesBehindAvailable,
  (available) => {
    if (!available && sortBy.value === 'gamesBehind') {
      sortBy.value = 'winPercentage'
      sortDirection.value = 'descending'
    }
  },
)

function selectSort(field: StandingsSortKey): void {
  if (field === 'gamesBehind' && !activeStandings.value.gamesBehindAvailable) return

  if (sortBy.value === field) {
    sortDirection.value = sortDirection.value === 'ascending' ? 'descending' : 'ascending'
    return
  }

  sortBy.value = field
  sortDirection.value = field === 'gamesBehind' ? 'ascending' : 'descending'
}

function onSortChange(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  selectSort(target.value as StandingsSortKey)
}

async function rereadCache(): Promise<void> {
  await query.refetch()
}
</script>

<template>
  <div class="standings-view">
    <PageHeading
      :eyebrow="`Сезон ${seasonLabel} · общий кеш D1`"
      title="Турнирная таблица"
      description="Текущие показатели команд NBA из сохранённого снимка. Официальные места, посев и тай-брейки источник не предоставляет."
    />

    <section class="standings-toolbar" aria-label="Параметры турнирной таблицы">
      <div class="conference-tabs" role="group" aria-label="Конференция">
        <button type="button" :aria-pressed="conference === 'east'" @click="conference = 'east'">
          Восток
        </button>
        <button type="button" :aria-pressed="conference === 'west'" @click="conference = 'west'">
          Запад
        </button>
      </div>

      <div class="standings-controls">
        <label class="favorite-filter">
          <input v-model="favoriteOnly" type="checkbox" />
          <span>Только избранные</span>
        </label>
        <AppButton variant="secondary" :disabled="isFetching" @click="rereadCache">
          {{ isFetching ? 'Читаем кеш…' : 'Перечитать кеш' }}
        </AppButton>
      </div>
    </section>

    <section class="standings-section" :aria-labelledby="`standings-${conference}-title`">
      <header class="section-heading">
        <div>
          <p class="eyebrow">{{ seasonLabel }} · NBA</p>
          <h2 :id="`standings-${conference}-title`">{{ conferenceLabel }}</h2>
        </div>
        <div class="section-meta">
          <AppBadge v-if="meta" :tone="meta.isStale ? 'warning' : 'success'" dot>
            {{ meta.isStale ? 'Устаревший снимок' : 'Из D1-кеша' }}
          </AppBadge>
          <span v-if="sourceLabel">Источник · {{ sourceLabel }}</span>
          <span v-if="fetchedAtLabel"
            >Обновлено · {{ fetchedAtLabel }} · {{ VIEWER_TIME_ZONE }}</span
          >
        </div>
      </header>

      <p class="standings-cache-note">
        <AppIcon name="database" :size="16" />
        Перечитывание обращается только к Worker GET и существующему D1-кешу. Обновление DunkAPI не
        запускается.
      </p>

      <p v-if="isRefetchError" class="standings-warning" role="status">
        Не удалось перечитать Worker; показан последний успешно загруженный снимок.
      </p>
      <p v-else-if="meta?.refreshError" class="standings-warning" role="status">
        Последнее обновление источника завершилось ошибкой; отображается сохранённый снимок.
      </p>
      <p v-if="meta && meta.rejectedRecords > 0" class="standings-warning" role="status">
        Worker отклонил {{ meta.rejectedRecords }} записей при нормализации; таблица может быть
        неполной.
      </p>

      <div v-if="hasData && !isPending" class="standings-filters" aria-label="Фильтры таблицы">
        <label>
          <span>Сортировать</span>
          <select :value="sortBy" aria-label="Сортировка турнирной таблицы" @change="onSortChange">
            <option value="winPercentage">Процент побед</option>
            <option value="wins">Победы</option>
            <option value="gamesBehind" :disabled="!activeStandings.gamesBehindAvailable">
              GB · расчёт
            </option>
            <option value="homeWins">Дома</option>
            <option value="awayWins">В гостях</option>
            <option value="lastTenWins">Победы в последних 10</option>
            <option value="averageMargin">Средняя разница очков</option>
          </select>
        </label>
        <label>
          <span>Порядок</span>
          <select v-model="sortDirection" aria-label="Порядок сортировки">
            <option value="descending">По убыванию</option>
            <option value="ascending">По возрастанию</option>
          </select>
        </label>
        <p>{{ visibleTeamCount }} из 15 команд конференции</p>
      </div>

      <ResourceState
        v-if="isPending"
        status="loading"
        title="Загружаем снимок Worker"
        description="Читаем сохранённые данные из общего кеша."
      />
      <ResourceState
        v-else-if="isInitialError"
        status="error"
        :title="errorTitle"
        :description="errorDescription"
        :error="workerError"
      >
        <template #action>
          <AppButton variant="secondary" @click="rereadCache">Перечитать кеш</AppButton>
        </template>
      </ResourceState>
      <ResourceState
        v-else-if="visibleRows.length === 0"
        status="empty"
        icon="trophy"
        :title="favoriteOnly ? 'В избранном нет команд' : 'Данные таблицы отсутствуют'"
        :description="
          favoriteOnly
            ? 'Добавьте команды в избранное, чтобы увидеть их здесь.'
            : 'В успешном ответе Worker нет строк этой конференции.'
        "
      />
      <div v-else class="standings-content">
        <p v-if="activeStandings.warning" class="standings-warning" role="status">
          {{ activeStandings.warning }}
        </p>
        <StandingsTable
          :rows="visibleRows"
          :conference="conference"
          :games-behind-by-team-id="activeStandings.gamesBehindByTeamId"
          :favorite-ids="favoriteIds"
          :sort-by="sortBy"
          :sort-direction="sortDirection"
          @sort="selectSort"
          @toggle-favorite="toggleFavorite"
        />
      </div>

      <aside class="data-limitations" aria-label="Ограничения источника">
        <p>
          Место, посев плей-офф, серия побед/поражений и тай-брейки не выводятся из порядка строк.
          PCT сортируется по убыванию; при равных значениях команды идут по названию. GB
          показывается только для полной конференции с подтверждёнными W–L, согласованным PCT и
          единственным лидером. «Последние 10» содержит только число побед из доступного поля
          источника.
        </p>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.standings-view {
  display: grid;
  gap: 1.2rem;
  min-width: 0;
}

.standings-toolbar,
.standings-section {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: linear-gradient(155deg, var(--surface-2), var(--surface-1));
}

.standings-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem;
}

.conference-tabs,
.standings-controls,
.section-meta {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.conference-tabs {
  border-radius: 0.8rem;
  background: var(--surface-1);
  padding: 0.22rem;
}

.conference-tabs button {
  display: inline-flex;
  min-height: 2.6rem;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  border: 1px solid transparent;
  border-radius: 0.65rem;
  background: transparent;
  padding: 0.45rem 0.85rem;
  color: var(--muted);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
}

.conference-tabs button[aria-pressed='true'] {
  border-color: var(--line-strong);
  background: var(--surface-3);
  color: var(--ink);
}

.conference-tabs button:focus-visible,
.standings-filters select:focus-visible {
  outline: 2px solid var(--lime);
  outline-offset: 2px;
}

.favorite-filter {
  display: inline-flex;
  min-height: 2.5rem;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
  font-size: 0.84rem;
}

.favorite-filter input {
  width: 1rem;
  height: 1rem;
  accent-color: var(--lime);
}

.standings-controls :deep(.button) {
  gap: 0.45rem;
}

.standings-section {
  display: grid;
  gap: 1rem;
  padding: clamp(0.9rem, 2.5vw, 1.35rem);
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.section-heading h2 {
  margin: 0.2rem 0 0;
  color: var(--ink);
  font-size: clamp(1.25rem, 2vw, 1.7rem);
  letter-spacing: -0.04em;
}

.section-meta {
  flex-wrap: wrap;
  justify-content: flex-end;
  color: var(--muted);
  font-size: 0.78rem;
  text-align: right;
}

.standings-cache-note,
.data-limitations {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.55;
}

.standings-cache-note :deep(svg),
.data-limitations :deep(svg) {
  flex: 0 0 auto;
  margin-top: 0.1rem;
  color: var(--lime);
}

.standings-filters {
  display: flex;
  align-items: end;
  gap: 0.75rem;
  border-top: 1px solid var(--line);
  padding-top: 0.9rem;
}

.standings-filters label {
  display: grid;
  gap: 0.3rem;
  color: var(--muted);
  font-size: 0.75rem;
}

.standings-filters select {
  min-height: 2.5rem;
  max-width: min(19rem, 64vw);
  border: 1px solid var(--line-strong);
  border-radius: 0.65rem;
  background: var(--surface-1);
  padding: 0.45rem 0.65rem;
  color: var(--ink);
  font: inherit;
  font-size: 0.82rem;
}

.standings-filters p {
  margin: 0 0 0.5rem auto;
  color: var(--subtle);
  font-size: 0.78rem;
}

.standings-content {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}

.standings-warning {
  margin: 0;
  border: 1px solid rgb(228 182 107 / 24%);
  border-radius: var(--radius-sm);
  background: rgb(228 182 107 / 7%);
  padding: 0.7rem 0.85rem;
  color: #e8c77f;
  font-size: 0.82rem;
  line-height: 1.5;
}

.data-limitations {
  border-top: 1px solid var(--line);
  padding-top: 0.9rem;
  color: var(--subtle);
  font-size: 0.78rem;
}

.data-limitations p {
  margin: 0;
}

@media (max-width: 680px) {
  .standings-toolbar,
  .section-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .standings-toolbar {
    gap: 0.7rem;
  }

  .conference-tabs button {
    flex: 1;
  }

  .standings-controls {
    justify-content: space-between;
  }

  .standings-controls :deep(.button) {
    min-height: 2.5rem;
    padding-inline: 0.65rem;
    font-size: 0.78rem;
  }

  .section-meta {
    justify-content: flex-start;
    text-align: left;
  }

  .standings-filters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .standings-filters label,
  .standings-filters select {
    width: 100%;
    min-width: 0;
    max-width: none;
  }

  .standings-filters p {
    grid-column: 1 / -1;
    margin: 0;
  }
}
</style>
