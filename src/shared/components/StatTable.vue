<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div class="stat-table-scroll" role="region" :aria-label="label" tabindex="0"><slot /></div>
</template>

<style scoped>
.stat-table-scroll {
  overflow-x: auto;
  font-variant-numeric: tabular-nums;
}
.stat-table-scroll:focus-visible {
  outline: 2px solid var(--gc-accent);
  outline-offset: -2px;
}
</style>
