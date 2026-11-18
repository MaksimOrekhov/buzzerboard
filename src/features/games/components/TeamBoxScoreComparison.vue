<script setup lang="ts">
import type { ShootingLine, Team, TeamBoxScore } from '@/entities/nba/model'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import StatValue from '@/shared/components/StatValue.vue'
import { formatAdvancedStat, teamBoxScoreAdvanced } from '@/entities/nba/advancedStats'
import type { AdvancedMetric } from '@/entities/nba/advancedStats'

defineProps<{ teams: readonly (TeamBoxScore | null)[]; matchTeams: readonly Team[] }>()
const metrics = [
  ['points', 'Очки'],
  ['fieldGoals', 'С игры'],
  ['threePointers', 'Трёхочковые'],
  ['freeThrows', 'Штрафные'],
  ['rebounds', 'Подборы'],
  ['offensiveRebounds', 'В атаке'],
  ['defensiveRebounds', 'В защите'],
  ['assists', 'Передачи'],
  ['steals', 'Перехваты'],
  ['blocks', 'Блок-шоты'],
  ['turnovers', 'Потери'],
  ['fouls', 'Фолы'],
  ['plusMinus', '+/−'],
] as const
type Metric = (typeof metrics)[number][0]
const advancedMetrics = [
  ['ts', 'TS%', 'Истинная точность: PTS / (2 × (FGA + 0,44 × FTA))'],
  ['efg', 'eFG%', 'Эффективность бросков с игры: (FGM + 0,5 × 3PM) / FGA'],
  ['astTo', 'AST/TO', 'Передачи к потерям: AST / TOV; при нуле потерь не определено'],
  ['threeRate', '3PAr', 'Доля трёхочковых попыток: 3PA / FGA'],
  ['freeThrowRate', 'FTr', 'Штрафные попытки к броскам с игры: FTA / FGA'],
] as const satisfies readonly [Exclude<AdvancedMetric, 'gmSc' | 'twoPoint'>, string, string][]
function rate(value: number | ShootingLine | null) {
  return typeof value === 'object' && value !== null ? value.percentage : value
}
function values(teams: readonly (TeamBoxScore | null)[], metric: Metric) {
  const pair = teams.map((team) => team?.[metric] ?? null)
  const rates = pair.map(rate)
  return pair.map((value, index) => {
    const current = rates[index] ?? null
    const other = rates[1 - index] ?? null
    const top = Math.max(current ?? 0, other ?? 0)
    const isShooting = typeof value === 'object' && value !== null
    return {
      score: isShooting ? (current === null ? null : (100 * current).toFixed(1) + '%') : current,
      shots:
        isShooting && value.made !== null && value.attempted !== null
          ? value.made + '/' + value.attempted
          : null,
      bar:
        current !== null &&
        other !== null &&
        current >= 0 &&
        other >= 0 &&
        top > 0 &&
        metric !== 'plusMinus'
          ? (100 * current) / (isShooting ? 1 : top)
          : null,
    }
  })
}
function advancedValues(
  teams: readonly (TeamBoxScore | null)[],
  metric: (typeof advancedMetrics)[number][0],
) {
  return teams.map((team) => formatAdvancedStat(metric, teamBoxScoreAdvanced(team, metric)))
}
</script>

<template>
  <section class="game-detail-panel" aria-labelledby="team-box-score-heading">
    <header class="game-detail-section-heading">
      <div>
        <span>01 / КОМАНДЫ</span>
        <h2 id="team-box-score-heading">Сравнение команд</h2>
      </div>
      <p>Попадания/попытки и процент для бросков</p>
    </header>
    <div class="team-box-score-wrap">
      <table class="team-box-score">
        <thead>
          <tr>
            <template v-for="(team, index) in matchTeams" :key="team.id">
              <th v-if="index === 1" scope="col">Показатель</th>
              <th scope="col" :class="'comparison-side-' + index">
                <div class="team-box-score-name">
                  <TeamLogo :team="team" :size="28" />
                  <span>{{ team.abbreviation ?? team.displayName }}</span>
                </div>
              </th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr v-for="[metric, label] in metrics" :key="metric">
            <template v-for="(stat, index) in values(teams, metric)" :key="index">
              <th v-if="index === 1" scope="row">{{ label }}</th>
              <td :class="'comparison-side-' + index">
                <div class="comparison-value">
                  <StatValue :value="stat.score" /><small v-if="stat.shots">{{ stat.shots }}</small>
                </div>
                <div v-if="stat.bar !== null" class="comparison-track" aria-hidden="true">
                  <span :style="{ width: stat.bar + '%' }"></span>
                </div>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
    <details class="team-advanced-stats">
      <summary>Расширенное сравнение команд · один матч</summary>
      <p>Расчёт по подтверждённым итогам box score. Значения не являются сезонными рейтингами.</p>
      <div class="team-box-score-wrap">
        <table class="team-box-score">
          <thead>
            <tr>
              <th scope="col">Показатель</th>
              <th v-for="team in matchTeams" :key="team.id" scope="col">
                {{ team.abbreviation ?? team.displayName }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="[metric, label, description] in advancedMetrics" :key="metric">
              <th scope="row" :title="description">{{ label }}</th>
              <td v-for="(value, index) in advancedValues(teams, metric)" :key="index">
                <StatValue :value="value" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>
