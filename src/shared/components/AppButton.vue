<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { AppIconName } from '@/shared/icons'
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    icon?: AppIconName | null
    iconOnly?: boolean
    ariaLabel?: string | null
    disabled?: boolean
    loading?: boolean
    type?: 'button' | 'submit' | 'reset'
  }>(),
  {
    variant: 'secondary',
    icon: null,
    iconOnly: false,
    ariaLabel: null,
    disabled: false,
    loading: false,
    type: 'button',
  },
)
defineEmits<{ click: [event: MouseEvent] }>()
</script>
<template>
  <button
    class="gc-control ui-button"
    :class="[`ui-button--${variant}`, { 'gc-icon-button': iconOnly }]"
    :type="type"
    :aria-label="ariaLabel ?? undefined"
    :aria-busy="loading || undefined"
    :disabled="disabled || loading"
    @click="$emit('click', $event)"
  >
    <AppIcon v-if="icon" :name="icon" :size="18" :class="{ 'gc-spinning': loading }" /><slot />
  </button>
</template>
