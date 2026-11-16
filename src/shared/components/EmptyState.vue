<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { AppIconName } from '@/shared/icons'

withDefaults(
  defineProps<{
    icon: AppIconName
    title: string
    description: string
    eyebrow?: string
  }>(),
  {
    eyebrow: 'Ready when you are',
  },
)
</script>

<template>
  <section class="empty-state" aria-labelledby="empty-state-title">
    <div class="empty-state-art" aria-hidden="true">
      <span class="empty-state-orbit empty-state-orbit--outer" />
      <span class="empty-state-orbit empty-state-orbit--inner" />
      <span class="empty-state-icon"><AppIcon :name="icon" :size="22" /></span>
    </div>
    <div class="empty-state-copy">
      <p class="eyebrow">{{ eyebrow }}</p>
      <h2 id="empty-state-title">{{ title }}</h2>
      <p>{{ description }}</p>
    </div>
    <span class="empty-state-index" aria-hidden="true">BB / 00</span>
  </section>
</template>

<style scoped>
.empty-state {
  position: relative;
  display: grid;
  min-height: 18rem;
  grid-template-columns: 9rem minmax(0, 1fr);
  align-items: center;
  gap: clamp(1.5rem, 4vw, 3.2rem);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 1.4rem;
  background:
    radial-gradient(ellipse at 0 100%, rgb(255 112 72 / 8%), transparent 48%),
    linear-gradient(145deg, rgb(255 255 255 / 3%), rgb(255 255 255 / 1%));
  padding: clamp(1.6rem, 5vw, 3.5rem);
}

.empty-state-art {
  position: relative;
  display: grid;
  width: 8rem;
  height: 8rem;
  place-items: center;
}

.empty-state-orbit {
  position: absolute;
  display: block;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 50%;
}

.empty-state-orbit--outer {
  inset: 0;
}

.empty-state-orbit--inner {
  inset: 0.8rem;
  border-color: rgb(255 112 72 / 20%);
  transform: rotate(-28deg) scaleX(0.62);
}

.empty-state-icon {
  display: grid;
  width: 3.2rem;
  height: 3.2rem;
  place-items: center;
  border: 1px solid rgb(255 112 72 / 25%);
  border-radius: 1.05rem;
  background: rgb(255 112 72 / 10%);
  color: var(--accent);
}

.empty-state-copy {
  max-width: 34rem;
}

.empty-state-copy h2 {
  margin: 0.65rem 0 0;
  color: var(--ink);
  font-size: clamp(1.35rem, 3vw, 2rem);
  font-weight: 660;
  letter-spacing: -0.04em;
}

.empty-state-copy > p:last-child {
  margin: 0.7rem 0 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.7;
}

.empty-state-index {
  position: absolute;
  right: 1.5rem;
  bottom: 1.2rem;
  color: #666c73;
  font-size: 0.57rem;
  font-weight: 700;
  letter-spacing: 0.17em;
}

@media (max-width: 580px) {
  .empty-state {
    min-height: auto;
    grid-template-columns: 1fr;
    gap: 1.3rem;
    padding: 1.5rem;
  }

  .empty-state-art {
    width: 5.5rem;
    height: 5.5rem;
  }
}
</style>
