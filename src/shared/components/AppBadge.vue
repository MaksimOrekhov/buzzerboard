<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'neutral' | 'accent' | 'lime' | 'warning' | 'success'
    dot?: boolean
  }>(),
  { tone: 'neutral', dot: false },
)
</script>

<template>
  <span class="badge" :class="`badge--${tone}`">
    <span v-if="dot" class="badge-dot" aria-hidden="true" />
    <slot />
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  min-height: 1.55rem;
  align-items: center;
  gap: 0.42rem;
  border: 1px solid var(--line);
  border-radius: 99px;
  padding: 0.22rem 0.56rem;
  font-size: 0.59rem;
  font-weight: 760;
  letter-spacing: 0.095em;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
}

.badge--neutral {
  background: rgb(255 255 255 / 3%);
  color: var(--ink-soft);
}

.badge--accent {
  border-color: rgb(242 122 86 / 26%);
  background: var(--accent-soft);
  color: #ffac8c;
}

.badge--lime {
  border-color: rgb(217 236 121 / 24%);
  background: var(--lime-soft);
  color: var(--lime);
}

.badge--warning {
  border-color: rgb(228 182 107 / 26%);
  background: rgb(228 182 107 / 8%);
  color: #edc986;
}

.badge--success {
  border-color: rgb(140 197 157 / 25%);
  background: rgb(140 197 157 / 8%);
  color: #a8d8b4;
}

.badge-dot {
  width: 0.35rem;
  height: 0.35rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px currentColor;
}
</style>
