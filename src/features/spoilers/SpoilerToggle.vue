<script setup lang="ts">
import AppButton from '@/shared/components/AppButton.vue'
import { useSpoilerMode } from './useSpoilerMode'

const { enabled, toggle } = useSpoilerMode()
</script>

<template>
  <AppButton
    class="spoiler-toggle"
    :class="{ 'ui-selected': enabled }"
    :icon="enabled ? 'eye-off' : 'eye'"
    :aria-pressed="enabled"
    title="Без спойлеров"
    @click="toggle"
  >
    Без спойлеров
  </AppButton>
</template>

<style scoped>
.spoiler-toggle {
  min-height: 44px;
  padding-inline: 12px;
  white-space: nowrap;
  font-size: 12px;
}
@media (max-width: 360px) {
  .spoiler-toggle {
    padding-inline: 8px;
    gap: 5px;
  }
}
</style>
