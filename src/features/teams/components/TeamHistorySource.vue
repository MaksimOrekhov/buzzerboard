<script setup lang="ts">
import { computed } from 'vue'
import { TEAM_HISTORY_SOURCES } from '@/entities/nba/teamHistory'

const props = defineProps<{
  sourceId?: string
  sourceUrl?: string
  asOf?: string
  context?: string
}>()
const citation = computed(() => (props.sourceId ? TEAM_HISTORY_SOURCES[props.sourceId] : null))
</script>

<template>
  <a
    class="team-history-source team-history-citation"
    :href="citation?.url ?? sourceUrl"
    target="_blank"
    rel="noopener noreferrer"
    :aria-label="context ? `Источник: ${context}` : undefined"
    :title="`${citation?.label ?? 'Источник'}. Проверено ${citation?.asOf ?? asOf}`"
  >
    <slot>Источник</slot>
  </a>
</template>
