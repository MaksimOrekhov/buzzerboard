<script setup lang="ts" generic="T extends string">
defineProps<{
  label: string
  variant?: 'pill' | 'underline'
  options: readonly { value: T; label: string; count?: number }[]
}>()
const model = defineModel<T>({ required: true })
</script>
<template>
  <div
    :class="variant === 'underline' ? 'gc-status-tabs' : 'ui-segmented'"
    role="group"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      :class="{ 'gc-status-tab': variant === 'underline' }"
      type="button"
      :aria-pressed="model === option.value"
      @click="model = option.value"
    >
      {{ option.label }}<span v-if="option.count !== undefined">{{ option.count }}</span>
    </button>
  </div>
</template>
