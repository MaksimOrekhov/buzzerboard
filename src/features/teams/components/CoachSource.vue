<script setup lang="ts">
import { computed } from 'vue'
import { COACHING_DIRECTORY } from '@/entities/nba/coachingDirectory'

const props = defineProps<{ sourceId: string }>()
const source = computed(() => COACHING_DIRECTORY.sources[props.sourceId])
</script>

<template>
  <a
    v-if="source"
    class="coach-source"
    :href="source.url"
    :title="`${source.label} · Сверено ${source.asOf}`"
    target="_blank"
    rel="noopener noreferrer"
    ><slot>Источник</slot></a
  >
</template>
