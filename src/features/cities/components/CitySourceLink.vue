<script setup lang="ts">
import type { CitySource } from '@/entities/nba/cityDirectory'
defineProps<{ source: CitySource }>()
</script>

<template>
  <a :href="source.sourceUrl" target="_blank" rel="noopener noreferrer" class="city-source">
    <slot>{{ source.label }}</slot>
    <time :datetime="source.asOf">{{ source.asOf.split('-').reverse().join('.') }}</time>
  </a>
</template>
