<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import TeamLogo from './TeamLogo.vue'
import TeamProfileLink from './TeamProfileLink.vue'
import SortHeader from './SortHeader.vue'
import type { Conference, StandingsRow, TeamId } from '@/entities/nba/model'
import type { SortDirection, StandingsSortKey } from '@/features/standings/standingsModel'
import {
  formatNumber,
  formatPercentage,
  formatRecord,
  formatAverageMargin,
  formatLastTen,
  formatGamesBehind,
} from '@/features/standings/formatters'
const props = withDefaults(
  defineProps<{
    rows: readonly StandingsRow[]
    conference: Conference
    gamesBehindByTeamId?: ReadonlyMap<TeamId, number>
    favoriteIds?: ReadonlySet<TeamId>
    sortBy?: StandingsSortKey
    sortDirection?: SortDirection
    compareIds?: ReadonlySet<TeamId>
    compareEnabled?: boolean
  }>(),
  {
    gamesBehindByTeamId: () => new Map(),
    favoriteIds: () => new Set(),
    compareIds: () => new Set(),
    compareEnabled: false,
    sortBy: 'winPercentage',
    sortDirection: 'descending',
  },
)
const emit = defineEmits<{
  sort: [field: StandingsSortKey]
  toggleFavorite: [teamId: TeamId]
  toggleCompare: [teamId: TeamId]
}>()
const showRank = computed(() => props.rows.some((row) => row.officialRank !== null))
const conferenceLabel = computed(() =>
  props.conference === 'east' ? 'Восточная конференция' : 'Западная конференция',
)
const columns = [
  { field: 'wins', label: 'В–П', description: 'победам' },
  { field: 'winPercentage', label: 'PCT', description: 'проценту побед' },
  { field: 'gamesBehind', label: 'GB*', description: 'расчётному отставанию от лидера' },
  { field: 'homeWins', label: 'Дома', description: 'победам дома' },
  { field: 'awayWins', label: 'В гостях', description: 'победам в гостях' },
  { field: 'conferenceWins', label: 'Конф.', description: 'победам в конференции' },
  { field: 'lastTenWins', label: 'Посл. 10', description: 'победам в последних десяти матчах' },
  { field: 'averageMargin', label: 'Разница', description: 'средней разнице очков' },
] as const
function teamName(row: StandingsRow) {
  return row.team.displayName ?? row.team.abbreviation ?? 'Команда без названия'
}
</script>
<template>
  <div class="standings-table-shell">
    <div
      class="standings-scroll"
      role="region"
      :aria-label="`Турнирная таблица NBA: ${conferenceLabel}`"
      tabindex="0"
    >
      <table class="standings-table">
        <caption class="visually-hidden">
          Турнирная таблица NBA ·
          {{
            conferenceLabel
          }}. В–П: победы и поражения; PCT: доля побед.
        </caption>
        <thead>
          <tr>
            <th v-if="showRank" scope="col" class="rank-heading">Место</th>
            <th scope="col" class="team-heading">Команда</th>
            <SortHeader
              v-for="column in columns"
              :key="column.field"
              :field="column.field"
              :label="column.label"
              :description="column.description"
              :sort-by="sortBy"
              :direction="sortDirection"
              :disabled="column.field === 'gamesBehind' && gamesBehindByTeamId.size === 0"
              @sort="emit('sort', $event)"
            />
            <th v-if="compareEnabled" scope="col" class="compare-heading">
              <span class="visually-hidden">Сравнить</span><AppIcon name="chart" :size="16" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.team.id"
            :class="{
              'standings-row--favorite': favoriteIds.has(row.team.id),
              'standings-row--compared': compareIds.has(row.team.id),
            }"
          >
            <td v-if="showRank" class="rank-cell">{{ formatNumber(row.officialRank) }}</td>
            <th scope="row" class="team-cell">
              <div class="table-team">
                <button
                  class="gc-icon-button favorite-button"
                  type="button"
                  :aria-pressed="favoriteIds.has(row.team.id)"
                  :aria-label="`${favoriteIds.has(row.team.id) ? 'Убрать' : 'Добавить'} ${teamName(row)} ${favoriteIds.has(row.team.id) ? 'из' : 'в'} избранное`"
                  @click="emit('toggleFavorite', row.team.id)"
                >
                  <AppIcon name="star" :size="16" /></button
                ><TeamLogo :team="row.team" :size="34" />
                <TeamProfileLink :team="row.team" class="table-team-copy">
                  <span class="table-team-name team-profile-link-text">{{
                    teamName(row)
                  }}</span><span class="table-team-abbr">{{ row.team.abbreviation ?? 'NBA' }}</span>
                </TeamProfileLink>
              </div>
            </th>
            <td class="record-cell" :class="{ 'ui-sorted-column': sortBy === 'wins' }">
              {{ formatRecord(row.record.wins, row.record.losses) }}
            </td>
            <td class="pct-cell" :class="{ 'ui-sorted-column': sortBy === 'winPercentage' }">
              <strong>{{ formatPercentage(row.winPercentage) }}</strong><span
                v-if="row.winPercentage !== null"
                class="pct-meter"
                aria-hidden="true"
                ><span :style="{ width: `${Math.max(0, Math.min(1, row.winPercentage)) * 100}%` }"
              /></span>
            </td>
            <td :class="{ 'ui-sorted-column': sortBy === 'gamesBehind' }">
              {{ formatGamesBehind(gamesBehindByTeamId.get(row.team.id)) }}
            </td>
            <td :class="{ 'ui-sorted-column': sortBy === 'homeWins' }">
              {{ formatRecord(row.record.homeWins, row.record.homeLosses) }}
            </td>
            <td :class="{ 'ui-sorted-column': sortBy === 'awayWins' }">
              {{ formatRecord(row.record.awayWins, row.record.awayLosses) }}
            </td>
            <td :class="{ 'ui-sorted-column': sortBy === 'conferenceWins' }">
              {{ formatRecord(row.record.conferenceWins, row.record.conferenceLosses) }}
            </td>
            <td :class="{ 'ui-sorted-column': sortBy === 'lastTenWins' }">
              {{ formatLastTen(row.record.lastTenWins) }}
            </td>
            <td
              :class="{
                'ui-sorted-column': sortBy === 'averageMargin',
                'ui-positive': row.record.averageMargin !== null && row.record.averageMargin > 0,
                'ui-negative': row.record.averageMargin !== null && row.record.averageMargin < 0,
              }"
            >
              {{ formatAverageMargin(row.record.averageMargin) }}
            </td>
            <td v-if="compareEnabled" class="compare-cell">
              <input
                type="checkbox"
                class="ui-checkbox"
                :checked="compareIds.has(row.team.id)"
                :disabled="compareIds.size >= 2 && !compareIds.has(row.team.id)"
                :aria-label="`Сравнить ${teamName(row)}`"
                @change="emit('toggleCompare', row.team.id)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
