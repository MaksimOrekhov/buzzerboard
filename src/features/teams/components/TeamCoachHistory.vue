<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { COACHING_DIRECTORY, type CoachingAssignment } from '@/entities/nba/coachingDirectory'
import AppSelect from '@/shared/components/AppSelect.vue'
import CoachSource from './CoachSource.vue'

const props = defineProps<{ appointments: CoachingAssignment[]; stale: boolean }>()
type Phase = 'all' | 'current' | 'former'
const phase = shallowRef<Phase>('all')
const phases = computed<readonly { value: Phase; label: string }[]>(() => [
  { value: 'all', label: 'Все назначения' },
  { value: 'current', label: props.stale ? 'Последнее подтверждённое' : 'Текущее назначение' },
  { value: 'former', label: 'Бывшие тренеры' },
])
const types = [
  { value: 'all', label: 'Все типы' },
  { value: 'permanent', label: 'Постоянные' },
  { value: 'interim', label: 'Временные' },
] as const
const orders = [
  { value: 'desc', label: 'Сначала новые' },
  { value: 'asc', label: 'Сначала ранние' },
] as const
const appointmentType = shallowRef<'all' | CoachingAssignment['status']>('all')
const order = shallowRef<'desc' | 'asc'>('desc')
const hasInterim = computed(() => props.appointments.some(({ status }) => status === 'interim'))
const visible = computed(() =>
  props.appointments
    .filter(
      (item) =>
        (phase.value === 'all' || item.phase === phase.value) &&
        (appointmentType.value === 'all' || item.status === appointmentType.value),
    )
    .sort((a, b) => {
      const firstDate = a.validFrom ?? a.validUntil ?? a.season
      const secondDate = b.validFrom ?? b.validUntil ?? b.season
      if (!firstDate || !secondDate) return Number(!firstDate) - Number(!secondDate)
      return order.value === 'desc'
        ? secondDate.localeCompare(firstDate)
        : firstDate.localeCompare(secondDate)
    }),
)
</script>

<template>
  <section class="coach-card" aria-labelledby="coach-history-heading">
    <header>
      <h3 id="coach-history-heading">История назначений</h3>
      <p class="coach-muted">Подборка подтверждённых назначений.</p>
    </header>
    <div class="coach-controls">
      <div class="gc-select-field">
        <AppSelect v-model="phase" label="Период" :options="phases" show-label />
      </div>
      <div v-if="hasInterim" class="gc-select-field">
        <AppSelect v-model="appointmentType" label="Тип назначения" :options="types" show-label />
      </div>
      <div class="gc-select-field">
        <AppSelect v-model="order" label="Порядок" :options="orders" show-label />
      </div>
    </div>
    <p class="visually-hidden" role="status">Назначений в выборке: {{ visible.length }}</p>
    <ol v-if="visible.length" class="coach-timeline">
      <li v-for="item in visible" :key="`${item.personId}/${item.status}/${item.validFrom}`">
        <p class="coach-timeline-year">
          {{ (item.validFrom ?? item.validUntil)?.slice(0, 4) ?? '—' }}
        </p>
        <div>
          <p class="coach-muted">
            {{
              item.phase === 'former'
                ? 'Бывший тренер'
                : stale
                  ? 'Последнее подтверждённое назначение'
                  : 'Действующий тренер'
            }}
            · {{ item.status === 'interim' ? 'Временное назначение' : 'Постоянное назначение' }}
          </p>
          <h4>{{ COACHING_DIRECTORY.people[item.personId]?.name }}</h4>
          <div class="coach-links">
            <span v-if="item.validFrom"
              >С <time :datetime="item.validFrom">{{ item.validFrom }}</time></span
            >
            <span v-else>Дата назначения неизвестна</span>
            <span v-if="item.season">Сезон {{ item.season }}</span>
            <span v-if="item.validUntil"
              >До <time :datetime="item.validUntil">{{ item.validUntil }}</time></span
            >
            <span v-else-if="item.phase === 'former'">Дата ухода неизвестна</span>
          </div>
          <div class="coach-links">
            <CoachSource :source-id="item.source" />
            <CoachSource
              v-if="item.startSource && item.startSource !== item.source"
              :source-id="item.startSource"
              >Назначение</CoachSource
            >
            <CoachSource
              v-if="item.endSource && item.endSource !== item.source"
              :source-id="item.endSource"
              >Завершение работы</CoachSource
            >
          </div>
        </div>
      </li>
    </ol>
    <p v-else class="coach-muted">В этой выборке пока нет подтверждённых назначений.</p>
  </section>
</template>
