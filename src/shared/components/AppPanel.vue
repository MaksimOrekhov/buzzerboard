<script setup lang="ts">
import { useId } from 'vue'
defineProps<{ title: string; description?: string }>()
const id = useId()
</script>
<template>
  <section class="ui-panel" :aria-labelledby="id">
    <header class="ui-panel-heading">
      <div>
        <h2 :id="id">{{ title }}</h2>
        <p v-if="description">{{ description }}</p>
      </div>
      <slot name="actions" />
    </header>
    <div class="ui-panel-content"><slot /></div>
  </section>
</template>
