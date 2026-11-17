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
    type?: 'button' | 'submit' | 'reset'
  }>(),
  {
    variant: 'secondary',
    icon: null,
    iconOnly: false,
    ariaLabel: null,
    disabled: false,
    type: 'button',
  },
)

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    class="button"
    :class="[`button--${variant}`, { 'button--icon': iconOnly }]"
    :type="type"
    :aria-label="ariaLabel ?? undefined"
    :disabled="disabled"
    @click="emit('click', $event)"
  >
    <slot />
    <AppIcon v-if="icon" :name="icon" :size="iconOnly ? 18 : 16" />
  </button>
</template>
