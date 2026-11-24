<script setup lang="ts">
import type { Game } from '@/entities/nba/model'
import { RouterLink } from 'vue-router'
defineProps<{
  closest: Game | null
  highest: Game | null
  finalCount: number
  detailsTo: (game: Game) => string
}>()
</script>
<template>
  <aside class="gc-insights gc-insights--compact" aria-label="Сводка игрового дня">
    <div class="gc-insights-title">
      <span class="gc-section-kicker">Контекст дня</span>
      <h2>В фокусе</h2>
    </div>
    <RouterLink v-if="closest" :to="detailsTo(closest)" class="gc-focus-card">
      <span class="gc-focus-label">01 &nbsp; Минимальная разница</span>
      <strong
        >{{ Math.abs(closest.score.home! - closest.score.away!) }}
        <small>очк. разницы</small></strong
      >
      <span class="gc-focus-teams"
        >{{ closest.awayTeam.abbreviation ?? closest.awayTeam.displayName }} —
        {{ closest.homeTeam.abbreviation ?? closest.homeTeam.displayName }}</span
      >
      <span class="gc-focus-caption">Самый близкий результат дня <b>↗</b></span>
    </RouterLink>
    <RouterLink v-if="highest" :to="detailsTo(highest)" class="gc-focus-card">
      <span class="gc-focus-label">02 &nbsp; Самый результативный</span>
      <strong>{{ highest.score.home! + highest.score.away! }} <small>очков</small></strong>
      <span class="gc-focus-teams"
        >{{ highest.awayTeam.abbreviation ?? highest.awayTeam.displayName }} —
        {{ highest.homeTeam.abbreviation ?? highest.homeTeam.displayName }}</span
      >
      <span class="gc-focus-caption">Очки обеих команд <b>↗</b></span>
    </RouterLink>
    <p v-if="finalCount" class="gc-focus-footnote">На основе {{ finalCount }} завершённых матчей</p>
    <p v-else class="gc-focus-footnote">Сводка появится после подтверждения результатов.</p>
  </aside>
</template>
