<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import type { PlayerGame } from '@/entities/nba/players'
import StatTable from '@/shared/components/StatTable.vue'
import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'
import SpoilerGameReveal from '@/features/spoilers/SpoilerGameReveal.vue'
import PlayerTrend from './PlayerTrend.vue'
import {
  compareLogRows,
  formatGameStat,
  gameIdentity,
  gameMetrics,
  type GameLogSort,
} from './playerGameLog'

const { games, returnTo, hideTrend } = defineProps<{
  games: readonly PlayerGame[]
  returnTo: string
  hideTrend: boolean
}>()
const { enabled, window: spoilerWindow, hideCompleted } = useSpoilerMode()
const future = (game: PlayerGame) => enabled.value && game.date > spoilerWindow.value.today

const columns = [
  { value: 'date', label: 'Дата', code: 'Дата' },
  { value: 'opponent', label: 'Соперник', code: 'Соперник' },
  ...gameMetrics,
] as const
const sort = shallowRef<GameLogSort>('date')
const ascending = shallowRef(false)
const log = computed(() =>
  games.map((game) => ({ game, hidden: future(game) || hideCompleted(gameIdentity(game)) })),
)
const rows = computed(() =>
  [...log.value].sort((a, b) => compareLogRows(a, b, sort.value, ascending.value)),
)

function changeSort(key: GameLogSort) {
  ascending.value = sort.value === key ? !ascending.value : false
  sort.value = key
}
</script>

<template>
  <div class="pa-analysis" :class="{ 'pa-analysis--log-only': hideTrend }">
    <PlayerTrend v-if="!hideTrend" :rows="log" />
    <section class="player-panel pa-log-panel" aria-labelledby="player-log-title">
      <h2 id="player-log-title">Журнал матчей</h2>
      <p class="player-meta">BBS · {{ games.length }} доступных встреч · NBA ET</p>
      <p class="player-meta pa-log-scroll-x">⇆ Прокрутите, чтобы увидеть все показатели</p>
      <p v-if="games.length > 5" class="player-meta pa-log-scroll-y">
        ↕ Прокрутите журнал, чтобы увидеть все матчи
      </p>
      <StatTable label="Журнал матчей игрока">
        <table class="players-table player-log">
          <thead>
            <tr>
              <th
                v-for="column in columns"
                :key="column.value"
                scope="col"
                :aria-sort="
                  sort === column.value ? (ascending ? 'ascending' : 'descending') : undefined
                "
              >
                <button type="button" :aria-label="column.label" @click="changeSort(column.value)">
                  {{ column.code
                  }}<span v-if="sort === column.value" class="pa-sort-arrow" aria-hidden="true">{{
                    ascending ? ' ↑' : ' ↓'
                  }}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="{ game, hidden } in rows"
              :key="game.date + ':' + (game.gameId ?? game.opponent)"
            >
              <th scope="row">
                <RouterLink
                  v-if="game.gameId"
                  class="ui-text-link"
                  :aria-label="`Матч ${game.date} NBA ET`"
                  :to="{
                    name: 'game-details',
                    params: { gameId: game.gameId },
                    query: { date: game.date, from: returnTo },
                  }"
                  ><time :datetime="game.date"
                    >{{ game.date.slice(8) }}.{{ game.date.slice(5, 7) }}</time
                  ></RouterLink
                >
                <time v-else :datetime="game.date"
                  >{{ game.date.slice(8) }}.{{ game.date.slice(5, 7) }}</time
                >
              </th>
              <td class="pa-opponent">
                <span>{{ game.opponent ?? '—' }}</span>
                <SpoilerGameReveal v-if="hidden && !future(game)" :game="gameIdentity(game)" />
              </td>
              <td v-if="hidden" :colspan="gameMetrics.length" class="pa-protected">Скрыто</td>
              <template v-else>
                <td v-for="item in gameMetrics" :key="item.value">
                  {{ formatGameStat(game[item.value]) }}
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </StatTable>
    </section>
  </div>
</template>
