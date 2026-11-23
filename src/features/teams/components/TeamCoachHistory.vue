<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { COACHING_DIRECTORY, type CoachingAssignment } from '@/entities/nba/coachingDirectory'
import CoachSource from './CoachSource.vue'

const props = defineProps<{ appointments: CoachingAssignment[]; stale: boolean }>()
const phase = shallowRef<'all' | 'current' | 'former'>('all')
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
      <label>
        Период
        <select v-model="phase" class="gc-control">
          <option value="all">Все назначения</option>
          <option value="current">
            {{ stale ? 'Последнее подтверждённое' : 'Текущее назначение' }}
          </option>
          <option value="former">Бывшие тренеры</option>
        </select>
      </label>
      <label v-if="hasInterim">
        Тип назначения
        <select v-model="appointmentType" class="gc-control">
          <option value="all">Все типы</option>
          <option value="permanent">Постоянные</option>
          <option value="interim">Временные</option>
        </select>
      </label>
      <label>
        Порядок
        <select v-model="order" class="gc-control">
          <option value="desc">Сначала новые</option>
          <option value="asc">Сначала ранние</option>
        </select>
      </label>
    </div>
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
    <p v-else role="status" class="coach-muted">
      В этой выборке пока нет подтверждённых назначений.
    </p>
  </section>
</template>
