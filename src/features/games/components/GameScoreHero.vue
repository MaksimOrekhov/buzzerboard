<script setup lang="ts">
import { computed } from 'vue'
import type { Game } from '@/entities/nba/model'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import AppBadge from '@/shared/components/AppBadge.vue'
import { VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'

const props = defineProps<{ game: Game }>()
const gameStatus = computed(() => (props.game.status === 'final' ? 'Завершён' : 'Матч'))
const winner = computed(() => {
  const { home, away } = props.game.score
  if (props.game.status !== 'final' || home === null || away === null || home === away) return null
  return home > away ? 'home' : 'away'
})
const localStart = computed(() =>
  props.game.startsAt
    ? new Intl.DateTimeFormat('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: VIEWER_TIME_ZONE,
      }).format(new Date(props.game.startsAt))
    : 'Время не указано',
)
</script>

<template>
  <section class="game-detail-hero" aria-label="Результат матча">
    <div class="game-detail-hero-meta">
      <AppBadge tone="neutral" dot>{{ gameStatus }}</AppBadge>
      <span>Игровой день NBA · {{ game.nbaGameDate }}</span>
      <span v-if="game.seasonEndYear"
        >Сезон {{ game.seasonEndYear - 1 }}/{{ String(game.seasonEndYear).slice(-2) }}</span
      >
    </div>
    <div class="game-detail-scoreline">
      <div class="game-detail-side" :class="{ 'game-detail-side--winner': winner === 'away' }">
        <TeamLogo :team="game.awayTeam" :size="76" />
        <div>
          <span>{{
            game.awayTeam.displayName ?? game.awayTeam.abbreviation ?? 'Гости'
          }}</span><small>ГОСТИ · {{ game.awayTeam.abbreviation }}</small>
        </div>
        <strong>{{ game.score.away ?? '—' }}</strong>
      </div>
      <div class="game-detail-center">
        <span>{{ winner ? 'ФИНАЛ' : 'СЧЁТ' }}</span>
        <span class="game-detail-vs">—</span>
      </div>
      <div
        class="game-detail-side game-detail-side--home"
        :class="{ 'game-detail-side--winner': winner === 'home' }"
      >
        <strong>{{ game.score.home ?? '—' }}</strong>
        <TeamLogo :team="game.homeTeam" :size="76" />
        <div>
          <span>{{
            game.homeTeam.displayName ?? game.homeTeam.abbreviation ?? 'Хозяева'
          }}</span><small>ХОЗЯЕВА · {{ game.homeTeam.abbreviation }}</small>
        </div>
      </div>
    </div>
    <div class="game-detail-venue">
      <span>{{ localStart }} · {{ VIEWER_TIME_ZONE }}</span>
      <span v-if="game.venue">{{ game.venue }}</span>
      <span v-if="winner"
        >Победитель ·
        {{ winner === 'home' ? game.homeTeam.displayName : game.awayTeam.displayName }}</span
      >
    </div>
    <div
      v-if="game.scoreByPeriod?.length"
      class="game-detail-periods"
      :style="{ '--period-count': game.scoreByPeriod.length }"
      aria-label="Счёт по четвертям"
    >
      <span class="game-period-label">Команда</span
      ><span v-for="period in game.scoreByPeriod" :key="`p-${period.period}`">{{
        period.period
      }}</span
      ><span class="game-period-label">Итого</span>
      <span class="game-period-team">{{ game.awayTeam.abbreviation }}</span><span
        v-for="period in game.scoreByPeriod"
        :key="`a-${period.period}`"
        >{{ period.away ?? '—' }}</span
      ><strong class="game-period-total">{{ game.score.away ?? '—' }}</strong>
      <span class="game-period-team">{{ game.homeTeam.abbreviation }}</span><span
        v-for="period in game.scoreByPeriod"
        :key="`h-${period.period}`"
        >{{ period.home ?? '—' }}</span
      ><strong class="game-period-total">{{ game.score.home ?? '—' }}</strong>
    </div>
  </section>
</template>
