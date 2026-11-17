<script setup lang="ts">
import AppIcon from './AppIcon.vue'
withDefaults(defineProps<{ label: string; placeholder?: string }>(), { placeholder: 'Поиск' })
const model = defineModel<string>({ required: true })
</script>
<template>
  <label class="gc-search"
    ><AppIcon name="search" :size="17" /><input
      v-model="model"
      type="search"
      :placeholder="placeholder"
      :aria-label="label"
  /></label>
</template>
