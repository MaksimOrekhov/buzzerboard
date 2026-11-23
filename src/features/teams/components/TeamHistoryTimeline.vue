<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  HISTORY_CATEGORIES,
  historyTimeline,
  type HistoryCategory,
  type TeamHistory,
} from '@/entities/nba/teamHistory'
import AppSelect from '@/shared/components/AppSelect.vue'
import TeamHistorySource from './TeamHistorySource.vue'

const props = defineProps<{ profile: TeamHistory }>()
type Category = HistoryCategory | 'all'
const categories: { value: Category; label: string }[] = [
  { value: 'all', label: 'Все события' },
  ...Object.entries(HISTORY_CATEGORIES).map(([value, label]) => ({
    value: value as HistoryCategory,
    label,
  })),
]
const orders = [
  { value: 'asc', label: 'Сначала ранние' },
  { value: 'desc', label: 'Сначала поздние' },
] as const
const category = ref<Category>('all')
const order = ref<'asc' | 'desc'>('asc')
const events = computed(() => historyTimeline(props.profile, category.value, order.value))
</script>

<template>
  <section class="team-history-card" aria-labelledby="team-history-timeline">
    <h3 id="team-history-timeline">Хронология</h3>
    <div class="team-history-controls">
      <div class="gc-select-field">
        <AppSelect v-model="category" label="Категория" :options="categories" show-label />
      </div>
      <div class="gc-select-field">
        <AppSelect v-model="order" label="Порядок" :options="orders" show-label />
      </div>
    </div>
    <p class="visually-hidden" role="status">Событий в выборке: {{ events.length }}</p>
    <ol v-if="events.length" class="team-history-timeline">
      <li
        v-for="event in events"
        :key="`${event.year}-${event.category}-${event.title}-${event.detail}`"
      >
        <time :datetime="String(event.year)">{{ event.year }}</time>
        <div>
          <div class="team-history-meta">{{ HISTORY_CATEGORIES[event.category] }}</div>
          <h4>{{ event.title }}</h4>
          <p>{{ event.detail }}</p>
          <TeamHistorySource :source-id="event.source" />
        </div>
      </li>
    </ol>
    <p v-else>В этой категории пока нет подтверждённых событий.</p>
  </section>
</template>
