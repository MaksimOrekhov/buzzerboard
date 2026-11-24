<script setup lang="ts">
import { computed } from 'vue'
import AppDatePicker from '@/shared/components/AppDatePicker.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import { VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'
import { shiftGameDate } from '../composables/useGameCenter'
const props = defineProps<{ date: string; today: string; min: string; max: string }>()
const emit = defineEmits<{ select: [date: string] }>()
const recentDates = computed(() => [
  { label: '−2 дня', value: shiftGameDate(props.today, -2) },
  { label: 'Вчера', value: shiftGameDate(props.today, -1) },
  { label: 'Сегодня', value: props.today },
])
</script>
<template>
  <section class="gc-date-panel" aria-label="Выбор игровой даты">
    <div class="gc-date-panel-top">
      <div class="gc-date-selector">
        <button
          class="gc-icon-button gc-date-step"
          aria-label="Предыдущий день"
          :disabled="date <= min"
          @click="emit('select', shiftGameDate(date, -1))"
        >
          <AppIcon name="chevron-left" :size="16" />
        </button>
        <AppDatePicker
          :model-value="date"
          :min="min"
          :max="max"
          compact
          @update:model-value="emit('select', $event)"
        />
        <button
          class="gc-icon-button gc-date-step"
          aria-label="Следующий день"
          :disabled="date >= max"
          @click="emit('select', shiftGameDate(date, 1))"
        >
          <AppIcon name="chevron-right" :size="16" />
        </button>
      </div>
      <AppSegmented
        class="gc-quick-dates"
        label="Недавние игровые даты"
        :model-value="date"
        :options="recentDates"
        @update:model-value="emit('select', $event)"
      />
      <span class="gc-date-hint"
        >Игровой день Нью-Йорка · ET <span aria-hidden="true">/</span> Время матчей ·
        {{ VIEWER_TIME_ZONE }}</span
      >
    </div>
  </section>
</template>
