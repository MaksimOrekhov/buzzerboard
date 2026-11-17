<script setup lang="ts">
withDefaults(
  defineProps<{ tone?: 'neutral' | 'accent' | 'lime' | 'warning' | 'success'; dot?: boolean }>(),
  { tone: 'neutral', dot: false },
)
</script>
<template>
  <span class="ui-badge" :class="`ui-badge--${tone}`"
    ><span v-if="dot" class="ui-badge-dot" aria-hidden="true" /><slot
  /></span>
</template>
