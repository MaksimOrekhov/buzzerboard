<script setup lang="ts">
defineProps<{ value: string | number | null }>()
</script>

<template>
  <strong class="stat-value">{{ value ?? '—' }}</strong>
</template>

<style scoped>
.stat-value {
  font-variant-numeric: tabular-nums;
}
</style>
