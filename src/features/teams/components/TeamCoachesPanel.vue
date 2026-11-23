<script setup lang="ts">
import '../coaches.css'
import { computed } from 'vue'
import {
  COACHING_DIRECTORY,
  COACHING_ROLES,
  coachingSourceIsStale,
  getTeamCoaching,
} from '@/entities/nba/coachingDirectory'
import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'
import CoachSource from './CoachSource.vue'
import TeamCoachAnalytics from './TeamCoachAnalytics.vue'
import TeamCoachHistory from './TeamCoachHistory.vue'
import TeamCoachLead from './TeamCoachLead.vue'

const props = defineProps<{ teamCode: string }>()
const profile = computed(() => getTeamCoaching(props.teamCode))
const { window } = useSpoilerMode()
const stale = computed(() => {
  const head = profile.value?.head
  return head
    ? coachingSourceIsStale(COACHING_DIRECTORY.sources[head.source]?.asOf ?? '', window.value.today)
    : false
})
</script>

<template>
  <section class="team-coaches" aria-labelledby="team-coaches-title">
    <h2 id="team-coaches-title">Тренерский штаб</h2>
    <template v-if="profile?.head">
      <TeamCoachLead :appointment="profile.head" :stale="stale" />
      <div class="coach-layout">
        <TeamCoachHistory :appointments="profile.history" :stale="stale" />
        <div class="coach-stack">
          <section class="coach-card" aria-labelledby="coach-staff-heading">
            <header>
              <h3 id="coach-staff-heading">Штаб и руководство</h3>
              <p v-if="profile.staff.length" class="coach-muted">Подборка подтверждённых ролей.</p>
            </header>
            <ul v-if="profile.staff.length" class="coach-staff">
              <li v-for="item in profile.staff" :key="`${item.personId}/${item.role}`">
                <strong>{{ COACHING_DIRECTORY.people[item.personId]?.name }}</strong>
                <span class="coach-muted">{{ COACHING_ROLES[item.role] }}</span>
                <CoachSource :source-id="item.source" />
              </li>
            </ul>
            <p v-else class="coach-muted">
              Сведения об ассистентах и руководстве пока не подтверждены.
            </p>
          </section>
          <TeamCoachAnalytics :appointment="profile.head" :game-window="profile.gameWindow" />
        </div>
      </div>
    </template>
    <p v-else class="coach-muted">Текущее назначение главного тренера пока не подтверждено.</p>
  </section>
</template>
