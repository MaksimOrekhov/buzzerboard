<script setup lang="ts">
import AppButton from '@/shared/components/AppButton.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import { useSpoilerMode } from './useSpoilerMode'

defineProps<{ scope: string; title: string }>()
const { revealAggregate } = useSpoilerMode()
</script>

<template>
  <div class="spoiler-gate">
    <AppIcon class="spoiler-mark" name="eye-off" :size="20" />
    <div>
      <strong>{{ title }}</strong>
      <p>Здесь могут быть спойлеры свежих матчей.</p>
    </div>
    <AppButton @click="revealAggregate(scope)">Показать статистику</AppButton>
  </div>
</template>

<style scoped>
.spoiler-gate {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px;
  margin-block: 12px;
  border: 1px solid var(--gc-line);
  border-radius: 12px;
  background: var(--gc-sidebar);
  color: var(--gc-secondary);
}
.spoiler-gate > div {
  flex: 1 1 180px;
}
.spoiler-gate strong {
  color: var(--gc-text);
}
.spoiler-gate p {
  margin: 4px 0 0;
  font-size: 12px;
}
.spoiler-mark {
  color: var(--gc-accent);
}
</style>
