<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from './AppIcon.vue'
import type { NbaApiError, NbaProviderId } from '@/entities/nba/model'
import type { NbaApiSnapshot } from '@/shared/api/nba/contracts'
import type { AppIconName } from '@/shared/icons'
import { VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'

const props = withDefaults(
  defineProps<{
    status: 'loading' | 'error' | 'empty' | 'ready'
    icon?: AppIconName
    title?: string
    description?: string
    error?: NbaApiError | null
    meta?: NbaApiSnapshot<unknown>['meta'] | null
    compact?: boolean
  }>(),
  {
    icon: 'basketball',
    title: 'Данных пока нет',
    description: 'Информация появится, когда подключится проверенный источник.',
    error: null,
    meta: null,
    compact: false,
  },
)

const providerLabels: Record<NbaProviderId, string> = {
  dunkapi: 'DunkAPI',
  espn: 'ESPN',
}

const updatedAt = computed(() => {
  const fetchedAt = props.meta?.fetchedAt
  if (!fetchedAt) return 'время не указано'

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: VIEWER_TIME_ZONE,
  }).format(new Date(fetchedAt))
})

const sourceLabel = computed(() => {
  const source = props.meta?.source
  return source ? providerLabels[source] : 'источник не указан'
})
</script>

<template>
  <div class="resource-state-wrap" :class="{ 'resource-state-wrap--compact': compact }">
    <div v-if="meta?.isStale" class="stale-note" role="status">
      <AppIcon name="clock" :size="15" />
      <span>
        Устаревший снимок · {{ sourceLabel }} · {{ updatedAt }}
        <span v-if="meta.refreshError"> · последнее обновление не удалось</span>
      </span>
    </div>

    <section v-if="status === 'loading'" class="state-card state-card--loading" aria-busy="true">
      <span class="visually-hidden">Загрузка данных</span>
      <div class="loading-art" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div class="loading-lines" aria-hidden="true">
        <span class="loading-line loading-line--short" />
        <span class="loading-line" />
        <span class="loading-line loading-line--medium" />
      </div>
    </section>

    <section v-else-if="status === 'error'" class="state-card state-card--error" role="alert">
      <div class="state-symbol state-symbol--error"><AppIcon name="database" :size="19" /></div>
      <div class="state-copy">
        <p class="eyebrow">Не удалось загрузить</p>
        <h2>{{ title }}</h2>
        <p>{{ error?.message ?? description }}</p>
      </div>
      <slot name="action" />
    </section>

    <section v-else-if="status === 'empty'" class="state-card state-card--empty">
      <div class="state-art" aria-hidden="true">
        <span class="state-orbit state-orbit--outer" />
        <span class="state-orbit state-orbit--inner" />
        <span class="state-symbol"><AppIcon :name="icon" :size="21" /></span>
      </div>
      <div class="state-copy">
        <p class="eyebrow">Достоверные данные</p>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
      <span class="state-index" aria-hidden="true">BB / NBA</span>
    </section>

    <div v-else class="ready-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.resource-state-wrap {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}

.state-card {
  position: relative;
  display: flex;
  min-height: 12.5rem;
  align-items: center;
  gap: 1.3rem;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(ellipse at 0 100%, rgb(242 122 86 / 7%), transparent 48%),
    linear-gradient(145deg, rgb(255 255 255 / 2.7%), rgb(255 255 255 / 0.7%));
  padding: clamp(1.1rem, 3.5vw, 1.8rem);
}

.state-card--empty {
  min-height: 12.5rem;
}

.state-card--error {
  border-color: rgb(242 127 121 / 22%);
  background: linear-gradient(145deg, rgb(242 127 121 / 6%), rgb(255 255 255 / 1%));
}

.state-art {
  position: relative;
  display: grid;
  width: 6.2rem;
  height: 6.2rem;
  flex: 0 0 auto;
  place-items: center;
}

.state-orbit {
  position: absolute;
  border: 1px solid rgb(235 238 230 / 10%);
  border-radius: 50%;
}

.state-orbit--outer {
  inset: 0;
}

.state-orbit--inner {
  inset: 0.55rem;
  border-color: rgb(242 122 86 / 27%);
  transform: rotate(-28deg) scaleX(0.65);
}

.state-symbol {
  z-index: 1;
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  place-items: center;
  border: 1px solid rgb(242 122 86 / 34%);
  border-radius: 0.92rem;
  background: var(--accent-soft);
  color: var(--accent-bright);
}

.state-symbol--error {
  align-self: flex-start;
  border-color: rgb(242 127 121 / 30%);
  background: rgb(242 127 121 / 9%);
  color: var(--danger);
}

.state-copy {
  max-width: 34rem;
  min-width: 0;
}

.state-copy h2 {
  margin: 0.5rem 0 0;
  color: var(--ink);
  font-size: clamp(1.15rem, 2.3vw, 1.5rem);
  font-weight: 700;
  letter-spacing: -0.045em;
  line-height: 1.2;
}

.state-copy > p:last-child {
  margin: 0.55rem 0 0;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.65;
}

.state-index {
  position: absolute;
  right: 1rem;
  bottom: 0.9rem;
  color: var(--subtle);
  font-size: var(--font-size-caption);
  font-weight: 760;
  letter-spacing: 0.14em;
}

.stale-note {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  border: 1px solid rgb(228 182 107 / 22%);
  border-radius: var(--radius-sm);
  background: rgb(228 182 107 / 7%);
  padding: 0.65rem 0.8rem;
  color: #e8c77f;
  font-size: var(--font-size-caption);
  line-height: 1.45;
}

.stale-note :deep(svg) {
  flex: 0 0 auto;
  margin-top: 0.05rem;
}

.state-card--loading {
  display: grid;
  grid-template-columns: 5.8rem minmax(0, 1fr);
  gap: 1rem;
}

.loading-art {
  display: grid;
  width: 5.4rem;
  height: 5.4rem;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface-2);
}

.loading-art span {
  width: 2rem;
  height: 0.18rem;
  border-radius: 99px;
  background: var(--surface-raised);
  animation: loading-pulse 1.2s ease-in-out infinite alternate;
}

.loading-art span:nth-child(2) {
  width: 2.7rem;
  animation-delay: 120ms;
}

.loading-art span:nth-child(3) {
  width: 1.55rem;
  animation-delay: 240ms;
}

.loading-lines {
  display: grid;
  align-content: center;
  gap: 0.65rem;
}

.loading-line {
  display: block;
  width: 92%;
  height: 0.48rem;
  border-radius: 99px;
  background: var(--surface-3);
  animation: loading-pulse 1.2s ease-in-out infinite alternate;
}

.loading-line--short {
  width: 38%;
}

.loading-line--medium {
  width: 64%;
}

.ready-content {
  min-width: 0;
}

@keyframes loading-pulse {
  from {
    opacity: 0.5;
  }

  to {
    opacity: 1;
  }
}

.resource-state-wrap--compact .state-card {
  min-height: 9.8rem;
  gap: 0.9rem;
  padding: 1rem;
}

.resource-state-wrap--compact .state-art {
  width: 4.7rem;
  height: 4.7rem;
}

.resource-state-wrap--compact .state-symbol {
  width: 2.35rem;
  height: 2.35rem;
}

.resource-state-wrap--compact .state-copy h2 {
  font-size: 1rem;
}

.resource-state-wrap--compact .state-copy > p:last-child {
  font-size: var(--font-size-caption);
}

@media (max-width: 580px) {
  .state-card {
    min-height: 0;
    align-items: flex-start;
    gap: 0.95rem;
    padding: 1.1rem;
  }

  .state-art {
    width: 3.8rem;
    height: 3.8rem;
  }

  .state-orbit--inner {
    inset: 0.4rem;
  }

  .state-symbol {
    width: 2.25rem;
    height: 2.25rem;
  }

  .state-index {
    display: none;
  }

  .resource-state-wrap--compact .state-card {
    min-height: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-art span,
  .loading-line {
    animation: none;
  }
}
</style>
