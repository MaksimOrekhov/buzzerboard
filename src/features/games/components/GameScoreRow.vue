<script setup lang="ts">
import '../games.css'
import { computed, useId } from 'vue'
import type { Game, GameStatus } from '@/entities/nba/model'
import AppIcon from '@/shared/components/AppIcon.vue'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import TeamProfileLink from '@/shared/components/TeamProfileLink.vue'
import { VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'
import { RouterLink } from 'vue-router'
import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'
import SpoilerGameReveal from '@/features/spoilers/SpoilerGameReveal.vue'
const { hideGame, isFutureSchedule } = useSpoilerMode()
const props = defineProps<{
  game: Game
  favorite: boolean
  expanded: boolean
  detailsTo?: string
}>()
const emit = defineEmits<{ favorite: []; details: [] }>()
const detailsId = useId()
const labels: Record<GameStatus, string> = {
  final: 'Завершён',
  scheduled: 'Ожидается',
  postponed: 'Перенесён',
  canceled: 'Отменён',
  suspended: 'Приостановлен',
  unknown: 'Уточняется',
  live: 'Уточняется',
}
const startTime = computed(() =>
  props.game.startsAt
    ? new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: VIEWER_TIME_ZONE,
      }).format(new Date(props.game.startsAt))
    : '—',
)
const localDate = computed(() =>
  props.game.startsAt
    ? new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
        timeZone: VIEWER_TIME_ZONE,
      }).format(new Date(props.game.startsAt))
    : 'Время не указано',
)
const hidden = computed(() => hideGame(props.game))
const scheduleOnly = computed(() => isFutureSchedule(props.game))
const winner = computed(() =>
  !hidden.value &&
  !scheduleOnly.value &&
  props.game.status === 'final' &&
  props.game.score.home !== null &&
  props.game.score.away !== null
    ? props.game.score.home > props.game.score.away
      ? 'home'
      : props.game.score.away > props.game.score.home
        ? 'away'
        : null
    : null,
)
</script>
<template>
  <article
    class="gc-score-row"
    :class="{
      'gc-score-row--open': expanded && !hidden && !scheduleOnly,
      'gc-score-row--protected': hidden,
    }"
    :aria-label="`${game.awayTeam.displayName ?? 'Гости'} — ${game.homeTeam.displayName ?? 'Хозяева'}`"
  >
    <div class="gc-match-main">
      <div class="gc-match-time">
        <time v-if="game.startsAt" :datetime="game.startsAt">{{ startTime }}</time><span v-else
          >—</span
        ><span>{{ localDate }}</span>
      </div>
      <div
        class="gc-match-team gc-match-team--away"
        :class="{ 'gc-match-team--winner': winner === 'away' }"
      >
        <TeamLogo :team="game.awayTeam" />
        <TeamProfileLink :team="game.awayTeam" class="gc-team-profile-copy">
          <span class="gc-team-name">{{
            game.awayTeam.displayName ?? game.awayTeam.abbreviation ?? 'Команда гостей'
          }}</span><span class="gc-team-abbr"
            >{{ game.awayTeam.abbreviation ?? 'Гости'
            }}<span v-if="winner === 'away'" class="gc-winner-marker" aria-label="Победитель">
              · W</span
            ></span
          >
        </TeamProfileLink>
        <span
          v-if="!hidden && !scheduleOnly"
          class="gc-mobile-score"
          :class="{ 'gc-score--muted': winner === 'home' }"
          >{{ game.score.away ?? '—' }}</span
        >
      </div>
      <SpoilerGameReveal v-if="hidden" class="gc-match-reveal" :game="game" />
      <div v-else class="gc-score-block">
        <div
          v-if="!scheduleOnly"
          class="gc-score"
          :aria-label="`Счёт ${game.score.away ?? 'неизвестен'} : ${game.score.home ?? 'неизвестен'}`"
        >
          <span :class="{ 'gc-score--muted': winner === 'home' }">{{
            game.score.away ?? '—'
          }}</span><span class="gc-score-separator">:</span
          ><span :class="{ 'gc-score--muted': winner === 'away' }">{{
            game.score.home ?? '—'
          }}</span>
        </div>
        <span
          class="gc-match-status"
          :class="{ 'gc-match-status--final': !scheduleOnly && game.status === 'final' }"
          >{{ labels[scheduleOnly ? 'scheduled' : game.status] }}</span
        >
      </div>
      <div
        class="gc-match-team gc-match-team--home"
        :class="{ 'gc-match-team--winner': winner === 'home' }"
      >
        <TeamLogo :team="game.homeTeam" />
        <TeamProfileLink :team="game.homeTeam" class="gc-team-profile-copy">
          <span class="gc-team-name">{{
            game.homeTeam.displayName ?? game.homeTeam.abbreviation ?? 'Команда хозяев'
          }}</span><span class="gc-team-abbr"
            >{{ game.homeTeam.abbreviation ?? 'Хозяева'
            }}<span v-if="winner === 'home'" class="gc-winner-marker" aria-label="Победитель">
              · W</span
            ></span
          >
        </TeamProfileLink>
        <span
          v-if="!hidden && !scheduleOnly"
          class="gc-mobile-score"
          :class="{ 'gc-score--muted': winner === 'away' }"
          >{{ game.score.home ?? '—' }}</span
        >
      </div>
      <div class="gc-row-actions">
        <button
          class="gc-icon-button gc-favorite"
          :aria-pressed="favorite"
          :aria-label="favorite ? 'Убрать матч из избранного' : 'Добавить матч в избранное'"
          @click="emit('favorite')"
        >
          <AppIcon name="star" /></button
        ><button
          v-if="!detailsTo && !hidden && !scheduleOnly"
          class="gc-icon-button gc-detail-button"
          :aria-expanded="expanded"
          :aria-controls="detailsId"
          :aria-label="expanded ? 'Скрыть детали матча' : 'Детали матча'"
          @click="emit('details')"
        >
          <AppIcon name="down" :size="16" /></button
        ><RouterLink
          v-else-if="detailsTo"
          class="gc-icon-button gc-detail-button"
          :to="detailsTo"
          aria-label="Открыть карточку матча"
          title="Полная карточка матча"
          ><AppIcon name="arrow" :size="16"
        /></RouterLink>
      </div>
    </div>
    <section
      v-if="expanded && !hidden && !scheduleOnly"
      :id="detailsId"
      class="gc-match-details"
      aria-label="Детали матча"
    >
      <p v-if="game.venue"><AppIcon name="pin" :size="16" />{{ game.venue }}</p>
      <p v-if="winner">
        <span class="gc-detail-label">Победитель</span
        >{{ winner === 'home' ? game.homeTeam.displayName : game.awayTeam.displayName }} · +{{
          Math.abs(game.score.home! - game.score.away!)
        }}
      </p>
      <p><AppIcon name="clock" :size="16" />Местное время · {{ VIEWER_TIME_ZONE }}</p>
      <table v-if="game.scoreByPeriod?.length" class="gc-period-table">
        <caption>
          Счёт по периодам
        </caption>
        <thead>
          <tr>
            <th scope="col">Период</th>
            <th scope="col">Гости</th>
            <th scope="col">Хозяева</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="period in game.scoreByPeriod" :key="period.period">
            <th scope="row">{{ period.period }}</th>
            <td>{{ period.away ?? '—' }}</td>
            <td>{{ period.home ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="gc-detail-label">Счёт по четвертям недоступен.</p>
    </section>
  </article>
</template>
