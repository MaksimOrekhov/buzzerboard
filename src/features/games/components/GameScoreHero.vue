<script setup lang="ts">
import { computed } from 'vue'
import type { Game } from '@/entities/nba/model'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import TeamProfileLink from '@/shared/components/TeamProfileLink.vue'
import StatTable from '@/shared/components/StatTable.vue'
import StatValue from '@/shared/components/StatValue.vue'
import AppBadge from '@/shared/components/AppBadge.vue'
import { VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'

import SpoilerGameReveal from '@/features/spoilers/SpoilerGameReveal.vue'
const props = defineProps<{ game: Game; hidden: boolean; scheduleOnly: boolean }>()
const gameStatus = computed(
  () =>
    ({
      final: 'Завершён',
      scheduled: 'Запланирован',
      live: 'Идёт',
      postponed: 'Отложен',
      canceled: 'Отменён',
      suspended: 'Приостановлен',
      unknown: 'Статус неизвестен',
    })[props.game.status] ?? 'Матч',
)
const winner = computed(() => {
  const { home, away } = props.game.score
  if (
    props.hidden ||
    props.scheduleOnly ||
    props.game.status !== 'final' ||
    home === null ||
    away === null ||
    home === away
  )
    return null
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
  <section
    class="game-detail-hero"
    :class="{ 'game-detail-hero--schedule': hidden || scheduleOnly }"
    :aria-label="hidden || scheduleOnly ? 'Карточка матча' : 'Результат матча'"
  >
    <div class="game-detail-hero-meta">
      <AppBadge v-if="!hidden" tone="neutral" dot>{{
        scheduleOnly ? 'Запланирован' : gameStatus
      }}</AppBadge>
      <span>Игровой день NBA · {{ game.nbaGameDate }} ET</span>
      <span v-if="game.seasonEndYear" class="game-detail-season"
        >Сезон {{ game.seasonEndYear - 1 }}/{{ String(game.seasonEndYear).slice(-2) }}</span
      >
    </div>
    <div class="game-detail-scoreline">
      <div class="game-detail-side" :class="{ 'game-detail-side--winner': winner === 'away' }">
        <TeamProfileLink :team="game.awayTeam" class="game-detail-team-link">
          <TeamLogo :team="game.awayTeam" :size="54" />
          <span>{{
            game.awayTeam.displayName ?? game.awayTeam.abbreviation ?? 'Гости'
          }}</span><small>ГОСТИ · {{ game.awayTeam.abbreviation }}</small>
        </TeamProfileLink>
        <strong v-if="!hidden && !scheduleOnly">{{ game.score.away ?? '—' }}</strong>
      </div>
      <div class="game-detail-center">
        <span v-if="!hidden && !scheduleOnly">{{ winner ? 'ФИНАЛ' : 'СЧЁТ' }}</span>
        <span class="game-detail-vs">—</span>
      </div>
      <div
        class="game-detail-side game-detail-side--home"
        :class="{ 'game-detail-side--winner': winner === 'home' }"
      >
        <strong v-if="!hidden && !scheduleOnly">{{ game.score.home ?? '—' }}</strong>
        <TeamProfileLink :team="game.homeTeam" class="game-detail-team-link">
          <TeamLogo :team="game.homeTeam" :size="54" />
          <span>{{
            game.homeTeam.displayName ?? game.homeTeam.abbreviation ?? 'Хозяева'
          }}</span><small>ХОЗЯЕВА · {{ game.homeTeam.abbreviation }}</small>
        </TeamProfileLink>
      </div>
    </div>
    <div class="game-detail-venue">
      <span>{{ localStart }} · {{ VIEWER_TIME_ZONE }}</span>
      <span v-if="game.venue">{{ game.venue }}</span>
    </div>
    <SpoilerGameReveal v-if="hidden" :game="game" class="game-detail-reveal" />
    <StatTable
      v-if="!hidden && !scheduleOnly && game.scoreByPeriod?.length"
      class="game-detail-periods"
      label="Счёт по четвертям"
    >
      <table>
        <caption>
          Счёт по четвертям
        </caption>
        <thead>
          <tr>
            <th scope="col">Команда</th>
            <th v-for="period in game.scoreByPeriod" :key="period.period" scope="col">
              {{ period.period > 4 ? 'OT' + (period.period - 4) : 'Q' + period.period }}
            </th>
            <th scope="col">Итого</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="side in ['away', 'home'] as const" :key="side">
            <th scope="row">
              {{ side === 'away' ? game.awayTeam.abbreviation : game.homeTeam.abbreviation }}
            </th>
            <td v-for="period in game.scoreByPeriod" :key="period.period">
              {{ period[side] ?? '—' }}
            </td>
            <td><StatValue :value="game.score[side]" /></td>
          </tr>
        </tbody>
      </table>
    </StatTable>
  </section>
</template>
