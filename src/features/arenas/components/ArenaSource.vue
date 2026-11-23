<script setup lang="ts">
defineProps<{ source: { sourceUrl: string; asOf: string } }>()
</script>

<template>
  <span class="arena-source">
    <a :href="source.sourceUrl" target="_blank" rel="noopener noreferrer"><slot>Источник</slot></a>
    <time :datetime="source.asOf">{{ source.asOf }}</time>
  </span>
</template>
