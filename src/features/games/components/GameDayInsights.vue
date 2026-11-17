<script setup lang="ts">
import type { Game } from '@/entities/nba/model'
import TeamLogo from '@/shared/components/v2/TeamLogo.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
defineProps<{
  closest: Game | null
  highest: Game | null
  totalPoints: number
  finalCount: number
}>()
</script>
<template>
  <aside class="gc-insights" aria-label="Сводка игрового дня">
    <h2>В фокусе</h2>
    <section v-if="closest" class="gc-insight-panel">
      <div class="gc-insight-heading">
        <AppIcon name="basketball" :size="17" />
        <h3>Самая близкая игра</h3>
      </div>
      <div class="gc-insight-match">
        <div>
          <TeamLogo :team="closest.awayTeam" :size="48" /><span>{{
            closest.awayTeam.abbreviation ?? closest.awayTeam.displayName
          }}</span>
        </div>
        <strong>{{ closest.score.away }}<span>:</span>{{ closest.score.home }}</strong>
        <div>
          <TeamLogo :team="closest.homeTeam" :size="48" /><span>{{
            closest.homeTeam.abbreviation ?? closest.homeTeam.displayName
          }}</span>
        </div>
      </div>
      <p class="gc-insight-callout">
        <strong>{{ Math.abs(closest.score.home! - closest.score.away!) }}</strong> очк. разницы
      </p>
      <p class="gc-insight-description">Минимальный отрыв среди завершённых матчей дня.</p>
    </section>
    <section v-if="highest" class="gc-insight-panel">
      <div class="gc-insight-heading">
        <AppIcon name="chart" :size="17" />
        <h3>Самый результативный</h3>
      </div>
      <div class="gc-points-value">
        {{ highest.score.home! + highest.score.away! }}<span>очков</span>
      </div>
      <div class="gc-insight-teams">
        <TeamLogo :team="highest.awayTeam" :size="28" /><span>{{
          highest.awayTeam.abbreviation ?? 'Гости'
        }}</span
        ><span class="gc-insight-vs">vs</span
        ><TeamLogo :team="highest.homeTeam" :size="28" /><span>{{
          highest.homeTeam.abbreviation ?? 'Хозяева'
        }}</span>
      </div>
      <p class="gc-insight-description">Сумма очков обеих команд.</p>
    </section>
    <section v-if="finalCount" class="gc-day-total">
      <span>За игровой день</span
      ><strong>{{ totalPoints.toLocaleString('ru-RU') }} <span>очков</span></strong>
      <p>В {{ finalCount }} завершённых матчах<br />с известным счётом</p>
    </section>
    <section v-if="!closest && !highest" class="gc-insight-panel">
      <AppIcon name="clock" :size="24" />
      <h3>День ещё впереди</h3>
      <p class="gc-insight-description">
        Здесь появится сводка, когда будут известны результаты матчей.
      </p>
    </section>
  </aside>
</template>
