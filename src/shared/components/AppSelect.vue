<script setup lang="ts" generic="T extends string">
import { computed, useId } from 'vue'
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
const props = defineProps<{
  label: string
  showLabel?: boolean
  disabled?: boolean
  placeholder?: string
  options: readonly { value: T; label: string; shortLabel?: string; disabled?: boolean }[]
}>()
const id = useId()
const model = defineModel<T>({ required: true })
const selectedOption = computed(() => props.options.find(({ value }) => value === model.value))
const selectedLabel = computed(
  () =>
    selectedOption.value?.label ??
    props.placeholder ??
    (props.options.length ? 'Выберите…' : 'Нет вариантов'),
)
</script>
<template>
  <SelectRoot v-model="model" :disabled="disabled || !options.length">
    <label v-if="showLabel" :for="id" class="gc-select-caption">{{ label }}</label>
    <SelectTrigger
      :id="id"
      class="gc-control gc-select"
      :aria-label="showLabel ? undefined : label"
    >
      <SelectValue>
        <template v-if="selectedOption?.shortLabel">
          <span class="gc-select-full-value">{{ selectedLabel }}</span>
          <span class="gc-select-short-value" aria-hidden="true">{{
            selectedOption.shortLabel
          }}</span>
        </template>
        <template v-else>{{ selectedLabel }}</template>
      </SelectValue>
      <AppIcon name="down" :size="15" />
    </SelectTrigger>
    <SelectPortal
      ><SelectContent
        class="game-center-theme gc-popover gc-select-menu"
        position="popper"
        :aria-label="label"
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

<style scoped>
.gc-select-short-value {
  display: none;
}
@media (max-width: 620px) {
  .gc-select-full-value {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .gc-select-short-value {
    display: inline;
  }
}
</style>
