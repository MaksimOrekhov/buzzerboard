<script setup lang="ts">
import AppButton from '@/shared/components/AppButton.vue'
import { useSpoilerMode } from './useSpoilerMode'
import type { GameIdentity } from './spoilerVisibility'

defineProps<{ game: GameIdentity }>()
const { revealGame } = useSpoilerMode()
</script>

<template>
  <div class="spoiler-game-reveal">
    <span>Результат скрыт</span>
    <AppButton v-if="game.id" variant="ghost" @click="revealGame(game)"
      >Показать результат</AppButton
    >
  </div>
</template>

<style scoped>
.spoiler-game-reveal {
  display: grid;
  min-width: 0;
  justify-items: center;
  gap: 3px;
  color: var(--gc-secondary);
  font-size: 12px;
  text-align: center;
}
.spoiler-game-reveal .ui-button {
  min-height: 36px;
  min-width: 0;
  max-width: 100%;
  white-space: normal;
  padding: 4px 8px;
  color: var(--gc-accent);
  font-size: 12px;
}
</style>
