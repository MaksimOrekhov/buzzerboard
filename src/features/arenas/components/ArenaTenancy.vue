<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Arena } from '@/entities/nba/arenaDirectory'
import { NBA_TEAM_HISTORIES, TEAM_HISTORY_SOURCES } from '@/entities/nba/teamHistory'
import { NBA_TEAMS } from '@/entities/nba/teamCatalog'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import ArenaSource from './ArenaSource.vue'

const props = defineProps<{ arena: Arena }>()
const historicalTeams = computed(() =>
  NBA_TEAM_HISTORIES.flatMap((profile) => {
    const team = NBA_TEAMS.find((item) => item.team.id === profile.canonicalTeamId)
    if (!team) return []
    return profile.arenas.flatMap((venue) => {
      const source = TEAM_HISTORY_SOURCES[venue.source]
      return venue.arenaId === props.arena.id && venue.until !== null && source
        ? [
            {
              team,
              from: venue.from,
              until: venue.until,
              source: { sourceUrl: source.url, asOf: source.asOf },
            },
          ]
        : []
    })
  }),
)
</script>

<template>
  <section class="arena-panel" aria-labelledby="arena-teams-heading">
    <h2 id="arena-teams-heading">Домашние команды NBA</h2>
    <ul class="arena-tenancy">
      <li v-for="assignment in arena.assignments" :key="assignment.team.code">
        <TeamLogo :team="assignment.team.team" :size="36" />
        <div>
          <RouterLink :to="{ name: 'team-profile', params: { teamCode: assignment.team.code } }">
            {{ assignment.team.name }}
          </RouterLink>
          <p>
            Сезон {{ assignment.seasonEndYear - 1 }}/{{
              String(assignment.seasonEndYear).slice(-2)
            }}
            · с <time :datetime="assignment.validFrom">{{ assignment.validFrom }}</time>
          </p>
          <ArenaSource :source="assignment" />
          <ArenaSource v-if="assignment.wikidataVenue" :source="assignment.wikidataVenue">
            Домашняя арена в Wikidata
          </ArenaSource>
        </div>
      </li>
    </ul>
    <template v-if="historicalTeams.length">
      <h3>Исторические арендаторы NBA</h3>
      <ul class="arena-history-list">
        <li v-for="item in historicalTeams" :key="item.team.code + item.from">
          <RouterLink
            :to="{
              name: 'team-profile',
              params: { teamCode: item.team.code },
              query: { tab: 'history' },
            }"
          >
            {{ item.team.name }}
          </RouterLink>
          <span>{{ item.from }}–{{ item.until }}</span>
          <ArenaSource :source="item.source" />
        </li>
      </ul>
    </template>
    <template v-if="arena.alternateHome">
      <h3>Другие домашние площадки команды в сезоне</h3>
      <p>{{ arena.alternateHome.name }}, {{ arena.alternateHome.city }}</p>
      <p>
        <template v-for="(date, index) in arena.alternateHome.dates" :key="date">
          <span v-if="index"> · </span><time :datetime="date">{{ date }}</time>
        </template>
      </p>
      <ArenaSource :source="arena.alternateHome">Расписание клуба</ArenaSource>
    </template>
  </section>
</template>
