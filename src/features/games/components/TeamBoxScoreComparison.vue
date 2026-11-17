<script setup lang="ts">
import type { ShootingLine, TeamBoxScore } from '@/entities/nba/model'
import TeamLogo from '@/shared/components/TeamLogo.vue'

defineProps<{ teams: readonly TeamBoxScore[] }>()

function display(value: number | null, decimals = 0) {
  return value === null ? '—' : value.toFixed(decimals)
}
function shots(value: ShootingLine) {
  const total =
    value.made === null || value.attempted === null ? '—' : `${value.made}/${value.attempted}`
  return `${total}${value.percentage === null ? '' : ` · ${(value.percentage * 100).toFixed(1)}%`}`
}

const metrics = [
  { key: 'points', label: 'Очки', format: (team: TeamBoxScore) => display(team.points) },
  {
    key: 'fieldGoals',
    label: 'Броски с игры',
    format: (team: TeamBoxScore) => shots(team.fieldGoals),
  },
  {
    key: 'threePointers',
    label: 'Трёхочковые',
    format: (team: TeamBoxScore) => shots(team.threePointers),
  },
  { key: 'freeThrows', label: 'Штрафные', format: (team: TeamBoxScore) => shots(team.freeThrows) },
  { key: 'rebounds', label: 'Подборы', format: (team: TeamBoxScore) => display(team.rebounds) },
  {
    key: 'offensiveRebounds',
    label: 'В атаке',
    format: (team: TeamBoxScore) => display(team.offensiveRebounds),
  },
  {
    key: 'defensiveRebounds',
    label: 'В защите',
    format: (team: TeamBoxScore) => display(team.defensiveRebounds),
  },
  { key: 'assists', label: 'Передачи', format: (team: TeamBoxScore) => display(team.assists) },
  { key: 'steals', label: 'Перехваты', format: (team: TeamBoxScore) => display(team.steals) },
  { key: 'blocks', label: 'Блок-шоты', format: (team: TeamBoxScore) => display(team.blocks) },
  { key: 'turnovers', label: 'Потери', format: (team: TeamBoxScore) => display(team.turnovers) },
  { key: 'fouls', label: 'Фолы', format: (team: TeamBoxScore) => display(team.fouls) },
  { key: 'plusMinus', label: '+/−', format: (team: TeamBoxScore) => display(team.plusMinus, 0) },
]
</script>

<template>
  <section class="game-detail-panel" aria-labelledby="team-box-score-heading">
    <header class="game-detail-section-heading">
      <div>
        <span>01 / КОМАНДЫ</span>
        <h2 id="team-box-score-heading">Сравнение команд</h2>
      </div>
      <p>Только показатели из box score</p>
    </header>
    <div class="team-box-score-wrap">
      <table class="team-box-score">
        <thead>
          <tr>
            <th scope="col">Показатель</th>
            <th v-for="team in teams" :key="team.team.id" scope="col">
              <div class="team-box-score-name">
                <TeamLogo :team="team.team" :size="24" /><span>{{
                  team.team.abbreviation ?? team.team.displayName
                }}</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="metric in metrics" :key="metric.key">
            <th scope="row">{{ metric.label }}</th>
            <td v-for="team in teams" :key="team.team.id">{{ metric.format(team) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
