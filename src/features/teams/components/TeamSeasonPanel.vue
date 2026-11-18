<script setup lang="ts">
import type { TeamSeasonProfile } from '@/entities/nba/model'
import { computed } from 'vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import { formatGamesBehind, formatPercentage, formatRecord } from '@/features/standings/formatters'
const props = defineProps<{ profile: TeamSeasonProfile }>()
const stats = computed(() => [
  { label: 'Матчей сыграно', value: props.profile.stats.gamesPlayed, digits: 0 },
  { label: 'Очков за матч', value: props.profile.stats.pointsPerGame, digits: 1 },
  { label: 'Подборов за матч', value: props.profile.stats.reboundsPerGame, digits: 1 },
  { label: 'Передач за матч', value: props.profile.stats.assistsPerGame, digits: 1 },
  { label: 'Потерь за матч', value: props.profile.stats.turnoversPerGame, digits: 1 },
  { label: 'Попадания с игры', value: props.profile.stats.fieldGoalPercentage, percent: true },
  { label: 'Попадания из-за дуги', value: props.profile.stats.threePointPercentage, percent: true },
])
function formatStat(value: number | null, percent = false, digits = 1) {
  if (percent)
    return value === null
      ? '—'
      : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value * 100)}%`
  return value === null
    ? '—'
    : new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(value)
}
</script>

<template>
  <section class="teams-panel" aria-labelledby="teams-season-title">
    <header class="teams-panel-heading">
      <div>
        <span class="teams-eyebrow"
          >Регулярный сезон · {{ profile.seasonEndYear - 1 }}/{{
            String(profile.seasonEndYear).slice(-2)
          }}</span
        >
        <h2 id="teams-season-title">Итоги сезона</h2>
      </div>
      <span class="ui-badge ui-badge--accent">BBS</span>
    </header>
    <div class="teams-season-overview">
      <div class="teams-record-block">
        <span>Победы — поражения</span
        ><strong>{{ formatRecord(profile.wins, profile.losses) }}</strong
        ><small>Баланс команды</small>
      </div>
      <div class="teams-season-facts">
        <div>
          <span>Доля побед*</span><strong>{{ formatPercentage(profile.winPercentage) }}</strong>
        </div>
        <div>
          <span>Место в лиге</span
          ><strong>{{ profile.overallRank === null ? '—' : `#${profile.overallRank}` }}</strong>
        </div>
        <div>
          <span>Отставание</span
          ><strong>{{
            profile.gamesBack === null ? '—' : `${formatGamesBehind(profile.gamesBack)} игр`
          }}</strong>
        </div>
        <div>
          <span>Серия</span><strong>{{ profile.streak ?? '—' }}</strong>
        </div>
      </div>
    </div>
    <div class="teams-splits">
      <article>
        <span>Дома</span
        ><strong>{{
          formatRecord(profile.home?.wins ?? null, profile.home?.losses ?? null)
        }}</strong
        ><small>{{ profile.home ? 'Баланс на своей площадке' : 'Нет данных в BBS' }}</small>
      </article>
      <article>
        <span>В гостях</span
        ><strong>{{
          formatRecord(profile.away?.wins ?? null, profile.away?.losses ?? null)
        }}</strong
        ><small>{{ profile.away ? 'Баланс на выезде' : 'Нет данных в BBS' }}</small>
      </article>
    </div>
    <div class="teams-stat-grid">
      <article v-for="stat in stats" :key="stat.label">
        <span>{{ stat.label }}</span><strong>{{
          formatStat(stat.value, stat.percent, stat.digits)
        }}</strong>
      </article>
    </div>
    <p class="teams-data-footnote">
      <AppIcon name="database" :size="15" />PCT* рассчитан по подтверждённому балансу команды.
      Расширенные метрики в ответе BBS отсутствуют. Незаполненные показатели оставлены пустыми.
    </p>
  </section>
</template>
