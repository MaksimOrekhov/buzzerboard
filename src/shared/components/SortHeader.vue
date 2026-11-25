<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import AppTooltip from './AppTooltip.vue'
import type { StandingsSortKey, SortDirection } from '@/features/standings/standingsModel'
const props = defineProps<{
  field: StandingsSortKey
  label: string
  description: string
  sortBy: StandingsSortKey
  direction: SortDirection
  disabled?: boolean
  describedBy?: string | null
}>()
defineEmits<{ sort: [field: StandingsSortKey] }>()
</script>
<template>
  <th
    scope="col"
    :aria-sort="props.sortBy === field ? direction : undefined"
    :class="{ 'ui-sorted-column': sortBy === field }"
  >
    <AppTooltip :text="description"
      ><button
        class="sort-button"
        type="button"
        :disabled="disabled"
        :aria-describedby="describedBy ?? undefined"
        :aria-label="`Сортировать по полю «${description}»${sortBy === field ? `, сейчас ${direction === 'ascending' ? 'по возрастанию' : 'по убыванию'}` : ''}`"
        @click="$emit('sort', field)"
      >
        {{ label
        }}<AppIcon
          :name="sortBy === field ? 'down' : 'sort'"
          :size="12"
          :class="{ 'ui-sort-ascending': sortBy === field && direction === 'ascending' }"
        /></button
    ></AppTooltip>
  </th>
</template>
