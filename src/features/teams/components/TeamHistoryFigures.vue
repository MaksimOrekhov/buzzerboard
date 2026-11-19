<script setup lang="ts">
import type { TeamHistory } from '@/entities/nba/teamHistory'
import TeamHistorySource from './TeamHistorySource.vue'

const props = defineProps<{ profile: TeamHistory }>()
</script>

<template>
  <section class="team-history-card" aria-labelledby="team-history-figures">
    <h3 id="team-history-figures">Легенды и номера</h3>
    <ul class="team-history-legends">
      <li v-for="person in props.profile.legends" :key="person.name">
        <span v-if="person.number !== null" class="team-history-number">№{{ person.number }}</span>
        <h4>{{ person.name }}</h4>
        <p>{{ person.detail }}</p>
        <div class="team-history-inline">
          <TeamHistorySource :source-id="person.source" />
          <TeamHistorySource v-if="person.hallOfFame" :source-id="person.hallOfFame">
            Зал славы
          </TeamHistorySource>
        </div>
      </li>
    </ul>
    <template v-if="props.profile.retired">
      <h4>Выведенные из обращения номера</h4>
      <ul class="team-history-retired">
        <li v-for="entry in props.profile.retired.numbers" :key="entry.number">
          <strong>№{{ entry.number }}</strong> {{ entry.name }}
        </li>
      </ul>
      <TeamHistorySource :source-id="props.profile.retired.source"
        >Источник подборки</TeamHistorySource
      >
    </template>
    <p v-else class="team-history-meta">Список выведенных номеров пока не подтверждён.</p>
  </section>
</template>
