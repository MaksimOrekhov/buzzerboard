<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  HISTORY_CATEGORIES,
  historyTimeline,
  type HistoryCategory,
  type TeamHistory,
} from '@/entities/nba/teamHistory'
import TeamHistorySource from './TeamHistorySource.vue'

const props = defineProps<{ profile: TeamHistory }>()
const category = ref<HistoryCategory | 'all'>('all')
const order = ref<'asc' | 'desc'>('asc')
const events = computed(() => historyTimeline(props.profile, category.value, order.value))
</script>

<template>
  <section class="team-history-card" aria-labelledby="team-history-timeline">
    <h3 id="team-history-timeline">Хронология</h3>
    <div class="team-history-controls">
      <label>
        Категория
        <select v-model="category" class="gc-control">
          <option value="all">Все события</option>
          <option v-for="(label, key) in HISTORY_CATEGORIES" :key="key" :value="key">
            {{ label }}
          </option>
        </select>
      </label>
      <label>
        Порядок
        <select v-model="order" class="gc-control">
          <option value="asc">Сначала ранние</option>
          <option value="desc">Сначала поздние</option>
        </select>
      </label>
    </div>
    <p class="team-history-sr-only" role="status">Событий в выборке: {{ events.length }}</p>
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
