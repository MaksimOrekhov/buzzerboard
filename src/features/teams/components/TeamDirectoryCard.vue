<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { TeamDirectoryEntry } from '@/shared/api/nba/contracts'
import type { TeamId } from '@/entities/nba/model'
import { formatPercentage, formatRecord } from '@/features/standings/formatters'
import AppIcon from '@/shared/components/AppIcon.vue'
import TeamLogo from '@/shared/components/TeamLogo.vue'
defineProps<{
  entry: TeamDirectoryEntry
  favorite: boolean
  statsHidden: boolean
}>()
defineEmits<{ toggleFavorite: [teamId: TeamId] }>()
</script>

<template>
  <article class="teams-card">
    <header class="teams-card-header">
      <RouterLink :to="`/teams/${entry.code}`" class="teams-card-identity">
        <TeamLogo :team="entry.team" :size="52" />
        <span class="teams-card-title"
          ><strong>{{ entry.name }}</strong
          ><small>{{ entry.code }} · {{ entry.division }}</small></span
        >
      </RouterLink>
      <button
        class="gc-icon-button teams-favorite"
        type="button"
        :aria-pressed="favorite"
        :aria-label="`${favorite ? 'Убрать' : 'Добавить'} ${entry.name} ${favorite ? 'из' : 'в'} избранное`"
        @click="$emit('toggleFavorite', entry.team.id)"
      >
        <AppIcon name="star" :size="18" />
      </button>
    </header>
    <RouterLink v-if="!statsHidden" :to="`/teams/${entry.code}`" class="teams-card-stats">
      <div>
        <span>Баланс</span
        ><strong>{{
          formatRecord(entry.season?.wins ?? null, entry.season?.losses ?? null)
        }}</strong>
      </div>
      <div>
        <span>PCT*</span
        ><strong>{{ formatPercentage(entry.season?.winPercentage ?? null) }}</strong>
      </div>
      <div>
        <span>Место</span
        ><strong
          >{{ entry.season?.overallRank ?? '—'
          }}<small v-if="entry.season?.overallRank"> / 30</small></strong
        >
      </div>
    </RouterLink>
    <footer class="teams-card-footer">
      <span>{{ entry.conference === 'east' ? 'Восток' : 'Запад' }}</span>
      <span v-if="!statsHidden && entry.season?.isStale" class="teams-stale">Снимок устарел</span>
      <RouterLink :to="`/teams/${entry.code}`" :aria-label="`Открыть профиль ${entry.name}`"
        >Профиль<AppIcon name="arrow" :size="14"
      /></RouterLink>
    </footer>
  </article>
</template>
