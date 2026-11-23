<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from 'vue'
import { formatCityTime } from '@/entities/nba/cityDirectory'

defineProps<{ timeZone: string }>()
const now = shallowRef(new Date())
let timer: ReturnType<typeof setTimeout> | undefined
function tick() {
  now.value = new Date()
  timer = setTimeout(tick, 60_000 - (now.value.getTime() % 60_000))
}
onMounted(tick)
onUnmounted(() => clearTimeout(timer))
</script>

<template>
  <time :datetime="now.toISOString()">{{ formatCityTime(now, timeZone) }}</time>
</template>
