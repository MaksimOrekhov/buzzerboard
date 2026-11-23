<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { arenaPath, type Arena } from '@/entities/nba/arenaDirectory'
import { getArenaMedia } from '@/entities/nba/teamMediaManifest'
import AppIcon from '@/shared/components/AppIcon.vue'
import MediaAttribution from '@/shared/components/MediaAttribution.vue'
import { formatArenaNumber } from '../catalog'

const props = defineProps<{ arena: Arena }>()
const photo = computed(() => getArenaMedia(props.arena.id)[0])
</script>

<template>
  <article class="arena-card">
    <MediaAttribution v-if="photo" :asset="photo" compact />
    <div v-else class="arena-card__placeholder">
      <AppIcon name="pin" :size="22" />
      <span>Фото с проверенной лицензией пока нет</span>
    </div>
    <div class="arena-card__copy">
      <h3>
        <RouterLink :to="arenaPath(arena)">{{ arena.name }}</RouterLink>
      </h3>
      <p>{{ arena.city }}</p>
      <ul class="arena-team-list" aria-label="Домашние команды">
        <li v-for="{ team } in arena.assignments" :key="team.code">
          <RouterLink :to="{ name: 'team-profile', params: { teamCode: team.code } }">
            {{ team.name }}
          </RouterLink>
        </li>
      </ul>
      <dl class="arena-card__facts">
        <div>
          <dt>Открытие</dt>
          <dd>{{ arena.opened?.value ?? 'Нет данных' }}</dd>
        </div>
        <div>
          <dt>Мест на матче NBA</dt>
          <dd>
            {{
              arena.basketballCapacity
                ? formatArenaNumber(arena.basketballCapacity.value)
                : 'Нет данных'
            }}
          </dd>
        </div>
      </dl>
    </div>
  </article>
</template>
