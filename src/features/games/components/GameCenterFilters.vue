<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import type { GameStatus } from '@/entities/nba/model'
import AppIcon from '@/shared/components/AppIcon.vue'
import AppSearch from '@/shared/components/AppSearch.vue'
import AppSelect from '@/shared/components/AppSelect.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
const props = defineProps<{
  tabs: { value: GameStatus | 'all'; label: string; count: number }[]
  teamOptions: { value: string; label: string }[]
  showStatus: boolean
  activeCount: number
}>()
const emit = defineEmits<{ reset: [] }>()
const status = defineModel<GameStatus | 'all'>('status', { required: true })
const team = defineModel<string>('team', { required: true })
const search = defineModel<string>('search', { required: true })
const favorite = defineModel<boolean>('favorite', { required: true })
const sort = defineModel<string>('sort', { required: true })
const open = shallowRef(false)
const toggleLabel = computed(() =>
  props.activeCount ? `Фильтры: активно ${props.activeCount}` : 'Фильтры',
)
</script>
<template>
  <div class="gc-filter-controls">
    <button
      class="gc-control gc-filter-toggle"
      :aria-expanded="open"
      aria-controls="game-center-filters"
      :aria-label="toggleLabel"
      @click="open = !open"
    >
      <AppIcon name="sort" :size="16" /> Фильтры
      <span v-if="activeCount" class="gc-filter-count">{{ activeCount }}</span>
    </button>
    <AppSegmented
      v-if="showStatus"
      v-model="status"
      variant="underline"
      label="Статус матчей"
      :options="tabs"
    />
    <div v-show="open" id="game-center-filters" class="gc-filter-panel" aria-label="Фильтры матчей">
      <div class="gc-filter-field gc-filter-search">
        <span>Поиск команды</span
        ><AppSearch v-model="search" label="Поиск команды" placeholder="Найти команду" />
      </div>
      <div class="gc-filter-field">
        <span>Команда</span
        ><AppSelect v-model="team" label="Фильтр по команде" :options="teamOptions" />
      </div>
      <div class="gc-filter-field">
        <span>Порядок</span
        ><AppSelect
          v-model="sort"
          label="Порядок матчей"
          :options="[
            { value: 'asc', label: 'Сначала ранние' },
            { value: 'desc', label: 'Сначала поздние' },
          ]"
        />
      </div>
      <button
        class="gc-control gc-favorites-filter"
        :aria-pressed="favorite"
        @click="favorite = !favorite"
      >
        <AppIcon name="star" :size="17" /> Только избранные
      </button>
      <button class="gc-control gc-filter-reset" @click="emit('reset')">Сбросить фильтры</button>
    </div>
  </div>
</template>
