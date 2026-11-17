<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import AppBadge from '@/shared/components/AppBadge.vue'
import AppButton from '@/shared/components/AppButton.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import type { NbaGameDate } from '@/entities/nba/model'
import { getDefaultNbaGameDate } from '@/shared/utils/nbaDate'

const today = getDefaultNbaGameDate() as NbaGameDate
const selectedDate = shallowRef<NbaGameDate>(today)

const isToday = computed(() => selectedDate.value === today)
const displayDate = computed(() =>
  new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${selectedDate.value}T12:00:00.000Z`)),
)

function shiftDate(days: number): void {
  const date = new Date(`${selectedDate.value}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  selectedDate.value = date.toISOString().slice(0, 10) as NbaGameDate
}
</script>

<template>
  <div class="games-view">
    <PageHeading
      eyebrow="Расписание и результаты"
      title="Матчи"
      description="Сверяйтесь с календарём лиги и возвращайтесь к ключевым моментам сезона."
    />

    <section class="games-toolbar" aria-label="Выбор игровой даты">
      <div class="selected-date">
        <span class="date-icon"><AppIcon name="calendar" :size="18" /></span>
        <div>
          <p class="eyebrow">Дата NBA · US/Eastern</p>
          <p class="date-label">{{ displayDate }}</p>
        </div>
      </div>

      <div class="date-controls">
        <AppButton
          variant="secondary"
          icon="chevron-left"
          icon-only
          :aria-label="`Предыдущая дата после ${displayDate}`"
          @click="shiftDate(-1)"
        />
        <AppButton v-if="!isToday" variant="ghost" @click="selectedDate = today">
          Сегодня
        </AppButton>
        <AppButton
          variant="secondary"
          icon="chevron-right"
          icon-only
          :aria-label="`Следующая дата после ${displayDate}`"
          @click="shiftDate(1)"
        />
      </div>
    </section>

    <section class="games-section" aria-labelledby="games-section-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">{{ isToday ? 'Сегодня' : 'Выбранная дата' }}</p>
          <h2 id="games-section-title">Игры на площадке</h2>
        </div>
        <AppBadge tone="warning" dot>Источник не подключён</AppBadge>
      </div>

      <ResourceState
        status="empty"
        icon="basketball"
        title="Матчи появятся после подключения данных"
        description="Покажем расписание, точное время начала и счёт только из проверенного кеша. Пока здесь нет подтверждённых данных по выбранной дате."
      />
    </section>

    <p class="games-footnote">
      <AppIcon name="database" :size="15" />
      Смена даты не запускает платные запросы к источникам данных.
    </p>
  </div>
</template>

<style scoped>
.games-view {
  display: grid;
  gap: 0;
}

.games-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: linear-gradient(145deg, rgb(255 255 255 / 3%), rgb(255 255 255 / 1%));
  padding: 1rem 1.1rem;
}

.selected-date {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}

.date-icon {
  display: grid;
  width: 2.65rem;
  height: 2.65rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(217 236 121 / 22%);
  border-radius: 0.8rem;
  background: var(--lime-soft);
  color: var(--lime);
}

.date-label {
  margin: 0.25rem 0 0;
  color: var(--ink);
  font-size: 0.89rem;
  font-weight: 690;
  text-transform: capitalize;
}

.date-controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.games-section {
  margin-top: 2.1rem;
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.8rem;
}

.section-heading h2 {
  margin: 0.4rem 0 0;
  color: var(--ink);
  font-size: clamp(1.35rem, 2.5vw, 1.8rem);
  font-weight: 720;
  letter-spacing: -0.05em;
}

.games-footnote {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 1rem 0 0;
  color: var(--subtle);
  font-size: var(--font-size-caption);
  line-height: 1.5;
}

.games-footnote :deep(svg) {
  flex: 0 0 auto;
  color: var(--muted);
}

@media (max-width: 560px) {
  .games-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .date-controls {
    width: 100%;
    justify-content: flex-end;
  }

  .section-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.6rem;
  }
}
</style>
