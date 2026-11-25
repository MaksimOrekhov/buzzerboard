<script setup lang="ts">
import AppButton from '@/shared/components/AppButton.vue'
import AppSearch from '@/shared/components/AppSearch.vue'
import AppSelect from '@/shared/components/AppSelect.vue'
import type { StandingsSortKey, SortDirection } from '../standingsModel'

defineProps<{
  direction: SortDirection
  options: readonly {
    value: StandingsSortKey
    label: string
    shortLabel: string
    disabled?: boolean
  }[]
}>()
const search = defineModel<string>('search', { required: true })
const sort = defineModel<StandingsSortKey>('sort', { required: true })
const favoriteOnly = defineModel<boolean>('favoriteOnly', { required: true })
defineEmits<{ reverse: [] }>()
</script>

<template>
  <div class="standings-filters">
    <AppSearch v-model="search" label="Поиск команды в таблице" />
    <AppSelect v-model="sort" label="Сортировка турнирной таблицы" :options="options" />
    <AppButton
      :icon="direction === 'descending' ? 'down' : 'up'"
      icon-only
      :aria-label="`Порядок сортировки: ${direction === 'descending' ? 'по убыванию' : 'по возрастанию'}`"
      @click="$emit('reverse')"
    />
    <AppButton
      icon="star"
      aria-label="Избранные"
      :aria-pressed="favoriteOnly"
      :class="{ 'ui-selected': favoriteOnly }"
      @click="favoriteOnly = !favoriteOnly"
      ><span class="standings-favorites-label">Избранные</span></AppButton
    >
  </div>
</template>
