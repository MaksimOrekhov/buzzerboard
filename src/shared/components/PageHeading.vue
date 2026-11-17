<script setup lang="ts">
defineProps<{
  eyebrow: string
  title: string
  description: string
}>()
</script>

<template>
  <header class="page-heading">
    <p class="eyebrow">{{ eyebrow }}</p>
    <h1>{{ title }}</h1>
    <p class="page-heading-description">{{ description }}</p>
  </header>
</template>

<style scoped>
.page-heading {
  max-width: 48rem;
  margin-bottom: clamp(1.6rem, 4vw, 2.7rem);
}

.page-heading h1 {
  margin: 0.55rem 0 0;
  color: var(--ink);
  font-size: clamp(2rem, 4.2vw, 3.3rem);
  font-weight: 760;
  letter-spacing: -0.065em;
  line-height: 1.04;
  overflow-wrap: anywhere;
}

.page-heading-description {
  max-width: 41rem;
  margin: 0.85rem 0 0;
  color: var(--muted);
  font-size: clamp(0.84rem, 1.3vw, 0.96rem);
  line-height: 1.65;
}
</style>
