<script setup lang="ts">
import { computed } from 'vue'
import { calculateCoachRecord, type CoachGameWindow } from '@/entities/nba/coachAnalytics'
import { COACHING_DIRECTORY, type CoachingAssignment } from '@/entities/nba/coachingDirectory'
import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'

const props = defineProps<{ appointment: CoachingAssignment; gameWindow: CoachGameWindow | null }>()
const { enabled } = useSpoilerMode()
const record = computed(() =>
  enabled.value
    ? null
    : calculateCoachRecord(
        props.appointment,
        props.gameWindow,
        COACHING_DIRECTORY.sources[props.appointment.source]?.asOf ?? '',
      ),
)
const percentage = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 })
</script>

<template>
  <section class="coach-card coach-analytics" aria-labelledby="coach-analytics-heading">
    <h3 id="coach-analytics-heading">Результаты за период</h3>
    <p v-if="enabled" class="coach-muted">Результаты скрыты режимом «Без спойлеров».</p>
    <template v-else-if="record">
      <p>
        Матчи регулярного сезона с {{ record.from }} по {{ record.through }} · GP {{ record.gp }}
      </p>
      <dl class="coach-stats">
        <div>
          <dt>Победы — поражения</dt>
          <dd>{{ record.wins }}–{{ record.losses }}</dd>
        </div>
        <div>
          <dt>Доля побед</dt>
          <dd>{{ percentage.format(record.winRate) }}</dd>
        </div>
        <div>
          <dt>Дома</dt>
          <dd>{{ record.home.wins }}–{{ record.home.losses }}</dd>
        </div>
        <div>
          <dt>В гостях</dt>
          <dd>{{ record.away.wins }}–{{ record.away.losses }}</dd>
        </div>
      </dl>
      <dl v-if="record.months.length > 1" class="coach-stats" aria-label="Разбивка по месяцам">
        <div v-for="[month, split] in record.months" :key="month">
          <dt>{{ month }}</dt>
          <dd>{{ split.wins }}–{{ split.losses }}</dd>
        </div>
      </dl>
      <p class="coach-muted">Результаты команды за указанный период работы тренера.</p>
      <a :href="record.scheduleUrl" class="coach-source" target="_blank" rel="noopener noreferrer"
        >Расписание для сверки</a
      >
    </template>
    <p v-else class="coach-muted">
      Для расчёта нужен подтверждённый период работы тренера и полный набор финальных матчей из кэша
      за этот период.
    </p>
  </section>
</template>
