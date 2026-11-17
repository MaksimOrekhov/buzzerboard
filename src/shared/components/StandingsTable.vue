<script setup lang="ts">
import { computed } from 'vue'

import ResourceState from './ResourceState.vue'
import type { Conference, StandingsRow } from '@/entities/nba/model'

export type StandingsSortKey = 'officialRank' | 'wins' | 'winPercentage'
export type SortDirection = 'ascending' | 'descending'

const props = withDefaults(
  defineProps<{
    rows: readonly StandingsRow[]
    conference?: Conference | null
    sortBy?: StandingsSortKey
    sortDirection?: SortDirection
  }>(),
  { conference: null, sortBy: 'officialRank', sortDirection: 'ascending' },
)

const emit = defineEmits<{
  sort: [field: StandingsSortKey]
}>()

const visibleRows = computed(() => {
  const rows = props.rows.filter((row) => !props.conference || row.conference === props.conference)
  const sortValue = (row: StandingsRow): number | null => {
    if (props.sortBy === 'officialRank') return row.officialRank
    if (props.sortBy === 'wins') return row.record.wins
    return row.winPercentage
  }

  return [...rows].sort((left, right) => {
    const leftValue = sortValue(left)
    const rightValue = sortValue(right)
    if (leftValue === null && rightValue === null) return 0
    if (leftValue === null) return 1
    if (rightValue === null) return -1
    return (leftValue - rightValue) * (props.sortDirection === 'ascending' ? 1 : -1)
  })
})

function formatNumber(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('ru-RU').format(value)
}

function formatPercentage(value: number | null): string {
  return value === null
    ? '—'
    : new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 }).format(value)
}

function sortLabel(field: StandingsSortKey, label: string): string {
  if (props.sortBy !== field) return `Сортировать по полю «${label}»`
  const direction = props.sortDirection === 'ascending' ? 'по возрастанию' : 'по убыванию'
  return `Сортировать по полю «${label}», сейчас ${direction}`
}
</script>

<template>
  <ResourceState
    v-if="visibleRows.length === 0"
    status="empty"
    icon="trophy"
    title="Таблица ещё не загружена"
    description="Мы не подставляем позиции и статистику команд, пока не получим проверенные данные."
    compact
  />

  <div v-else class="table-scroll" role="region" aria-label="Турнирная таблица NBA" tabindex="0">
    <table class="standings-table">
      <caption class="visually-hidden">
        Турнирная таблица NBA
      </caption>
      <thead>
        <tr>
          <th scope="col" :aria-sort="sortBy === 'officialRank' ? sortDirection : 'none'">
            <button
              class="sort-button"
              type="button"
              :aria-label="sortLabel('officialRank', 'официальному месту')"
              @click="emit('sort', 'officialRank')"
            >
              Место <span aria-hidden="true">↕</span>
            </button>
          </th>
          <th scope="col">Команда</th>
          <th scope="col">В–П</th>
          <th scope="col" :aria-sort="sortBy === 'wins' ? sortDirection : 'none'">
            <button
              class="sort-button"
              type="button"
              :aria-label="sortLabel('wins', 'победам')"
              @click="emit('sort', 'wins')"
            >
              Победы <span aria-hidden="true">↕</span>
            </button>
          </th>
          <th scope="col" :aria-sort="sortBy === 'winPercentage' ? sortDirection : 'none'">
            <button
              class="sort-button"
              type="button"
              :aria-label="sortLabel('winPercentage', 'проценту побед')"
              @click="emit('sort', 'winPercentage')"
            >
              % побед <span aria-hidden="true">↕</span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in visibleRows" :key="row.team.id">
          <td class="rank-cell">{{ formatNumber(row.officialRank) }}</td>
          <td>
            <div class="table-team">
              <span class="table-team-mark">{{ row.team.abbreviation ?? 'NBA' }}</span>
              <span>{{ row.team.displayName ?? 'Название не указано' }}</span>
            </div>
          </td>
          <td class="record-cell">
            {{ formatNumber(row.record.wins) }}–{{ formatNumber(row.record.losses) }}
          </td>
          <td class="number-cell">{{ formatNumber(row.record.wins) }}</td>
          <td class="number-cell">{{ formatPercentage(row.winPercentage) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-scroll {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: linear-gradient(155deg, var(--surface-2), var(--surface-1));
  scrollbar-color: var(--surface-raised) transparent;
}

.standings-table {
  width: 100%;
  min-width: 37rem;
  border-collapse: collapse;
  text-align: left;
}

.standings-table th {
  border-bottom: 1px solid var(--line-strong);
  padding: 0.85rem 1rem;
  color: var(--muted);
  font-size: 0.61rem;
  font-weight: 750;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.standings-table td {
  border-bottom: 1px solid var(--line);
  padding: 0.82rem 1rem;
  color: var(--ink-soft);
  font-size: 0.79rem;
}

.standings-table tbody tr:last-child td {
  border-bottom: 0;
}

.standings-table tbody tr:hover td {
  background: rgb(255 255 255 / 2%);
}

.sort-button {
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.sort-button span {
  margin-left: 0.25rem;
  color: var(--subtle);
}

.rank-cell,
.number-cell,
.record-cell {
  font-variant-numeric: tabular-nums;
}

.rank-cell {
  width: 4rem;
  color: var(--lime) !important;
  font-weight: 760;
}

.table-team {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  font-weight: 680;
  white-space: nowrap;
}

.table-team-mark {
  display: grid;
  width: 1.9rem;
  height: 1.9rem;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 0.6rem;
  background: var(--surface-3);
  color: var(--ink-soft);
  font-size: 0.54rem;
  font-weight: 790;
}

.record-cell {
  color: var(--ink) !important;
  font-weight: 690;
}

.number-cell {
  color: var(--muted) !important;
}
</style>
