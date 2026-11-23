<script setup lang="ts">
import '../history.css'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { arenaPath, getArena, getTeamArena } from '@/entities/nba/arenaDirectory'
import { getTeamEncyclopediaEntry } from '@/entities/nba/teamEncyclopedia'
import { eraAt, getTeamHistory, TEAM_HISTORY_AS_OF, titleSource } from '@/entities/nba/teamHistory'
import { getTeamMedia } from '@/entities/nba/teamMediaManifest'
import MediaAttribution from '@/shared/components/MediaAttribution.vue'
import TeamHistoryFigures from './TeamHistoryFigures.vue'
import TeamHistorySource from './TeamHistorySource.vue'
import TeamHistoryTimeline from './TeamHistoryTimeline.vue'

const props = defineProps<{ teamCode: string }>()
const currentArena = computed(() => getTeamArena(props.teamCode))
const historyArenas = computed(() =>
  (profile.value?.arenas ?? []).map((period) => ({
    ...period,
    venue: getArena(period.arenaId),
  })),
)
const identity = computed(() => getTeamEncyclopediaEntry(props.teamCode))
const profile = computed(() => getTeamHistory(props.teamCode))
const media = computed(() => getTeamMedia(props.teamCode))
const nbaTitles = computed(() =>
  profile.value?.titles.seasons?.filter(({ league }) => league === 'NBA' || league === 'BAA'),
)
const otherTitles = computed(() =>
  profile.value?.titles.seasons?.filter(({ league }) => league === 'ABA' || league === 'NBL'),
)
const hasTitles = computed(() => Boolean(nbaTitles.value?.length || otherTitles.value?.length))
const titleGroups = computed(() => [
  { label: 'NBA и BAA', seasons: nbaTitles.value },
  { label: 'Другие лиги', seasons: otherTitles.value },
])
</script>

<template>
  <section class="team-history" aria-labelledby="team-history-title">
    <header class="team-history-heading">
      <h2 id="team-history-title">История франшизы</h2>
      <p class="team-history-meta">Источники сверены {{ TEAM_HISTORY_AS_OF }}</p>
    </header>
    <template v-if="profile && identity">
      <div class="team-history-top" :class="{ 'team-history-top--without-titles': !hasTitles }">
        <section
          class="team-history-card team-history-identity"
          aria-labelledby="team-history-identity"
        >
          <h3 id="team-history-identity">Основание и имена</h3>
          <div class="team-history-foundation">
            <strong>{{ profile.founded.year }}</strong>
            <p>
              {{ profile.founded.detail }} <TeamHistorySource :source-id="profile.founded.source" />
            </p>
          </div>
          <dl class="team-history-current">
            <div v-if="identity.city.value">
              <dt>Город сегодня</dt>
              <dd>
                {{ identity.city.value }}
                <TeamHistorySource
                  :source-url="identity.city.sourceUrl"
                  :as-of="identity.city.asOf"
                  :context="`город ${identity.city.value}`"
                />
              </dd>
            </div>
            <div v-if="identity.arena.value">
              <dt>Домашняя арена</dt>
              <dd>
                <RouterLink
                  v-if="currentArena"
                  :to="arenaPath(currentArena)"
                  class="team-history-source"
                >
                  {{ identity.arena.value }}
                </RouterLink>
                <template v-else>{{ identity.arena.value }}</template>
                <TeamHistorySource
                  :source-url="identity.arena.sourceUrl"
                  :as-of="identity.arena.asOf"
                  :context="`домашняя арена ${identity.arena.value}`"
                />
              </dd>
            </div>
          </dl>
          <ol class="team-history-eras">
            <li v-for="era in profile.eras" :key="era.from">
              <span class="team-history-meta">{{
                era.until === null ? `с ${era.from}` : `${era.from}–${era.until}`
              }}</span>
              <span
                ><strong>{{ era.name }}</strong
                ><small>{{ era.city }}</small></span
              >
              <TeamHistorySource :source-id="era.source" />
            </li>
          </ol>
          <p v-if="profile.identityNote" class="team-history-note">
            {{ profile.identityNote.detail }}
            <TeamHistorySource :source-id="profile.identityNote.source" />
          </p>
          <details v-if="profile.arenas.length" class="team-history-venues">
            <summary>Исторические арены · выборочно</summary>
            <ol class="team-history-eras">
              <li v-for="arena in historyArenas" :key="`${arena.name}-${arena.from}`">
                <span class="team-history-meta">{{
                  arena.until === null ? `с ${arena.from}` : `${arena.from}–${arena.until}`
                }}</span>
                <span>
                  <strong>
                    <RouterLink
                      v-if="arena.venue"
                      :to="arenaPath(arena.venue)"
                      class="team-history-source"
                    >
                      {{ arena.name }}
                    </RouterLink>
                    <template v-else>{{ arena.name }}</template>
                  </strong>
                  <small>{{ arena.city }}</small>
                </span>
                <TeamHistorySource :source-id="arena.source" />
              </li>
            </ol>
          </details>
        </section>

        <section
          class="team-history-card team-history-honors"
          aria-labelledby="team-history-titles"
        >
          <div class="team-history-honors-heading">
            <h3 id="team-history-titles">Чемпионства</h3>
            <TeamHistorySource :source-id="profile.titles.source"
              >Архив финалов NBA</TeamHistorySource
            >
          </div>
          <p v-if="!nbaTitles">История чемпионств NBA и BAA пока не подтверждена.</p>
          <p v-else-if="!nbaTitles.length">Франшиза ещё не выигрывала чемпионство NBA.</p>
          <template v-for="group in titleGroups" :key="group.label">
            <template v-if="group.seasons?.length">
              <h4>{{ group.label }}</h4>
              <ul class="team-history-titles">
                <li v-for="title in group.seasons" :key="`${title.league}-${title.season}`">
                  <strong>{{ title.season }}</strong>
                  <span
                    >{{ title.league }} ·
                    {{ eraAt(profile, Number(title.season.slice(0, 4)))?.name }}</span
                  >
                  <TeamHistorySource :source-id="titleSource(profile, title)" />
                </li>
              </ul>
            </template>
          </template>
        </section>
      </div>
      <div class="team-history-body">
        <TeamHistoryTimeline :profile="profile" />
        <div class="team-history-side">
          <TeamHistoryFigures :profile="profile" />
          <section class="team-history-card" aria-labelledby="team-history-gallery">
            <h3 id="team-history-gallery">Галерея</h3>
            <div v-if="media.length" class="team-history-gallery">
              <MediaAttribution v-for="asset in media" :key="asset.assetId" :asset="asset" />
            </div>
            <p v-else>Пока нет фотографий с проверенной лицензией.</p>
          </section>
        </div>
      </div>
    </template>
    <p v-else>Историческая справка для этой команды пока недоступна.</p>
  </section>
</template>
