<script setup lang="ts" generic="T extends string">
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
} from 'reka-ui'
import AppIcon from './AppIcon.vue'
defineProps<{
  label: string
  options: readonly { value: T; label: string; disabled?: boolean }[]
}>()
const model = defineModel<T>({ required: true })
</script>
<template>
  <SelectRoot v-model="model">
    <SelectTrigger class="gc-control gc-select" :aria-label="label"
      ><SelectValue /><AppIcon name="down" :size="15"
    /></SelectTrigger>
    <SelectPortal
      ><SelectContent
        class="game-center-theme gc-popover gc-select-menu"
        position="popper"
        :side-offset="8"
        :collision-padding="12"
      >
        <SelectViewport
          ><SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            :disabled="option.disabled ?? false"
            class="gc-option"
            ><SelectItemText>{{ option.label }}</SelectItemText
            ><SelectItemIndicator
              ><AppIcon name="check" :size="16" /></SelectItemIndicator></SelectItem
        ></SelectViewport> </SelectContent
    ></SelectPortal>
  </SelectRoot>
</template>
