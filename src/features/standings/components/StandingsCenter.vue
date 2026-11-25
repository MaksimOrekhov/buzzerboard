<script setup lang="ts">
import '../standings.css'
import { computed, nextTick, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'
import SpoilerAggregateGate from '@/features/spoilers/SpoilerAggregateGate.vue'
import AppButton from '@/shared/components/AppButton.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import SnapshotStatus from '@/shared/components/SnapshotStatus.vue'
import StandingsTable from '@/shared/components/StandingsTable.vue'
import { CURRENT_SEASON, useStandingsCenter } from '../composables/useStandingsCenter'
import { TEAMS_PER_CONFERENCE } from '../standingsModel'
import ComparisonSelectionBar from './ComparisonSelectionBar.vue'
import StandingsToolbar from './StandingsToolbar.vue'
import TeamComparison from './TeamComparison.vue'

const {
  query,
  favoriteIds,
  toggleFavorite,
  conference,
  favoriteOnly,
  search,
  sortBy,
  sortDirection,
  compareIds,
  comparisonOpen,
  meta,
  activeStandings,
  visibleRows,
  comparisonRows,
  activeFilters,
  conferenceLabel,
  errorTitle,
  sortOptions,
  selectSort,
  resetFilters,
  toggleCompare,
  clearComparison,
} = useStandingsCenter()

const { data, isPending, isError, isFetching, isRefetchError } = query
const { hideAggregate } = useSpoilerMode()
const statsHidden = computed(() => hideAggregate('standings'))
const compareMode = shallowRef(false)
const topline = useTemplateRef('topline')
const selectionBar = useTemplateRef('selectionBar')
const gbWarningId = useId()
const seasonLabel = `${CURRENT_SEASON - 1}/${String(CURRENT_SEASON).slice(-2)}`
const conferences = [
  { value: 'east', label: 'Восток', hint: 'EAST' },
  { value: 'west', label: 'Запад', hint: 'WEST' },
] as const

const hasRank = computed(() => activeStandings.value.rows.some((row) => row.officialRank !== null))
const coverage = computed(() =>
  activeFilters.value
    ? `${visibleRows.value.length} из ${activeStandings.value.rows.length}`
    : `${activeStandings.value.rows.length} из ${TEAMS_PER_CONFERENCE}`,
)

function focusVisibleControl() {
  const selector = statsHidden.value ? 'button[aria-pressed="true"]' : 'button[data-compare-mode]'
  topline.value?.querySelector<HTMLButtonElement>(selector)?.focus({ preventScroll: true })
}

function restoreComparisonFocus() {
  if (compareMode.value && !statsHidden.value && selectionBar.value) {
    selectionBar.value.focusAction()
  } else {
    focusVisibleControl()
  }
}

function closeMode() {
  compareMode.value = false
  void nextTick(focusVisibleControl)
}

watch(
  statsHidden,
  (hidden) => {
    if (!hidden) return
    const dialogWasOpen = comparisonOpen.value
    compareMode.value = false
    clearComparison()
    if (dialogWasOpen) void nextTick(focusVisibleControl)
  },
  { flush: 'sync' },
)
</script>

<template>
  <div
    class="standings-center"
    :class="{ 'standings-center--comparing': compareMode && !statsHidden }"
  >
    <header class="standings-title">
      <div>
        <p class="standings-season">
          <span class="gc-league-dot" />NBA · Регулярный сезон · {{ seasonLabel }}
        </p>
        <h1>Турнирная таблица<span class="gc-title-dot">.</span></h1>
      </div>
      <div class="standings-title-actions">
        <SnapshotStatus
          v-if="meta && !statsHidden"
          :meta="meta"
          :refresh-failed="isRefetchError"
          compact
        />
        <AppButton
          class="standings-refresh"
          icon="refresh"
          icon-only
          :aria-label="isFetching ? 'Обновляем данные' : 'Обновить данные'"
          :loading="isFetching"
          @click="query.refetch()"
        />
      </div>
    </header>

    <div ref="topline" class="standings-topline">
      <AppSegmented v-model="conference" label="Конференция" :options="conferences" />
      <AppButton
        v-if="data && !statsHidden"
        data-compare-mode
        class="standings-compare-mode"
        icon="compare"
        aria-label="Режим сравнения"
        :aria-pressed="compareMode"
        @click="compareMode = !compareMode"
        >Сравнить</AppButton
      >
    </div>

    <SpoilerAggregateGate v-if="statsHidden" scope="standings" title="Турнирная таблица скрыта" />
    <ResourceState v-else-if="isPending" status="loading" />
    <ResourceState
      v-else-if="isError && !data"
      status="error"
      icon="trophy"
      :title="errorTitle"
      description="Попробуйте обновить данные или вернитесь позже."
    >
      <template #action><AppButton @click="query.refetch()">Попробовать снова</AppButton></template>
    </ResourceState>
    <template v-else>
      <p
        v-if="isRefetchError || meta?.refreshError"
        class="gc-notice gc-notice--warning"
        role="status"
      >
        Не удалось обновить данные. Показана последняя загруженная таблица.
      </p>
      <p v-if="meta && meta.rejectedRecords > 0" class="gc-notice gc-notice--warning" role="status">
        Часть записей не прошла проверку. Таблица может быть неполной.
      </p>

      <section class="standings-section" :aria-labelledby="`standings-${conference}-title`">
        <header class="standings-section-heading">
          <div>
            <h2 :id="`standings-${conference}-title`">{{ conferenceLabel }}</h2>
            <span class="standings-coverage">{{ coverage }} команд</span>
          </div>
          <StandingsToolbar
            v-model:search="search"
            v-model:sort="sortBy"
            v-model:favorite-only="favoriteOnly"
            :direction="sortDirection"
            :options="sortOptions"
            @reverse="sortDirection = sortDirection === 'descending' ? 'ascending' : 'descending'"
          />
        </header>

        <div class="standings-table-context">
          <span>{{ hasRank ? 'Место из снимка' : 'Нет официальных мест' }}</span>
          <button v-if="activeFilters" class="gc-reset" @click="resetFilters">
            Сбросить фильтры
          </button>
          <span v-else-if="visibleRows.length" class="standings-scroll-hint">
            Другие метрики <AppIcon name="arrow" :size="14" />
          </span>
        </div>

        <p
          v-if="activeStandings.warning && activeStandings.rows.length"
          :id="gbWarningId"
          class="gc-notice gc-notice--warning standings-table-notice"
          role="status"
        >
          {{ activeStandings.warning }}
        </p>
        <p v-if="compareMode" class="standings-selection-hint">
          Выберите две команды у названий. Выбор сохраняется при смене конференции.
        </p>

        <StandingsTable
          v-if="visibleRows.length"
          :rows="visibleRows"
          :conference="conference"
          :games-behind-by-team-id="activeStandings.gamesBehindByTeamId"
          :games-behind-description="activeStandings.warning ? gbWarningId : null"
          :show-official-rank="hasRank"
          :favorite-ids="favoriteIds"
          :sort-by="sortBy"
          :sort-direction="sortDirection"
          :compare-ids="compareIds"
          :compare-enabled="compareMode"
          @sort="selectSort"
          @toggle-favorite="toggleFavorite"
          @toggle-compare="toggleCompare"
        />
        <ResourceState
          v-else
          status="empty"
          icon="trophy"
          :title="activeFilters ? 'Команды не найдены' : 'Данные таблицы отсутствуют'"
          :description="
            activeFilters
              ? 'Измените запрос или снимите фильтр избранного.'
              : 'Данные выбранной конференции появятся позже.'
          "
        />
      </section>
      <details class="standings-guide">
        <summary>Как читать таблицу<AppIcon name="down" :size="14" /></summary>
        <dl>
          <div>
            <dt>В–П / PCT</dt>
            <dd>
              Победы–поражения / доля побед. При равном PCT — порядок по названию. Это не
              официальный посев.
            </dd>
          </div>
          <div>
            <dt>GB*</dt>
            <dd>
              Расчётное отставание. Доступно только для полной конференции, согласованных В–П и PCT
              и единственного лидера.
            </dd>
          </div>
          <div>
            <dt>Дома / В гостях / Конф.</dt>
            <dd>
              Победы–поражения на своей площадке, на выезде и внутри конференции. Нет данных — тире.
            </dd>
          </div>
          <div>
            <dt>Посл. 10 / Разница</dt>
            <dd>
              Подтверждённое число побед в последних 10 матчах / средняя разница очков за матч, не
              Net Rating. Серии, места и посев не вычисляются.
            </dd>
          </div>
        </dl>
      </details>
      <ComparisonSelectionBar
        v-if="compareMode"
        ref="selectionBar"
        :rows="comparisonRows"
        @remove="toggleCompare"
        @clear="clearComparison"
        @exit="closeMode"
        @open="comparisonOpen = comparisonRows.length === 2"
      />
      <TeamComparison
        v-if="compareMode"
        v-model:open="comparisonOpen"
        :rows="comparisonRows"
        :fallback-focus="restoreComparisonFocus"
      />
    </template>
  </div>
</template>
