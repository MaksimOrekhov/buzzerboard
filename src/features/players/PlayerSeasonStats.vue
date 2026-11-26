<script setup lang="ts">
import { computed } from 'vue'
import {
  advancedMetrics,
  formatAdvancedStat,
  per36Metrics,
  seasonAdvancedMetrics,
} from '@/entities/nba/advancedStats'
import { formatPlayerStat, playerMetrics, type PlayerStats } from '@/entities/nba/players'
import AppTooltip from '@/shared/components/AppTooltip.vue'
import StatValue from '@/shared/components/StatValue.vue'

const { stats } = defineProps<{ stats: PlayerStats }>()
const basics = [
  ['basic', 'Основное'],
  ['shooting', 'Броски'],
  ['defense', 'Защита и потери'],
] as const

const groups = computed(() => {
  const advanced = seasonAdvancedMetrics(stats)
  return [
    ...basics.map(([group, title]) => ({
      group,
      title,
      rows: playerMetrics
        .filter((column) => column[3] === group)
        .map(([key, short, label]) => ({
          key,
          short,
          label,
          value: formatPlayerStat(key, stats[key]),
        })),
    })),
    {
      group: 'advanced',
      title: 'Эффективность',
      rows: advancedMetrics.map((metric) => ({
        ...metric,
        value: formatAdvancedStat(metric.key, advanced[metric.key]),
      })),
    },
    {
      group: 'per36',
      title: 'За 36 минут',
      rows: per36Metrics.map((metric) => ({
        ...metric,
        value: formatAdvancedStat(metric.key, advanced[metric.key]),
      })),
    },
  ]
})
</script>

<template>
  <p class="player-meta">Средние за матч. GP — количество матчей.</p>
  <div class="pa-stat-groups">
    <section v-for="{ group, title, rows } in groups" :key="group">
      <h3 :id="`player-group-${group}`">{{ title }}</h3>
      <table class="pa-stat-table" :aria-labelledby="`player-group-${group}`">
        <tbody>
          <tr v-for="row in rows" :key="row.key" :data-metric="row.key">
            <th scope="row">
              <AppTooltip v-if="'description' in row" :text="row.description">
                <span tabindex="0" class="pa-stat-code">{{ row.short }}</span>
              </AppTooltip>
              <span v-else class="pa-stat-code">{{ row.short }}</span>
              <span>{{ row.label }}</span>
            </th>
            <td><StatValue :value="row.value" /></td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
  <p class="pa-method player-meta">
    Расчёт BuzzerBoard по сезонным средним BBS. Отношения приблизительны из-за округления источника.
    GmSc/игру — линейная оценка по средним, не официальный PER или рейтинг влияния. Показатели за 36
    минут нормируют среднее на игровое время и не являются прогнозом.
  </p>
</template>
