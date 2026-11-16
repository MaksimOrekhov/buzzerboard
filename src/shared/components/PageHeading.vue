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
  margin-bottom: clamp(1.8rem, 4vw, 3.2rem);
}

.page-heading h1 {
  margin: 0.8rem 0 0;
  color: var(--ink);
  font-size: clamp(2.15rem, 5vw, 3.7rem);
  font-weight: 720;
  letter-spacing: -0.055em;
  line-height: 1.04;
}

.page-heading-description {
  max-width: 42rem;
  margin: 1rem 0 0;
  color: var(--muted);
  font-size: clamp(0.95rem, 1.5vw, 1.05rem);
  line-height: 1.7;
}
</style>
