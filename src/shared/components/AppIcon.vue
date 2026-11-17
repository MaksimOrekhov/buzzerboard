<script setup lang="ts">
import type { AppIconName } from '@/shared/icons'

withDefaults(
  defineProps<{
    name: AppIconName
    size?: number
  }>(),
  {
    size: 18,
  },
)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'home'">
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </template>
    <template v-else-if="name === 'chevron-left'">
      <path d="m15 18-6-6 6-6" />
    </template>
    <template v-else-if="name === 'chevron-right'">
      <path d="m9 18 6-6-6-6" />
    </template>
    <template v-else-if="name === 'chart'">
      <path d="M4 19V5M4 19h17" />
      <path d="M8 16v-4M13 16V8M18 16v-7" />
    </template>
    <template v-else-if="name === 'calendar'">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
    </template>
    <template v-else-if="name === 'trophy'">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4" />
    </template>
    <template v-else-if="name === 'news'">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M7 8h5v5H7zM15 8h3M15 12h3M7 17h11" />
    </template>
    <template v-else-if="name === 'bookmark'">
      <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4z" />
    </template>
    <template v-else-if="name === 'arrow-up-right'">
      <path d="M7 17 17 7M8 7h9v9" />
    </template>
    <template v-else-if="name === 'sparkles'">
      <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" />
      <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </template>
    <template v-else-if="name === 'clock'">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </template>
    <template v-else-if="name === 'database'">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </template>
    <template v-else-if="name === 'users'">
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
      <circle cx="9.5" cy="7.5" r="3.5" />
      <path d="M17 11a3.5 3.5 0 1 0-1-6.9M21 20v-1.5a4 4 0 0 0-3-3.9" />
    </template>
    <template v-else>
      <circle cx="12" cy="12" r="9" />
      <path d="M4.8 6.6c4 1.4 7.2 5.3 7.2 14.2M19.2 6.6c-4 1.4-7.2 5.3-7.2 14.2M3 12h18" />
    </template>
  </svg>
</template>
