<script setup lang="ts">
import { RouterLink } from 'vue-router'

import AppIcon from '@/shared/components/AppIcon.vue'
import EmptyState from '@/shared/components/EmptyState.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
</script>

<template>
  <div class="not-found-view">
    <PageHeading
      eyebrow="Out of bounds"
      title="That page isn't in play."
      description="The address may have changed, or the page may not exist yet."
    />
    <EmptyState
      icon="basketball"
      eyebrow="Back to the court"
      title="Find your way back to the hub."
      description="Head home to find the BuzzerBoard sections that are ready to explore."
    />
    <RouterLink class="home-link focus-ring" to="/">
      <AppIcon name="arrow-up-right" :size="17" />
      Back to home
    </RouterLink>
  </div>
</template>

<style scoped>
.home-link {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 1.3rem;
  border: 1px solid rgb(255 112 72 / 32%);
  border-radius: 0.75rem;
  background: rgb(255 112 72 / 8%);
  padding: 0.65rem 0.85rem;
  color: #ffd4c7;
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
}

.home-link:hover {
  background: rgb(255 112 72 / 15%);
}
</style>
