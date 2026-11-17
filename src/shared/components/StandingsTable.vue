<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from './AppIcon.vue'
import type { Conference, StandingsRow, TeamId } from '@/entities/nba/model'
import { sortStandingsRows } from '@/features/standings/standingsModel'
import type { SortDirection, StandingsSortKey } from '@/features/standings/standingsModel'

const props = withDefaults(
  defineProps<{
    rows: readonly StandingsRow[]
    conference: Conference
    gamesBehindByTeamId?: ReadonlyMap<TeamId, number>
    favoriteIds?: ReadonlySet<TeamId>
    sortBy?: StandingsSortKey
    sortDirection?: SortDirection
  }>(),
  {
    gamesBehindByTeamId: () => new Map(),
    favoriteIds: () => new Set(),
    sortBy: 'winPercentage',
    sortDirection: 'descending',
  },
)

const emit = defineEmits<{
  sort: [field: StandingsSortKey]
  toggleFavorite: [teamId: TeamId]
}>()

const visibleRows = computed(() =>
  sortStandingsRows(props.rows, props.sortBy, props.sortDirection, props.gamesBehindByTeamId),
)

const conferenceLabel = computed(() =>
  props.conference === 'east' ? 'Восточная конференция' : 'Западная конференция',
)

function teamName(row: StandingsRow): string {
  return row.team.displayName ?? row.team.abbreviation ?? 'Команда без названия'
}

function formatNumber(value: number | null): string {
  return value === null
    ? '—'
    : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)
}

function formatPercentage(value: number | null): string {
  if (value === null || value < 0 || value > 1) return '—'
  const formatted = value.toFixed(3)
  return formatted.startsWith('0.') ? formatted.slice(1) : formatted
}

function formatGamesBehind(teamId: TeamId): string {
  const value = props.gamesBehindByTeamId.get(teamId)
  if (value === undefined) return '—'
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value)
}

function formatRecord(wins: number | null, losses: number | null): string {
  if (wins === null || losses === null) return '—'
  return `${formatNumber(wins)}–${formatNumber(losses)}`
}

function formatLastTen(wins: number | null): string {
  if (wins === null || !Number.isInteger(wins) || wins < 0 || wins > 10) return '—'
  return `${formatNumber(wins)} ${wins === 1 ? 'победа' : wins >= 2 && wins <= 4 ? 'победы' : 'побед'}`
}

function formatAverageMargin(value: number | null): string {
  if (value === null) return '—'
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
  return value > 0 ? `+${formatted}` : formatted
}

function sortLabel(field: StandingsSortKey, label: string): string {
  if (props.sortBy !== field) return `Сортировать по полю «${label}»`
  const direction = props.sortDirection === 'ascending' ? 'по возрастанию' : 'по убыванию'
  return `Сортировать по полю «${label}», сейчас ${direction}`
}

function ariaSort(field: StandingsSortKey): 'ascending' | 'descending' | 'none' {
  return props.sortBy === field ? props.sortDirection : 'none'
}

function toggleFavorite(row: StandingsRow): void {
  emit('toggleFavorite', row.team.id)
}
</script>

<template>
  <div class="standings-table-shell">
    <div
      class="desktop-table"
      role="region"
      :aria-label="`Турнирная таблица NBA: ${conferenceLabel}`"
      tabindex="0"
    >
      <table class="standings-table">
        <caption class="visually-hidden">
          Турнирная таблица NBA ·
          {{
            conferenceLabel
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">Место</th>
            <th scope="col">Команда</th>
            <th scope="col" :aria-sort="ariaSort('wins')">
              <button
                class="sort-button"
                type="button"
                :aria-label="sortLabel('wins', 'победам')"
                @click="emit('sort', 'wins')"
              >
                В–П <span aria-hidden="true">↕</span>
              </button>
            </th>
            <th scope="col" :aria-sort="ariaSort('winPercentage')">
              <button
                class="sort-button"
                type="button"
                :aria-label="sortLabel('winPercentage', 'проценту побед')"
                @click="emit('sort', 'winPercentage')"
              >
                PCT <span aria-hidden="true">↕</span>
              </button>
            </th>
            <th scope="col" :aria-sort="ariaSort('gamesBehind')">
              <button
                class="sort-button"
                type="button"
                :aria-label="sortLabel('gamesBehind', 'расчётному GB')"
                @click="emit('sort', 'gamesBehind')"
              >
                GB · расчёт <span aria-hidden="true">↕</span>
              </button>
            </th>
            <th scope="col" :aria-sort="ariaSort('homeWins')">
              <button
                class="sort-button"
                type="button"
                :aria-label="sortLabel('homeWins', 'победам дома')"
                @click="emit('sort', 'homeWins')"
              >
                Дома <span aria-hidden="true">↕</span>
              </button>
            </th>
            <th scope="col" :aria-sort="ariaSort('awayWins')">
              <button
                class="sort-button"
                type="button"
                :aria-label="sortLabel('awayWins', 'победам в гостях')"
                @click="emit('sort', 'awayWins')"
              >
                В гостях <span aria-hidden="true">↕</span>
              </button>
            </th>
            <th scope="col" :aria-sort="ariaSort('lastTenWins')">
              <button
                class="sort-button"
                type="button"
                :aria-label="sortLabel('lastTenWins', 'победам в последних десяти матчах')"
                @click="emit('sort', 'lastTenWins')"
              >
                Победы в 10 <span aria-hidden="true">↕</span>
              </button>
            </th>
            <th scope="col" :aria-sort="ariaSort('averageMargin')">
              <button
                class="sort-button"
                type="button"
                :aria-label="sortLabel('averageMargin', 'средней разнице очков')"
                @click="emit('sort', 'averageMargin')"
              >
                Ср. разница <span aria-hidden="true">↕</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in visibleRows"
            :key="row.team.id"
            :class="{ 'standings-row--favorite': favoriteIds.has(row.team.id) }"
          >
            <td
              class="rank-cell"
              :title="
                row.officialRank
                  ? 'Официальное место источника'
                  : 'Официальный ранг не предоставлен источником'
              "
            >
              {{ formatNumber(row.officialRank) }}
            </td>
            <td>
              <div class="table-team">
                <button
                  class="favorite-button"
                  type="button"
                  :aria-pressed="favoriteIds.has(row.team.id)"
                  :aria-label="`${favoriteIds.has(row.team.id) ? 'Убрать' : 'Добавить'} ${teamName(row)} ${favoriteIds.has(row.team.id) ? 'из' : 'в'} избранное`"
                  @click="toggleFavorite(row)"
                >
                  <AppIcon name="bookmark" :size="15" />
                </button>
                <span class="table-team-mark">{{ row.team.abbreviation ?? 'NBA' }}</span>
                <span class="table-team-name">{{ teamName(row) }}</span>
              </div>
            </td>
            <td class="record-cell">{{ formatRecord(row.record.wins, row.record.losses) }}</td>
            <td class="number-cell">{{ formatPercentage(row.winPercentage) }}</td>
            <td
              class="number-cell"
              :title="
                formatGamesBehind(row.team.id) === '—'
                  ? 'GB недоступен без полной конференции и уникального лидера'
                  : 'GB рассчитан по подтверждённому W–L и уникальному лидеру PCT'
              "
            >
              {{ formatGamesBehind(row.team.id) }}
            </td>
            <td class="number-cell">
              {{ formatRecord(row.record.homeWins, row.record.homeLosses) }}
            </td>
            <td class="number-cell">
              {{ formatRecord(row.record.awayWins, row.record.awayLosses) }}
            </td>
            <td class="number-cell">{{ formatLastTen(row.record.lastTenWins) }}</td>
            <td class="number-cell">{{ formatAverageMargin(row.record.averageMargin) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mobile-list" role="list" :aria-label="`Команды: ${conferenceLabel}`">
      <article
        v-for="row in visibleRows"
        :key="row.team.id"
        class="team-card"
        :class="{ 'team-card--favorite': favoriteIds.has(row.team.id) }"
        role="listitem"
      >
        <header class="team-card-header">
          <div class="team-card-identity">
            <span class="table-team-mark">{{ row.team.abbreviation ?? 'NBA' }}</span>
            <div>
              <h3>{{ teamName(row) }}</h3>
              <p>
                {{ row.conference === 'east' ? 'Восток' : 'Запад' }} · место
                {{ formatNumber(row.officialRank) }}
              </p>
            </div>
          </div>
          <button
            class="favorite-button"
            type="button"
            :aria-pressed="favoriteIds.has(row.team.id)"
            :aria-label="`${favoriteIds.has(row.team.id) ? 'Убрать' : 'Добавить'} ${teamName(row)} ${favoriteIds.has(row.team.id) ? 'из' : 'в'} избранное`"
            @click="toggleFavorite(row)"
          >
            <AppIcon name="bookmark" :size="15" />
          </button>
        </header>
        <dl class="team-metrics">
          <div class="team-metric team-metric--primary">
            <dt>Победы–поражения</dt>
            <dd>{{ formatRecord(row.record.wins, row.record.losses) }}</dd>
          </div>
          <div class="team-metric team-metric--primary">
            <dt>PCT</dt>
            <dd>{{ formatPercentage(row.winPercentage) }}</dd>
          </div>
          <div class="team-metric">
            <dt>GB · расчёт</dt>
            <dd>{{ formatGamesBehind(row.team.id) }}</dd>
          </div>
          <div class="team-metric">
            <dt>Дома</dt>
            <dd>{{ formatRecord(row.record.homeWins, row.record.homeLosses) }}</dd>
          </div>
          <div class="team-metric">
            <dt>В гостях</dt>
            <dd>{{ formatRecord(row.record.awayWins, row.record.awayLosses) }}</dd>
          </div>
          <div class="team-metric">
            <dt>Победы в последних 10</dt>
            <dd>{{ formatLastTen(row.record.lastTenWins) }}</dd>
          </div>
          <div class="team-metric team-metric--wide">
            <dt>Средняя разница очков за матч</dt>
            <dd>{{ formatAverageMargin(row.record.averageMargin) }}</dd>
          </div>
        </dl>
      </article>
    </div>
  </div>
</template>

<style scoped>
.standings-table-shell {
  min-width: 0;
}

.desktop-table {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: linear-gradient(155deg, var(--surface-2), var(--surface-1));
  scrollbar-color: var(--surface-raised) transparent;
}

.standings-table {
  width: 100%;
  min-width: 68rem;
  border-collapse: collapse;
  text-align: left;
}

.standings-table th {
  border-bottom: 1px solid var(--line-strong);
  padding: 0.85rem 0.8rem;
  color: var(--muted);
  font-size: var(--font-size-caption);
  font-weight: 750;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.standings-table td {
  border-bottom: 1px solid var(--line);
  padding: 0.72rem 0.8rem;
  color: var(--ink-soft);
  font-size: var(--font-size-caption);
  white-space: nowrap;
}

.standings-table tbody tr:last-child td {
  border-bottom: 0;
}

.standings-table tbody tr:hover td,
.standings-row--favorite td {
  background: rgb(217 236 121 / 5%);
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
  margin-left: 0.2rem;
  color: var(--subtle);
}

.rank-cell,
.number-cell,
.record-cell {
  font-variant-numeric: tabular-nums;
}

.rank-cell {
  width: 4rem;
  color: var(--subtle) !important;
}

.record-cell {
  color: var(--ink) !important;
  font-weight: 690;
}

.number-cell {
  color: var(--muted) !important;
}

.table-team,
.team-card-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.55rem;
}

.table-team-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.table-team-mark {
  display: grid;
  width: 1.9rem;
  height: 1.9rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 0.6rem;
  background: var(--surface-3);
  color: var(--ink-soft);
  font-size: var(--font-size-caption);
  font-weight: 790;
}

.favorite-button {
  display: grid;
  width: 2rem;
  height: 2rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 0.6rem;
  background: transparent;
  color: var(--subtle);
  cursor: pointer;
}

.favorite-button:hover,
.favorite-button[aria-pressed='true'] {
  border-color: rgb(217 236 121 / 26%);
  background: var(--lime-soft);
  color: var(--lime);
}

.favorite-button:focus-visible {
  outline: 2px solid var(--lime);
  outline-offset: 2px;
}

.mobile-list {
  display: none;
}

@media (max-width: 620px) {
  .desktop-table {
    display: none;
  }

  .mobile-list {
    display: grid;
    gap: 0.65rem;
  }

  .team-card {
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: linear-gradient(145deg, var(--surface-2), var(--surface-1));
    padding: 0.85rem;
  }

  .team-card--favorite {
    border-color: rgb(217 236 121 / 36%);
    background:
      radial-gradient(ellipse at 100% 0, rgb(217 236 121 / 8%), transparent 46%),
      linear-gradient(145deg, var(--surface-2), var(--surface-1));
  }

  .team-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .team-card-identity {
    overflow: hidden;
  }

  .team-card-identity h3 {
    display: -webkit-box;
    overflow: hidden;
    margin: 0;
    color: var(--ink);
    font-size: 0.95rem;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .team-card-identity p {
    margin: 0.2rem 0 0;
    color: var(--subtle);
    font-size: var(--font-size-caption);
  }

  .team-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
    margin: 0;
  }

  .team-metric {
    min-width: 0;
    border-top: 1px solid var(--line);
    padding-top: 0.45rem;
  }

  .team-metric dt {
    overflow: visible;
    color: var(--subtle);
    font-size: var(--font-size-caption);
    line-height: 1.35;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .team-metric dd {
    margin: 0.2rem 0 0;
    color: var(--ink-soft);
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
    font-weight: 690;
  }

  .team-metric--primary dd {
    color: var(--ink);
    font-size: 1rem;
  }

  .team-metric--wide {
    grid-column: 1 / -1;
  }
}
</style>
