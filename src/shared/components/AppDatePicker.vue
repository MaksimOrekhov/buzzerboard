<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { parseDate, type DateValue } from '@internationalized/date'
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
  CalendarRoot,
  CalendarHeader,
  CalendarHeading,
  CalendarPrev,
  CalendarNext,
  CalendarGrid,
  CalendarGridHead,
  CalendarGridBody,
  CalendarGridRow,
  CalendarHeadCell,
  CalendarCell,
  CalendarCellTrigger,
} from 'reka-ui'
import AppIcon from '@/shared/components/AppIcon.vue'
const props = defineProps<{ min: string; max: string; compact?: boolean; short?: boolean }>()
const model = defineModel<string>({ required: true })
const open = shallowRef(false)
const value = computed(() => parseDate(model.value))
const label = computed(() =>
  new Intl.DateTimeFormat(
    'ru-RU',
    props.short
      ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
      : props.compact
        ? { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }
        : { month: 'long', year: 'numeric', timeZone: 'UTC' },
  ).format(new Date(`${model.value}T12:00:00Z`)),
)
function select(date: DateValue | undefined) {
  if (!date) return
  model.value = date.toString()
  open.value = false
}
</script>
<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger
      class="gc-control"
      :class="short ? 'gc-date-trigger--short' : 'gc-date-trigger'"
      aria-label="Выбрать игровую дату NBA"
      ><AppIcon name="calendar" :size="18" />{{ label
      }}<AppIcon v-if="!short" name="down" :size="15"
    /></PopoverTrigger>
    <PopoverPortal
      ><PopoverContent
        class="game-center-theme gc-popover gc-calendar-popover"
        :side-offset="10"
        align="start"
        :collision-padding="12"
        aria-label="Календарь матчей"
      >
        <CalendarRoot
          v-slot="{ grid, weekDays }"
          :model-value="value"
          :min-value="parseDate(props.min)"
          :max-value="parseDate(props.max)"
          locale="ru-RU"
          :week-starts-on="1"
          weekday-format="short"
          prevent-deselect
          initial-focus
          @update:model-value="select"
        >
          <CalendarHeader class="gc-calendar-header"
            ><CalendarPrev class="gc-icon-button" aria-label="Предыдущий месяц"
              ><AppIcon name="chevron-left" /></CalendarPrev
            ><CalendarHeading /><CalendarNext class="gc-icon-button" aria-label="Следующий месяц"
              ><AppIcon name="chevron-right" /></CalendarNext
          ></CalendarHeader>
          <CalendarGrid v-for="month in grid" :key="month.value.toString()" class="gc-calendar-grid"
            ><CalendarGridHead
              ><CalendarGridRow
                ><CalendarHeadCell v-for="day in weekDays" :key="day">{{
                  day
                }}</CalendarHeadCell></CalendarGridRow
              ></CalendarGridHead
            ><CalendarGridBody
              ><CalendarGridRow v-for="(week, index) in month.rows" :key="index"
                ><CalendarCell v-for="day in week" :key="day.toString()" :date="day"
                  ><CalendarCellTrigger
                    class="gc-calendar-day"
                    :day="day"
                    :month="month.value" /></CalendarCell></CalendarGridRow></CalendarGridBody
          ></CalendarGrid>
        </CalendarRoot>
        <p class="gc-calendar-note">
          Игровой день по Нью-Йорку (ET).<br />Время матчей — в вашем часовом поясе.
        </p>
      </PopoverContent></PopoverPortal
    >
  </PopoverRoot>
</template>
