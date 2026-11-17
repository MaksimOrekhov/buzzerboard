<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import AppIcon from '@/shared/components/AppIcon.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
import StandingsTable from '@/shared/components/StandingsTable.vue'
import type { Conference, StandingsRow } from '@/entities/nba/model'
import type { SortDirection, StandingsSortKey } from '@/shared/components/StandingsTable.vue'

const rows: readonly StandingsRow[] = []
const selectedConference = shallowRef<Conference | 'all'>('all')
const sortBy = shallowRef<StandingsSortKey>('officialRank')
const sortDirection = shallowRef<SortDirection>('ascending')

const conferenceFilter = computed(() =>
  selectedConference.value === 'all' ? null : selectedConference.value,
)

function changeSort(field: StandingsSortKey): void {
  if (sortBy.value === field) {
    sortDirection.value = sortDirection.value === 'ascending' ? 'descending' : 'ascending'
    return
  }
  sortBy.value = field
  sortDirection.value = 'ascending'
}
</script>

<template>
  <div class="standings-view">
    <PageHeading
      eyebrow="Восточная и Западная конференции"
      title="Турнирная таблица"
      description="Положение команд и динамика сезона — с явным указанием того, что подтвердил источник."
    />

    <div class="standings-controls">
      <div class="conference-filter" role="group" aria-label="Фильтр конференции">
        <button
          class="filter-button"
          :class="{ 'filter-button--active': selectedConference === 'all' }"
          type="button"
          :aria-pressed="selectedConference === 'all'"
          @click="selectedConference = 'all'"
        >
          Все команды
        </button>
        <button
          class="filter-button"
          :class="{ 'filter-button--active': selectedConference === 'east' }"
          type="button"
          :aria-pressed="selectedConference === 'east'"
          @click="selectedConference = 'east'"
        >
          Восток
        </button>
        <button
          class="filter-button"
          :class="{ 'filter-button--active': selectedConference === 'west' }"
          type="button"
          :aria-pressed="selectedConference === 'west'"
          @click="selectedConference = 'west'"
        >
          Запад
        </button>
      </div>

      <label class="sort-control">
        <span>Сортировка</span>
        <select v-model="sortBy" :disabled="rows.length === 0" aria-label="Сортировка таблицы">
          <option value="officialRank">Официальное место</option>
          <option value="wins">Победы</option>
          <option value="winPercentage">Процент побед</option>
        </select>
      </label>
    </div>

    <div class="table-caption">
      <div>
        <AppIcon name="trophy" :size="17" />
        <span>{{
          selectedConference === 'all'
            ? 'Все конференции'
            : selectedConference === 'east'
              ? 'Восточная конференция'
              : 'Западная конференция'
        }}</span>
      </div>
      <span class="rank-disclosure">Место не рассчитывается по порядку строк</span>
    </div>

    <StandingsTable
      :rows="rows"
      :conference="conferenceFilter"
      :sort-by="sortBy"
      :sort-direction="sortDirection"
      @sort="changeSort"
    />
  </div>
</template>

<style scoped>
.standings-view {
  width: 100%;
}

.standings-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.05rem;
}

.conference-filter {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid var(--line);
  border-radius: 0.82rem;
  background: rgb(255 255 255 / 2%);
  padding: 0.25rem;
}

.filter-button {
  min-height: 2.25rem;
  border: 1px solid transparent;
  border-radius: 0.58rem;
  background: transparent;
  padding: 0.4rem 0.7rem;
  color: var(--muted);
  font-size: var(--font-size-caption);
  font-weight: 670;
  transition:
    background-color 140ms ease,
    color 140ms ease;
  cursor: pointer;
}

.filter-button:hover {
  color: var(--ink);
}

.filter-button--active {
  border-color: var(--line);
  background: var(--surface-3);
  color: var(--ink);
  box-shadow: 0 2px 8px rgb(0 0 0 / 17%);
}

.sort-control {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--muted);
  font-size: var(--font-size-caption);
}

.sort-control select {
  min-height: 2.55rem;
  max-width: 13rem;
  border: 1px solid var(--line-strong);
  border-radius: 0.7rem;
  background: var(--surface-2);
  padding: 0.5rem 0.65rem;
  color: var(--ink-soft);
  font-size: var(--font-size-caption);
}

.sort-control select:disabled {
  opacity: 0.48;
}

.table-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin: 0 0 0.65rem;
  color: var(--ink-soft);
  font-size: var(--font-size-caption);
  font-weight: 680;
}

.table-caption > div {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.table-caption :deep(svg) {
  color: var(--lime);
}

.rank-disclosure {
  color: var(--subtle);
  font-size: var(--font-size-caption);
  font-weight: 520;
  text-align: right;
}

@media (max-width: 620px) {
  .standings-controls {
    align-items: stretch;
    flex-direction: column;
    gap: 0.7rem;
  }

  .conference-filter {
    display: grid;
    grid-template-columns: 1.15fr 0.8fr 0.8fr;
  }

  .filter-button {
    padding-inline: 0.35rem;
    font-size: var(--font-size-caption);
  }

  .sort-control {
    justify-content: space-between;
  }

  .sort-control select {
    flex: 1;
    max-width: 15rem;
  }

  .table-caption {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.4rem;
  }

  .rank-disclosure {
    text-align: left;
  }
}
</style>
