<script setup lang="ts">
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
import CenterIcon from './CenterIcon.vue'
defineProps<{ label: string; options: readonly { value: string; label: string }[] }>()
const model = defineModel<string>({ required: true })
</script>
<template>
  <SelectRoot v-model="model">
    <SelectTrigger class="gc-control gc-select" :aria-label="label"
      ><SelectValue /><CenterIcon name="down" :size="15"
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
            class="gc-option"
            ><SelectItemText>{{ option.label }}</SelectItemText
            ><SelectItemIndicator
              ><CenterIcon name="check" :size="16" /></SelectItemIndicator></SelectItem
        ></SelectViewport> </SelectContent
    ></SelectPortal>
  </SelectRoot>
</template>
