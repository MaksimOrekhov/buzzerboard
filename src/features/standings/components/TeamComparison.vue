<script setup lang="ts">
import AppDialog from '@/shared/components/AppDialog.vue'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import type { StandingsRow } from '@/entities/nba/model'
import { formatRecord, formatPercentage, formatAverageMargin, formatLastTen } from '../formatters'
defineProps<{ rows: readonly StandingsRow[] }>()
const open = defineModel<boolean>('open', { required: true })
const metrics = [
  {
    label: 'Победы–поражения',
    value: (row: StandingsRow) => formatRecord(row.record.wins, row.record.losses),
  },
  {
    label: 'Процент побед · PCT',
    value: (row: StandingsRow) => formatPercentage(row.winPercentage),
  },
  {
    label: 'В конференции · В–П',
    value: (row: StandingsRow) =>
      formatRecord(row.record.conferenceWins, row.record.conferenceLosses),
  },
  {
    label: 'Дома · В–П',
    value: (row: StandingsRow) => formatRecord(row.record.homeWins, row.record.homeLosses),
  },
  {
    label: 'В гостях · В–П',
    value: (row: StandingsRow) => formatRecord(row.record.awayWins, row.record.awayLosses),
  },
  {
    label: 'Победы в последних 10',
    value: (row: StandingsRow) => formatLastTen(row.record.lastTenWins),
  },
  {
    label: 'Средняя разница очков',
    value: (row: StandingsRow) => formatAverageMargin(row.record.averageMargin),
  },
]
</script>
<template>
  <AppDialog
    v-model:open="open"
    title="Сравнение команд"
    description="Показатели текущего сезона. Тире означает, что данных нет."
    ><div class="comparison-scroll">
      <table class="comparison-table">
        <thead>
          <tr>
            <th scope="col"><span class="visually-hidden">Показатель</span></th>
            <th v-for="row in rows" :key="row.team.id" scope="col">
              <TeamLogo :team="row.team" :size="54" /><strong>{{
                row.team.displayName ?? row.team.abbreviation
              }}</strong
              ><span>{{ row.conference === 'east' ? 'Восток' : 'Запад' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="metric in metrics" :key="metric.label">
            <th scope="row">{{ metric.label }}</th>
            <td v-for="row in rows" :key="row.team.id">{{ metric.value(row) }}</td>
          </tr>
        </tbody>
      </table>
    </div></AppDialog
  >
</template>
