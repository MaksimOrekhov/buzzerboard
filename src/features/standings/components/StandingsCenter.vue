<script setup lang="ts">
import '../standings.css'
import { useStandingsCenter } from '../composables/useStandingsCenter'
import PageHeading from '@/shared/components/PageHeading.vue'
import AppButton from '@/shared/components/AppButton.vue'
import AppBadge from '@/shared/components/AppBadge.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import AppSearch from '@/shared/components/AppSearch.vue'
import AppSelect from '@/shared/components/AppSelect.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import SnapshotStatus from '@/shared/components/SnapshotStatus.vue'
import StandingsTable from '@/shared/components/StandingsTable.vue'
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
</script>
<template>
  <div class="standings-center">
    <PageHeading
      eyebrow="Команды и показатели"
      title="Турнирная таблица"
      description="Картина сезона. Сравнивайте команды, следите за своими."
      ><template #actions
        ><AppButton icon="refresh" :loading="isFetching" @click="query.refetch()">{{
          isFetching ? 'Обновляем…' : 'Обновить данные'
        }}</AppButton></template
      ></PageHeading
    >
    <div class="standings-topline">
      <AppSegmented
        v-model="conference"
        label="Конференция"
        :options="[
          { value: 'east', label: 'Восток' },
          { value: 'west', label: 'Запад' },
        ]"
      /><AppBadge>Сезон 2026/27</AppBadge>
    </div>
    <section class="standings-section" :aria-labelledby="`standings-${conference}-title`">
      <header class="standings-section-heading">
        <div>
          <h2 :id="`standings-${conference}-title`">{{ conferenceLabel }}</h2>
          <p>Показатели команд · регулярный сезон</p>
        </div>
        <span v-if="data" class="gc-game-count"
          >{{ visibleRows.length }} из {{ activeStandings.rows.length }} команд</span
        >
      </header>
      <div v-if="data" class="standings-filters">
        <AppSearch
          v-model="search"
          label="Поиск команды в таблице"
          placeholder="Найти команду"
        /><AppSelect
          v-model="sortBy"
          label="Сортировка турнирной таблицы"
          :options="sortOptions"
        /><AppButton
          icon="sort"
          :aria-label="`Порядок сортировки: ${sortDirection === 'descending' ? 'по убыванию' : 'по возрастанию'}`"
          @click="sortDirection = sortDirection === 'descending' ? 'ascending' : 'descending'"
          ><span class="standings-sort-direction">{{
            sortDirection === 'descending' ? 'По убыванию' : 'По возрастанию'
          }}</span></AppButton
        ><AppButton
          icon="star"
          :aria-pressed="favoriteOnly"
          :class="{ 'ui-selected': favoriteOnly }"
          @click="favoriteOnly = !favoriteOnly"
          >Избранные</AppButton
        >
      </div>
      <div v-if="activeFilters" class="standings-active-filters">
        <span>Найдено {{ visibleRows.length }} команд</span
        ><button class="gc-reset" @click="resetFilters">Сбросить фильтры</button>
      </div>
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
      <ResourceState v-if="isPending" status="loading" /><ResourceState
        v-else-if="isError && !data"
        status="error"
        icon="trophy"
        :title="errorTitle"
        description="Попробуйте обновить данные или вернитесь позже."
        ><template #action
          ><AppButton @click="query.refetch()">Попробовать снова</AppButton></template
        ></ResourceState
      ><ResourceState
        v-else-if="visibleRows.length === 0"
        status="empty"
        icon="trophy"
        :title="activeFilters ? 'Команды не найдены' : 'Данные таблицы отсутствуют'"
        :description="
          activeFilters
            ? 'Измените запрос или добавьте команды в избранное.'
            : 'Данные выбранной конференции появятся позже.'
        "
        ><template v-if="activeFilters" #action
          ><AppButton @click="resetFilters">Сбросить фильтры</AppButton></template
        ></ResourceState
      >
      <template v-else
        ><p v-if="activeStandings.warning" class="gc-notice gc-notice--warning" role="status">
          {{ activeStandings.warning }}
        </p>
        <p class="standings-scroll-hint">
          <AppIcon name="arrow" :size="14" />Прокрутите таблицу, чтобы увидеть все показатели
        </p>
        <StandingsTable
          :rows="visibleRows"
          :conference="conference"
          :games-behind-by-team-id="activeStandings.gamesBehindByTeamId"
          :favorite-ids="favoriteIds"
          :sort-by="sortBy"
          :sort-direction="sortDirection"
          :compare-ids="compareIds"
          compare-enabled
          @sort="selectSort"
          @toggle-favorite="toggleFavorite"
          @toggle-compare="toggleCompare"
        />
        <div class="standings-compare-bar">
          <span>{{
            compareIds.size
              ? `Выбрано команд: ${compareIds.size} из 2`
              : 'Отметьте две команды для сравнения'
          }}</span>
          <div>
            <button v-if="compareIds.size" class="gc-reset" @click="clearComparison">
              Сбросить</button
            ><AppButton
              icon="chart"
              :disabled="comparisonRows.length !== 2"
              @click="comparisonOpen = true"
              >Сравнить команды</AppButton
            >
          </div>
        </div></template
      >
      <SnapshotStatus v-if="meta" :meta="meta" />
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
    </section>
    <TeamComparison v-model:open="comparisonOpen" :rows="comparisonRows" />
  </div>
</template>
