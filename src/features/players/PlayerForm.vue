<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import type { PlayerGame } from '@/entities/nba/players'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import StatTable from '@/shared/components/StatTable.vue'

import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'
import SpoilerGameReveal from '@/features/spoilers/SpoilerGameReveal.vue'
const { hideCompleted } = useSpoilerMode()
const props = defineProps<{ games: readonly PlayerGame[]; returnTo: string }>()
type Metric = 'pts' | 'reb' | 'ast' | 'min'
const metrics = [
  { value: 'pts', label: 'Очки' },
  { value: 'reb', label: 'Подборы' },
  { value: 'ast', label: 'Передачи' },
  { value: 'min', label: 'Минуты' },
] as const
const metric = shallowRef<Metric>('pts')
const sort = shallowRef<Metric | 'date'>('date')
const ascending = shallowRef(false)
function changeSort(key: Metric | 'date') {
  ascending.value = sort.value === key ? !ascending.value : false
  sort.value = key
}
const gameIdentity = (game: PlayerGame) => ({ id: game.gameId, nbaGameDate: game.date })
const hidden = (game: PlayerGame) => hideCompleted(gameIdentity(game))
const rows = computed(() =>
  [...props.games].sort((a, b) => {
    const key = sort.value
    const sign = ascending.value ? 1 : -1
    if (key === 'date') return sign * a.date.localeCompare(b.date)
    const left = hidden(a) ? null : a[key]
    const right = hidden(b) ? null : b[key]
    if (left === null) return right === null ? b.date.localeCompare(a.date) : 1
    if (right === null) return -1
    return sign * (left - right) || b.date.localeCompare(a.date)
  }),
)
const chart = computed(() => {
  const games = props.games
    .filter((game) => !hidden(game))
    .sort((a, b) => a.date.localeCompare(b.date))
  const series = games.map((game) => game[metric.value])
  const max = Math.max(5, Math.ceil(Math.max(0, ...series.map((entry) => entry ?? 0)) / 5) * 5)
  const points = series.flatMap((value, index) =>
    value === null
      ? []
      : [
          {
            index,
            value,
            x: 48 + 504 * (series.length === 1 ? 0.5 : index / (series.length - 1)),
            y: 168 - (146 * value) / max,
          },
        ],
  )
  return {
    games,
    max,
    points,
    edges: points
      .slice(1)
      .flatMap((point, index) =>
        points[index]?.index === point.index - 1 ? [{ start: points[index]!, end: point }] : [],
      ),
  }
})
const label = computed(() => metrics.find((item) => item.value === metric.value)?.label)
function stat(value: number | null) {
  return value === null ? '—' : Number(value.toFixed(1)).toLocaleString('ru-RU')
}
</script>

<template>
  <section class="player-panel">
    <h2>Последние игры</h2>
    <p class="player-meta">
      До {{ games.length }} доступных матчей из журнала BBS и локальной статистики. Пропуски не
      считаются нулями.
    </p>
    <AppSegmented v-model="metric" :options="metrics" label="Показатель графика" />
    <figure v-if="chart.points.length" class="player-chart">
      <svg
        viewBox="0 0 576 194"
        role="img"
        :aria-label="
          label + ' по матчам: от ' + chart.games[0]?.date + ' до ' + chart.games.at(-1)?.date
        "
      >
        <g v-for="fraction in [0, 0.5, 1]" :key="fraction">
          <line
            x1="48"
            x2="552"
            :y1="168 - 146 * fraction"
            :y2="168 - 146 * fraction"
            class="chart-gridline"
          />
          <text x="38" :y="174 - 146 * fraction" text-anchor="end">
            {{ stat(chart.max * fraction) }}
          </text>
        </g>
        <line
          v-for="{ start, end } in chart.edges"
          :key="end.index"
          :x1="start.x"
          :y1="start.y"
          :x2="end.x"
          :y2="end.y"
          class="chart-line"
        />
        <circle v-for="point in chart.points" :key="point.index" :cx="point.x" :cy="point.y" r="4">
          <title>{{ chart.games[point.index]?.date }}: {{ stat(point.value) }}</title>
        </circle>
      </svg>
      <figcaption>
        <span>{{ chart.games[0]?.date }}</span><span>{{ chart.games.at(-1)?.date }}</span>
      </figcaption>
    </figure>
    <p v-else class="player-empty">Для графика нет значений.</p>
    <StatTable label="Журнал матчей игрока">
      <table class="players-table player-log">
        <thead>
          <tr>
            <th
              scope="col"
              :aria-sort="sort === 'date' ? (ascending ? 'ascending' : 'descending') : undefined"
            >
              <button @click="changeSort('date')">Дата</button>
            </th>
            <th scope="col">Соперник</th>
            <th
              v-for="item in metrics"
              :key="item.value"
              scope="col"
              :aria-sort="
                sort === item.value ? (ascending ? 'ascending' : 'descending') : undefined
              "
            >
              <button @click="changeSort(item.value)">{{ item.label }}</button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="game in rows" :key="game.date + ':' + (game.gameId ?? game.opponent)">
            <th scope="row">
              <RouterLink
                v-if="game.gameId"
                class="ui-text-link"
                :to="{
                  name: 'game-details',
                  params: { gameId: game.gameId },
                  query: { date: game.date, from: returnTo },
                }"
                >{{ game.date }}</RouterLink><span v-else>{{ game.date }}</span>
            </th>
            <td :class="{ 'player-log-opponent--protected': hidden(game) }">
              <span>{{ game.opponent ?? '—' }}</span>
              <SpoilerGameReveal v-if="hidden(game)" :game="gameIdentity(game)" />
            </td>
            <td v-if="hidden(game)" :colspan="metrics.length" />
            <template v-else>
              <td v-for="item in metrics" :key="item.value">{{ stat(game[item.value]) }}</td>
            </template>
          </tr>
        </tbody>
      </table>
    </StatTable>
  </section>
</template>

<style scoped>
.player-log td.player-log-opponent--protected {
  text-align: start;
}
.player-log-opponent--protected .spoiler-game-reveal {
  justify-items: start;
  text-align: start;
}
</style>
