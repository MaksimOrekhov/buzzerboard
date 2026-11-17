<script setup lang="ts">
import ResourceState from './ResourceState.vue'
import type { AppIconName } from '@/shared/icons'
withDefaults(
  defineProps<{ icon: AppIconName; title: string; description: string; eyebrow?: string }>(),
  { eyebrow: 'Скоро здесь' },
)
</script>
<template>
  <ResourceState
    status="empty"
    :icon="icon"
    :title="title"
    :description="description"
    :eyebrow="eyebrow"
    ><template #action><slot /></template
  ></ResourceState>
</template>
