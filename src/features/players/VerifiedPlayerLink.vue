<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { bbsPlayerId, playerPath } from '@/entities/nba/players'
import { usePlayers } from './api'
const props = defineProps<{ id: string; name: string }>()
const query = usePlayers(() => bbsPlayerId.test(props.id))
const verified = computed(() => query.data.value?.players.some((row) => row.id === props.id))
</script>

<template>
  <RouterLink v-if="verified" :to="playerPath(id)" class="ui-text-link">{{ name }}</RouterLink>
  <span v-else>{{ name }}</span>
</template>
