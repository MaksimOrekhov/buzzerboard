<script setup lang="ts">
import { formatPlayerStat, type PlayerStats } from '@/entities/nba/players'
import StatValue from '@/shared/components/StatValue.vue'

defineProps<{ stats: PlayerStats }>()

const headlines = [
  ['pts', 'PTS', 'Очки'],
  ['reb', 'REB', 'Подборы'],
  ['ast', 'AST', 'Передачи'],
] as const
const shots = [
  ['fg', 'FG%', 'С игры', 'fgm', 'fga'],
  ['three', '3P%', 'Трёхочковые', 'threeM', 'threeA'],
  ['ft', 'FT%', 'Штрафные', 'ftm', 'fta'],
] as const
</script>

<template>
  <div class="pa-summary-grid">
    <section class="player-panel pa-primary" aria-labelledby="player-primary">
      <h2 id="player-primary">Средние за матч</h2>
      <dl class="pa-headlines">
        <div v-for="[key, code, label] in headlines" :key="key">
          <dt>
            <span>{{ code }}</span> {{ label }}
          </dt>
          <dd><StatValue :value="formatPlayerStat(key, stats[key])" /></dd>
        </div>
      </dl>
      <p class="pa-sample player-meta">
        <span><StatValue :value="formatPlayerStat('gp', stats.gp)" /> матчей · GP</span>
        <span><StatValue :value="formatPlayerStat('min', stats.min)" /> мин за матч</span>
      </p>
    </section>
    <section class="player-panel pa-shooting" aria-labelledby="player-shooting">
      <div class="pa-panel-heading">
        <h2 id="player-shooting">Броски</h2>
        <span class="player-meta">Поп. / попытки</span>
      </div>
      <dl class="pa-shots">
        <div v-for="[key, code, label, made, attempts] in shots" :key="key">
          <dt>
            <span>{{ code }}</span> {{ label }}
          </dt>
          <dd class="pa-shot-track" aria-hidden="true">
            <span v-if="stats[key] !== null" :style="{ width: `${stats[key] * 100}%` }" />
          </dd>
          <dd class="pa-shot-volume">
            {{ formatPlayerStat(made, stats[made]) }} /
            {{ formatPlayerStat(attempts, stats[attempts]) }}
          </dd>
          <dd><StatValue :value="formatPlayerStat(key, stats[key])" /></dd>
        </div>
      </dl>
    </section>
  </div>
</template>
