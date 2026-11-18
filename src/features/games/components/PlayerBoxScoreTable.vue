<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import type { PlayerBoxScore, Team } from '@/entities/nba/model'
import type { PlayerSortKey } from '@/features/games/composables/useGameDetailsModel'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import StatTable from '@/shared/components/StatTable.vue'

defineProps<{
  team: Team
  players: readonly PlayerBoxScore[]
  didNotPlay: readonly PlayerBoxScore[]
  sortBy: PlayerSortKey
  direction: 'ascending' | 'descending'
}>()
defineEmits<{ sort: [key: PlayerSortKey] }>()

const groups = [
  { key: 'basic', label: 'Основное' },
  { key: 'shooting', label: 'Броски' },
  { key: 'other', label: 'Защита и потери' },
] as const
const group = shallowRef<(typeof groups)[number]['key']>('basic')
const columns = {
  basic: [
    { key: 'points', label: 'PTS', name: 'Очки' },
    { key: 'rebounds', label: 'REB', name: 'Подборы' },
    { key: 'assists', label: 'AST', name: 'Передачи' },
    { key: 'minutes', label: 'MIN', name: 'Минуты' },
    { key: 'plusMinus', label: '+/−', name: 'Плюс-минус' },
  ],
  shooting: [
    { key: 'fieldGoals', label: 'FG', name: 'Броски с игры, %' },
    { key: 'threePointers', label: '3P', name: 'Трёхочковые, %' },
    { key: 'freeThrows', label: 'FT', name: 'Штрафные, %' },
  ],
  other: [
    { key: 'steals', label: 'STL', name: 'Перехваты' },
    { key: 'blocks', label: 'BLK', name: 'Блок-шоты' },
    { key: 'turnovers', label: 'TO', name: 'Потери' },
    { key: 'fouls', label: 'PF', name: 'Фолы' },
    { key: 'offensiveRebounds', label: 'OREB', name: 'Подборы в атаке' },
    { key: 'defensiveRebounds', label: 'DREB', name: 'Подборы в защите' },
  ],
} satisfies Record<string, { key: PlayerSortKey; label: string; name: string }[]>
const visibleColumns = computed(() => columns[group.value])

function cell(line: PlayerBoxScore, key: PlayerSortKey) {
  const value = line[key]
  if (value === null) return '—'
  if (typeof value === 'object') {
    const shots =
      value.made === null || value.attempted === null ? '—' : `${value.made}/${value.attempted}`
    return value.percentage === null ? shots : `${shots} · ${(value.percentage * 100).toFixed(1)}%`
  }
  return key === 'plusMinus' && typeof value === 'number' && value > 0 ? `+${value}` : value
}
</script>

<template>
  <section
    class="player-box-score"
    :aria-label="team.displayName ?? team.abbreviation ?? 'Команда'"
  >
    <header class="player-box-score-heading">
      <TeamLogo :team="team" :size="40" />
      <div>
        <h3>{{ team.displayName ?? team.abbreviation }}</h3>
        <p>{{ players.length + didNotPlay.length }} игроков</p>
      </div>
    </header>
    <div
      v-if="players.length"
      class="player-stat-controls"
      role="group"
      aria-label="Набор показателей"
    >
      <button
        v-for="option in groups"
        :key="option.key"
        type="button"
        class="gc-control"
        :aria-pressed="group === option.key"
        @click="group = option.key"
      >
        {{ option.label }}
      </button>
    </div>
    <StatTable
      v-if="players.length"
      class="player-box-table-scroll"
      :label="`Статистика: ${team.displayName ?? team.abbreviation}`"
    >
      <table class="player-box-table">
        <caption class="visually-hidden">
          Статистика:
          {{
            team.displayName ?? team.abbreviation
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">Игрок</th>
            <th
              v-for="column in visibleColumns"
              :key="column.key"
              scope="col"
              :aria-sort="sortBy === column.key ? direction : undefined"
            >
              <button
                type="button"
                class="player-sort"
                :title="column.name"
                :aria-label="`Сортировать по: ${column.name}`"
                @click="$emit('sort', column.key)"
              >
                {{ column.label
                }}<span v-if="sortBy === column.key" aria-hidden="true">{{
                  direction === 'ascending' ? '↑' : '↓'
                }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in players" :key="line.player.id">
            <th scope="row">
              <span class="player-name">{{
                line.player.displayName ?? `Игрок ${line.player.providerId}`
              }}</span>
              <span v-if="line.starter" class="player-starter">Старт</span>
              <span v-if="line.didNotPlay === null" class="player-participation"
                >Участие не подтверждено</span
              >
            </th>
            <td
              v-for="column in visibleColumns"
              :key="column.key"
              :class="{ 'player-primary': column.key === 'points' }"
            >
              {{ cell(line, column.key) }}
            </td>
          </tr>
        </tbody>
      </table>
    </StatTable>
    <p v-if="players.length" class="player-stat-legend">
      {{ visibleColumns.map(({ label, name }) => label + ' — ' + name).join(' · ') }}
      <template v-if="group === 'shooting'">. В ячейке: попадания/попытки и процент.</template>
    </p>
    <p v-else class="player-box-unavailable">Нет статистики игроков этой команды.</p>
    <details v-if="didNotPlay.length" class="player-dnp">
      <summary>
        Не играли <span>{{ didNotPlay.length }}</span>
      </summary>
      <ul>
        <li v-for="line in didNotPlay" :key="line.player.id">
          {{ line.player.displayName ?? `Игрок ${line.player.providerId}` }}
        </li>
      </ul>
    </details>
  </section>
</template>
