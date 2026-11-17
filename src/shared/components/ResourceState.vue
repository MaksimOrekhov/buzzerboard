<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import SnapshotStatus from './SnapshotStatus.vue'
import type { NbaApiError } from '@/entities/nba/model'
import type { NbaApiSnapshot } from '@/shared/api/nba/contracts'
import type { AppIconName } from '@/shared/icons'
withDefaults(
  defineProps<{
    status: 'loading' | 'error' | 'empty' | 'ready'
    icon?: AppIconName
    title?: string
    description?: string
    error?: NbaApiError | null
    meta?: NbaApiSnapshot<unknown>['meta'] | null
    compact?: boolean
    eyebrow?: string
  }>(),
  {
    icon: 'basketball',
    title: 'Данных пока нет',
    description: '',
    error: null,
    meta: null,
    compact: false,
    eyebrow: '',
  },
)
</script>
<template>
  <div class="resource-state-wrap" :class="{ 'ui-state--compact': compact }">
    <div v-if="status === 'loading'" class="gc-skeleton-list state-card--loading" aria-busy="true">
      <span class="visually-hidden">Загрузка данных</span>
      <div v-for="n in compact ? 3 : 6" :key="n" class="gc-skeleton-row">
        <span /><span /><span />
      </div>
    </div>
    <section
      v-else-if="status !== 'ready'"
      class="gc-state"
      :role="status === 'error' ? 'alert' : undefined"
    >
      <AppIcon :name="icon" :size="32" />
      <p v-if="eyebrow" class="ui-state-eyebrow">{{ eyebrow }}</p>
      <h2>{{ title }}</h2>
      <p>{{ description || error?.message || 'Информация появится позже.' }}</p>
      <slot name="action" />
    </section>
    <div v-else class="ready-content"><slot /></div>
    <SnapshotStatus v-if="meta" :meta="meta" />
  </div>
</template>
