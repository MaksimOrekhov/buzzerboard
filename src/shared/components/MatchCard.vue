<script setup lang="ts">
import { computed } from 'vue'

import AppBadge from './AppBadge.vue'
import AppIcon from './AppIcon.vue'
import type { Game, GameStatus } from '@/entities/nba/model'
import { VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'

const props = defineProps<{
  game: Game
  favorite?: boolean
  detailsExpanded?: boolean
}>()

const emit = defineEmits<{
  toggleFavorite: []
  toggleDetails: []
}>()

const statusLabels: Record<GameStatus, string> = {
  scheduled: 'Запланирован',
  live: 'Идёт игра',
  final: 'Завершён',
  postponed: 'Перенесён',
  canceled: 'Отменён',
  suspended: 'Приостановлен',
  unknown: 'Статус уточняется',
}

const statusTone: Record<GameStatus, 'neutral' | 'accent' | 'lime' | 'warning' | 'success'> = {
  scheduled: 'neutral',
  live: 'accent',
  final: 'success',
  postponed: 'warning',
  canceled: 'warning',
  suspended: 'warning',
  unknown: 'neutral',
}

const displayNbaDate = computed(() => {
  const date = new Date(`${props.game.nbaGameDate}T12:00:00Z`)
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
})

const displayLocalStart = computed(() => {
  if (!props.game.startsAt) return 'Время начала не указано'
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: VIEWER_TIME_ZONE,
    timeZoneName: 'short',
  }).format(new Date(props.game.startsAt))
})

function teamInitials(abbreviation: string | null, displayName: string | null): string {
  if (abbreviation) return abbreviation
  if (!displayName) return 'NBA'
  return displayName
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
}

function score(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('ru-RU').format(value)
}
</script>

<template>
  <article
    class="match-card"
    :aria-label="`${game.awayTeam.displayName ?? 'Гость'} — ${game.homeTeam.displayName ?? 'Хозяин'}`"
  >
    <header class="match-card-header">
      <span class="match-date">NBA · {{ displayNbaDate }} (ET)</span>
      <AppBadge :tone="statusTone[game.status]" dot>{{ statusLabels[game.status] }}</AppBadge>
    </header>

    <div class="match-lineup">
      <div class="match-team">
        <span class="team-mark">{{
          teamInitials(game.awayTeam.abbreviation, game.awayTeam.displayName)
        }}</span>
        <span class="team-name">{{ game.awayTeam.displayName ?? 'Команда гостей' }}</span>
      </div>
      <span class="match-score">{{ score(game.score.away) }}</span>
    </div>

    <div class="match-divider"><span>VS</span></div>

    <div class="match-lineup">
      <div class="match-team">
        <span class="team-mark team-mark--home">
          {{ teamInitials(game.homeTeam.abbreviation, game.homeTeam.displayName) }}
        </span>
        <span class="team-name">{{ game.homeTeam.displayName ?? 'Команда хозяев' }}</span>
      </div>
      <span class="match-score">{{ score(game.score.home) }}</span>
    </div>

    <footer class="match-card-footer">
      <span>Местное время · {{ VIEWER_TIME_ZONE }}</span>
      <time v-if="game.startsAt" :datetime="game.startsAt">{{ displayLocalStart }}</time>
      <span v-else>{{ displayLocalStart }}</span>
    </footer>

    <div class="match-card-actions">
      <button
        class="match-action"
        type="button"
        :aria-pressed="favorite"
        :aria-label="favorite ? 'Убрать матч из избранного' : 'Добавить матч в избранное'"
        @click="emit('toggleFavorite')"
      >
        <AppIcon name="bookmark" :size="15" />
        {{ favorite ? 'В избранном' : 'В избранное' }}
      </button>
      <button
        class="match-action"
        type="button"
        :aria-expanded="detailsExpanded"
        @click="emit('toggleDetails')"
      >
        {{ detailsExpanded ? 'Скрыть детали' : 'Детали матча' }}
      </button>
    </div>

    <section v-if="detailsExpanded" class="match-details" aria-label="Детали матча">
      <p v-if="game.venue">Арена · {{ game.venue }}</p>
      <table v-if="game.scoreByPeriod?.length" class="period-table">
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
            <td>{{ score(period.away) }}</td>
            <td>{{ score(period.home) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!game.venue && !game.scoreByPeriod?.length">
        Источник не передал арену или счёт по периодам для этого матча.
      </p>
    </section>
  </article>
</template>

<style scoped>
.match-card {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(ellipse at 100% 0, rgb(242 122 86 / 7%), transparent 38%),
    linear-gradient(145deg, var(--surface-2), var(--surface-1));
  padding: 1rem;
}

.match-card-header,
.match-card-footer,
.match-lineup,
.match-team {
  display: flex;
  align-items: center;
}

.match-card-header,
.match-card-footer {
  justify-content: space-between;
  gap: 0.6rem;
}

.match-date,
.match-card-footer {
  color: var(--muted);
  font-size: var(--font-size-caption);
}

.match-lineup {
  justify-content: space-between;
  gap: 0.75rem;
  padding-top: 0.9rem;
}

.match-team {
  min-width: 0;
  gap: 0.65rem;
}

.team-mark {
  display: grid;
  width: 2.3rem;
  height: 2.3rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 0.75rem;
  background: var(--surface-3);
  color: var(--ink-soft);
  font-size: var(--font-size-caption);
  font-weight: 800;
  letter-spacing: 0.04em;
}

.team-mark--home {
  border-color: rgb(242 122 86 / 24%);
  background: var(--accent-soft);
  color: var(--accent-bright);
}

.team-name {
  overflow: hidden;
  color: var(--ink-soft);
  font-size: var(--font-size-caption);
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-score {
  color: var(--ink);
  font-size: 1.05rem;
  font-variant-numeric: tabular-nums;
  font-weight: 760;
}

.match-divider {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0.45rem 0 0 2.95rem;
  color: var(--subtle);
  font-size: var(--font-size-caption);
  font-weight: 780;
  letter-spacing: 0.15em;
}

.match-divider::before {
  position: absolute;
  right: 0;
  left: 0;
  height: 1px;
  background: var(--line);
  content: '';
}

.match-divider span {
  z-index: 1;
  background: var(--surface-1);
  padding: 0.15rem 0.4rem;
}

.match-card-footer {
  border-top: 1px solid var(--line);
  margin-top: 0.9rem;
  padding-top: 0.7rem;
}

.match-card-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.35rem 0.8rem;
  margin-top: 0.7rem;
}

.match-action {
  display: inline-flex;
  min-height: 2rem;
  align-items: center;
  gap: 0.35rem;
  border: 0;
  border-radius: 0.45rem;
  background: transparent;
  padding: 0.25rem;
  color: var(--muted);
  font: inherit;
  font-size: var(--font-size-caption);
  cursor: pointer;
}

.match-action:hover,
.match-action[aria-pressed='true'] {
  color: var(--lime);
}

.match-action:focus-visible {
  outline: 2px solid var(--lime);
  outline-offset: 2px;
}

.match-details {
  border-top: 1px solid var(--line);
  margin-top: 0.55rem;
  padding-top: 0.75rem;
  color: var(--muted);
  font-size: var(--font-size-caption);
}

.match-details p {
  margin: 0;
}

.period-table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.period-table caption {
  margin-bottom: 0.4rem;
  color: var(--ink-soft);
  font-weight: 650;
  text-align: left;
}

.period-table th,
.period-table td {
  border-bottom: 1px solid var(--line);
  padding: 0.4rem 0.25rem;
}

.period-table th:first-child {
  text-align: left;
}

.match-card-footer time,
.match-card-footer > span:last-child {
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
  font-weight: 680;
}
</style>
