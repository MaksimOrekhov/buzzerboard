<script setup lang="ts">
import { computed } from 'vue'
import AppDatePicker from '@/shared/components/AppDatePicker.vue'
import { shiftNbaGameDate } from '@/shared/utils/nbaDate'

const props = defineProps<{ date: string; today: string; min: string; max: string }>()
const emit = defineEmits<{ select: [date: string] }>()
const format = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const relativeDays = computed(() =>
  [-1, 0, 1].map((offset, index) => {
    const date = shiftNbaGameDate(props.date, offset)
    const time = format.format(new Date(`${date}T12:00:00Z`))
    return {
      date,
      time,
      disabled: date < props.min || date > props.max,
      label:
        date === props.today
          ? 'Сегодня'
          : props.date === props.today
            ? ['Вчера', 'Сегодня', 'Завтра'][index]
            : ['Пред. день', 'Выбрано', 'След. день'][index],
    }
  }),
)
</script>

<template>
  <div class="home-dates">
    <div class="ui-segmented home-date-segments" role="group" aria-label="Игровые дни NBA">
      <button
        v-for="day in relativeDays"
        :key="day.date"
        type="button"
        :disabled="day.disabled"
        :aria-pressed="day.date === date"
        @click="emit('select', day.date)"
      >
        {{ day.label }}<span>{{ day.time }}</span>
      </button>
    </div>
    <AppDatePicker
      :model-value="date"
      :min="min"
      :max="max"
      short
      @update:model-value="emit('select', $event)"
    />
  </div>
</template>
