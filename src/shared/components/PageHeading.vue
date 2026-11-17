<script setup lang="ts">
withDefaults(
  defineProps<{ eyebrow: string; title: string; description: string; titleDot?: boolean }>(),
  { titleDot: true },
)
</script>
<template>
  <header class="gc-page-heading">
    <div>
      <div class="gc-page-kicker">
        <span class="gc-league-dot" />NBA<span class="gc-heading-divider">/</span>{{ eyebrow }}
      </div>
      <h1>{{ title }}<span v-if="titleDot" class="gc-title-dot">.</span></h1>
      <p>{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="ui-heading-actions"><slot name="actions" /></div>
  </header>
</template>
