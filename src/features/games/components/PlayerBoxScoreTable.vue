<script setup lang="ts">
import type { PlayerBoxScore, Team } from '@/entities/nba/model'
import type { PlayerSortKey } from '@/features/games/composables/useGameDetailsModel'
import TeamLogo from '@/shared/components/TeamLogo.vue'

defineProps<{
  team: Team
  players: readonly PlayerBoxScore[]
  didNotPlay: readonly PlayerBoxScore[]
  sortBy: PlayerSortKey
  direction: 'ascending' | 'descending'
}>()
defineEmits<{ sort: [key: PlayerSortKey] }>()

const columns: Array<{ key: PlayerSortKey | null; label: string; aria: string }> = [
  { key: null, label: 'Игрок', aria: 'Игрок' },
  { key: 'minutes', label: 'MIN', aria: 'Минуты' },
  { key: 'points', label: 'PTS', aria: 'Очки' },
  { key: 'rebounds', label: 'REB', aria: 'Подборы' },
  { key: 'assists', label: 'AST', aria: 'Передачи' },
  { key: null, label: 'STL', aria: 'Перехваты' },
  { key: null, label: 'BLK', aria: 'Блок-шоты' },
  { key: null, label: 'TO', aria: 'Потери' },
  { key: null, label: 'FG', aria: 'Броски с игры' },
  { key: null, label: '3P', aria: 'Трёхочковые' },
  { key: null, label: 'FT', aria: 'Штрафные' },
  { key: null, label: 'PF', aria: 'Фолы' },
  { key: 'plusMinus', label: '+/−', aria: 'Плюс-минус' },
]
const mobileSorts: Array<{ key: PlayerSortKey; label: string; aria: string }> = [
  { key: 'points', label: 'PTS', aria: 'Очки' },
  { key: 'rebounds', label: 'REB', aria: 'Подборы' },
  { key: 'assists', label: 'AST', aria: 'Передачи' },
  { key: 'minutes', label: 'MIN', aria: 'Минуты' },
  { key: 'plusMinus', label: '+/−', aria: 'Плюс-минус' },
]
function value(value: number | null) {
  return value === null ? '—' : value
}
function shooting(made: number | null, attempted: number | null, rate: number | null) {
  if (made === null || attempted === null) return '—'
  return `${made}/${attempted}${rate === null ? '' : ` · ${(rate * 100).toFixed(0)}%`}`
}
</script>

<template>
  <section
    class="player-box-score"
    :aria-label="`Статистика игроков ${team.displayName ?? team.abbreviation}`"
  >
    <header class="player-box-score-heading">
      <TeamLogo :team="team" :size="32" />
      <div>
        <h3>{{ team.displayName ?? team.abbreviation }}</h3>
        <p>{{ players.length + didNotPlay.length }} игроков · минуты и box score</p>
      </div>
    </header>
    <div
      v-if="players.length"
      class="player-mobile-sort"
      role="group"
      aria-label="Сортировка игроков"
    >
      <span>Сортировать</span>
      <button
        v-for="sort in mobileSorts"
        :key="sort.key"
        type="button"
        :aria-label="`Сортировать по: ${sort.aria}`"
        :aria-pressed="sortBy === sort.key"
        @click="$emit('sort', sort.key)"
      >
        {{ sort.label
        }}<span v-if="sortBy === sort.key" aria-hidden="true">{{
          direction === 'ascending' ? '↑' : '↓'
        }}</span>
      </button>
    </div>
    <div v-if="players.length" class="player-box-table-scroll">
      <table class="player-box-table">
        <caption class="visually-hidden">
          Статистика игроков команды
          {{
            team.displayName ?? team.abbreviation
          }}
        </caption>
        <thead>
          <tr>
            <th
              v-for="column in columns"
              :key="column.aria"
              scope="col"
              :aria-sort="column.key && sortBy === column.key ? direction : 'none'"
            >
              <button
                v-if="column.key"
                type="button"
                class="player-sort"
                :title="`Сортировать: ${column.aria}`"
                @click="$emit('sort', column.key)"
              >
                {{ column.label
                }}<span aria-hidden="true">{{
                  sortBy === column.key ? (direction === 'ascending' ? '↑' : '↓') : '↕'
                }}</span></button
              ><span v-else>{{ column.label }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in players" :key="line.player.id">
            <th scope="row">
              <span class="player-name">{{
                line.player.displayName ?? `Игрок ${line.player.providerId}`
              }}</span><span v-if="line.starter" class="player-starter">СТАРТ</span>
            </th>
            <td>{{ line.minutes ?? '—' }}</td>
            <td>{{ value(line.points) }}</td>
            <td>{{ value(line.rebounds) }}</td>
            <td>{{ value(line.assists) }}</td>
            <td>{{ value(line.steals) }}</td>
            <td>{{ value(line.blocks) }}</td>
            <td>{{ value(line.turnovers) }}</td>
            <td>
              {{
                shooting(
                  line.fieldGoals.made,
                  line.fieldGoals.attempted,
                  line.fieldGoals.percentage,
                )
              }}
            </td>
            <td>
              {{
                shooting(
                  line.threePointers.made,
                  line.threePointers.attempted,
                  line.threePointers.percentage,
                )
              }}
            </td>
            <td>
              {{
                shooting(
                  line.freeThrows.made,
                  line.freeThrows.attempted,
                  line.freeThrows.percentage,
                )
              }}
            </td>
            <td>{{ value(line.fouls) }}</td>
            <td
              :class="{
                'player-plus-minus--positive': line.plusMinus !== null && line.plusMinus > 0,
                'player-plus-minus--negative': line.plusMinus !== null && line.plusMinus < 0,
              }"
            >
              {{
                line.plusMinus === null
                  ? '—'
                  : line.plusMinus > 0
                    ? `+${line.plusMinus}`
                    : line.plusMinus
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="player-box-unavailable">
      Статистика игроков этой команды в ответе источника отсутствует.
    </p>
    <details v-if="didNotPlay.length" class="player-dnp">
      <summary>
        Не играли <span>{{ didNotPlay.length }}</span>
      </summary>
      <ul>
        <li v-for="line in didNotPlay" :key="line.player.id">
          {{ line.player.displayName ?? `Игрок ${line.player.providerId}`
          }}<span>DNP · без игрового времени</span>
        </li>
      </ul>
    </details>
    <div v-if="players.length" class="player-mobile-list">
      <article v-for="line in players" :key="line.player.id" class="player-mobile-card">
        <header>
          <div>
            <strong>{{ line.player.displayName ?? `Игрок ${line.player.providerId}` }}</strong><span
              v-if="line.starter"
              >СТАРТ</span
            >
          </div>
          <span>{{ line.minutes ?? '—' }} мин</span>
        </header>
        <dl>
          <div>
            <dt>PTS</dt>
            <dd>{{ value(line.points) }}</dd>
          </div>
          <div>
            <dt>REB</dt>
            <dd>{{ value(line.rebounds) }}</dd>
          </div>
          <div>
            <dt>AST</dt>
            <dd>{{ value(line.assists) }}</dd>
          </div>
          <div>
            <dt>STL</dt>
            <dd>{{ value(line.steals) }}</dd>
          </div>
          <div>
            <dt>BLK</dt>
            <dd>{{ value(line.blocks) }}</dd>
          </div>
          <div>
            <dt>TO</dt>
            <dd>{{ value(line.turnovers) }}</dd>
          </div>
          <div>
            <dt>FG</dt>
            <dd>
              {{
                shooting(
                  line.fieldGoals.made,
                  line.fieldGoals.attempted,
                  line.fieldGoals.percentage,
                )
              }}
            </dd>
          </div>
          <div>
            <dt>3P</dt>
            <dd>
              {{
                shooting(
                  line.threePointers.made,
                  line.threePointers.attempted,
                  line.threePointers.percentage,
                )
              }}
            </dd>
          </div>
          <div>
            <dt>FT</dt>
            <dd>
              {{
                shooting(
                  line.freeThrows.made,
                  line.freeThrows.attempted,
                  line.freeThrows.percentage,
                )
              }}
            </dd>
          </div>
          <div>
            <dt>PF</dt>
            <dd>{{ value(line.fouls) }}</dd>
          </div>
          <div>
            <dt>+/−</dt>
            <dd>
              {{
                line.plusMinus === null
                  ? '—'
                  : line.plusMinus > 0
                    ? `+${line.plusMinus}`
                    : line.plusMinus
              }}
            </dd>
          </div>
        </dl>
      </article>
    </div>
    <details v-if="didNotPlay.length" class="player-dnp player-dnp--mobile">
      <summary>
        Не играли <span>{{ didNotPlay.length }}</span>
      </summary>
      <ul>
        <li v-for="line in didNotPlay" :key="line.player.id">
          {{ line.player.displayName ?? `Игрок ${line.player.providerId}`
          }}<span>DNP · без игрового времени</span>
        </li>
      </ul>
    </details>
  </section>
</template>
