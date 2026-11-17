<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Team } from '@/entities/nba/model'

const props = defineProps<{ team: Team }>()
const code = computed(() => /^nba:team:([A-Z0-9]+)$/.exec(props.team.id)?.[1] ?? null)
</script>

<template>
  <RouterLink v-if="code" :to="`/teams/${code}`" class="team-profile-link">
    <slot />
  </RouterLink>
  <span v-else class="team-profile-link"><slot /></span>
</template>

<style scoped>
.team-profile-link {
  color: inherit;
  text-decoration: none;
}

a.team-profile-link:hover .team-profile-link-text,
a.team-profile-link:focus-visible .team-profile-link-text {
  color: var(--gc-accent);
}
</style>
