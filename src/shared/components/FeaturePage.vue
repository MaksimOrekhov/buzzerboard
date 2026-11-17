<script setup lang="ts">
import PageHeading from './PageHeading.vue'
import ResourceState from './ResourceState.vue'
import type { AppIconName } from '@/shared/icons'

defineProps<{
  eyebrow: string
  title: string
  description: string
  icon: AppIconName
  emptyTitle: string
  emptyDescription: string
}>()
</script>

<template>
  <div class="feature-page">
    <PageHeading :eyebrow="eyebrow" :title="title" :description="description" />
    <ResourceState
      status="empty"
      :icon="icon"
      :title="emptyTitle"
      :description="emptyDescription"
    />
  </div>
</template>

<style scoped>
.feature-page {
  width: 100%;
  animation: feature-arrive 300ms ease both;
}

@keyframes feature-arrive {
  from {
    transform: translateY(0.3rem);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .feature-page {
    animation: none;
  }
}
</style>
