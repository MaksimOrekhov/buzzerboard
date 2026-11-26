<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import AppButton from '@/shared/components/AppButton.vue'
import {
  formatGameStat,
  gameMetrics,
  playerTrend,
  type GameMetric,
  type PlayerLogRow,
} from './playerGameLog'

const { rows } = defineProps<{ rows: readonly PlayerLogRow[] }>()
const metric = shallowRef<GameMetric>('pts')
const selectedIndex = shallowRef<number | null>(null)
const chart = computed(() => playerTrend(rows, metric.value))
const selected = computed(
  () =>
    chart.value.points.find((point) => point.index === selectedIndex.value) ??
    chart.value.points.at(-1),
)
const label = computed(() => gameMetrics.find((item) => item.value === metric.value)!.label)
const selectionOrder = computed(() =>
  selected.value ? chart.value.points.indexOf(selected.value) : -1,
)

function movePoint(offset: number) {
  const point = chart.value.points[selectionOrder.value + offset]
  if (point) selectedIndex.value = point.index
}
</script>

<template>
  <section class="player-panel pa-trend" aria-labelledby="player-trend-title">
    <h2 id="player-trend-title">Тренд</h2>
    <p class="player-meta">
      {{ chart.shown }} из {{ rows.length }} матчей видимы · {{ chart.points.length }} знач. · даты
      NBA ET
    </p>
    <AppSegmented v-model="metric" :options="gameMetrics" label="Показатель графика" />
    <figure v-if="chart.points.length" class="player-chart">
      <svg viewBox="0 0 576 194" role="group" :aria-label="`${label} по матчам`">
        <g v-for="fraction in [0, 0.5, 1]" :key="fraction" aria-hidden="true">
          <line
            x1="48"
            x2="552"
            :y1="168 - 146 * fraction"
            :y2="168 - 146 * fraction"
            class="chart-gridline"
          />
          <text x="38" :y="174 - 146 * fraction" text-anchor="end">
            {{ formatGameStat(chart.max * fraction) }}
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
          aria-hidden="true"
        />
        <g
          v-for="point in chart.points"
          :key="point.index"
          tabindex="0"
          role="button"
          class="pa-chart-point"
          :aria-label="`${label} · ${point.date} NBA ET · ${formatGameStat(point.value)}`"
          :aria-pressed="selected?.index === point.index"
          @focus="selectedIndex = point.index"
          @pointerenter="selectedIndex = point.index"
          @click="selectedIndex = point.index"
          @keydown.enter.prevent="selectedIndex = point.index"
          @keydown.space.prevent="selectedIndex = point.index"
        >
          <circle class="pa-chart-hit" :cx="point.x" :cy="point.y" r="15" />
          <circle :cx="point.x" :cy="point.y" :r="selected?.index === point.index ? 6 : 4.5">
            <title>{{ point.date }}: {{ formatGameStat(point.value) }}</title>
          </circle>
        </g>
        <text v-if="chart.points.length > 1" x="48" y="191" aria-hidden="true">
          {{ chart.points[0]?.date.slice(5) }}
        </text>
        <text v-if="chart.points.length > 1" x="552" y="191" text-anchor="end" aria-hidden="true">
          {{ chart.points.at(-1)?.date.slice(5) }}
        </text>
      </svg>
      <figcaption v-if="selected" class="pa-point-controls">
        <AppButton
          aria-label="Предыдущая точка"
          :disabled="selectionOrder === 0"
          @click="movePoint(-1)"
          >‹</AppButton
        >
        <span aria-live="polite"
          >{{ selected.date }}
          <strong>{{ label }}: {{ formatGameStat(selected.value) }}</strong></span
        >
        <AppButton
          aria-label="Следующая точка"
          :disabled="selectionOrder === chart.points.length - 1"
          @click="movePoint(1)"
          >›</AppButton
        >
      </figcaption>
    </figure>
    <p v-else class="player-meta pa-trend-empty">Для этого показателя нет видимых значений.</p>
    <p class="player-meta pa-trend-note">Пропуски — разрывы. Значения — в журнале.</p>
  </section>
</template>
