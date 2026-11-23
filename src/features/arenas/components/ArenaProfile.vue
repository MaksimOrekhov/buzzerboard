<script setup lang="ts">
import '../arenas.css'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { arenaMapUrl, getArena } from '@/entities/nba/arenaDirectory'
import { getArenaMedia, getCityMediaForTeam } from '@/entities/nba/teamMediaManifest'
import AppIcon from '@/shared/components/AppIcon.vue'
import MediaAttribution from '@/shared/components/MediaAttribution.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import ArenaFactsPanel from './ArenaFactsPanel.vue'
import ArenaSource from './ArenaSource.vue'
import ArenaTenancy from './ArenaTenancy.vue'

const route = useRoute()
const arena = computed(() =>
  typeof route.params.arenaId === 'string' ? getArena(route.params.arenaId) : undefined,
)
const photos = computed(() => (arena.value ? getArenaMedia(arena.value.id) : []))
const cityPhoto = computed(() => {
  const code = arena.value?.assignments[0]?.team.code
  return code ? getCityMediaForTeam(code) : null
})
</script>

<template>
  <div v-if="arena" class="arena-guide arena-profile">
    <nav class="arena-back" aria-label="Навигация по справочнику">
      <RouterLink :to="{ name: 'arenas' }">← Каталог арен</RouterLink>
    </nav>
    <PageHeading
      eyebrow="Домашняя арена NBA"
      :title="arena.name"
      :description="arena.city"
      :title-dot="false"
    />
    <div class="arena-profile-grid" :class="{ 'arena-profile-grid--photo': photos[0] }">
      <MediaAttribution
        v-if="photos[0]"
        :key="photos[0].assetId"
        class="arena-cover"
        :asset="photos[0]"
      />
      <ArenaFactsPanel :arena="arena" />
    </div>

    <div class="arena-profile-grid">
      <ArenaTenancy :arena="arena" />
      <section class="arena-panel" aria-labelledby="arena-location-heading">
        <h2 id="arena-location-heading">Расположение</h2>
        <p v-if="arena.address" class="arena-address">{{ arena.address.value }}</p>
        <ArenaSource v-if="arena.address" :source="arena.address">Адрес на сайте арены</ArenaSource>
        <p v-else>Точный адрес пока не подтверждён.</p>
        <p v-if="arena.coordinates" class="arena-coordinate-row">
          <span>{{ arena.coordinates.value.lat }}, {{ arena.coordinates.value.lon }}</span>
          <ArenaSource :source="arena.coordinates">Координаты в Wikidata</ArenaSource>
        </p>
        <a :href="arenaMapUrl(arena)" target="_blank" rel="noopener noreferrer" class="gc-control">
          {{ arena.coordinates ? 'Открыть на OpenStreetMap' : 'Найти адрес на OpenStreetMap' }}
          <AppIcon name="arrow-up-right" :size="15" />
        </a>
        <p class="arena-meta">
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            >© OpenStreetMap contributors</a
          >
        </p>
        <RouterLink :to="{ name: 'arenas', query: { city: arena.cityId } }" class="arena-city-link">
          Арены в этом городе
        </RouterLink>
        <details v-if="cityPhoto" class="arena-city-media">
          <summary>Фотография города</summary>
          <MediaAttribution :key="cityPhoto.assetId" :asset="cityPhoto" />
        </details>
      </section>
    </div>

    <section
      v-if="arena.formerNames.length"
      class="arena-panel"
      aria-labelledby="arena-names-heading"
    >
      <h2 id="arena-names-heading">Прежние названия</h2>
      <ul class="arena-history-list">
        <li v-for="period in arena.formerNames" :key="period.from">
          <strong>{{ period.name }}</strong>
          <span
            ><time :datetime="period.from">{{ period.from }}</time> —
            <time :datetime="period.until">{{ period.until }}</time></span
          >
          <ArenaSource :source="period" />
        </li>
      </ul>
    </section>

    <section class="arena-panel" aria-labelledby="arena-gallery-heading">
      <h2 id="arena-gallery-heading">Галерея</h2>
      <div v-if="photos.length > 1" class="arena-gallery">
        <MediaAttribution v-for="photo in photos.slice(1)" :key="photo.assetId" :asset="photo" />
      </div>
      <p v-else-if="photos.length">Фотография фасада доступна в начале страницы.</p>
      <p v-else>Фотографий с проверенной лицензией пока нет.</p>
    </section>

    <section class="arena-panel" aria-labelledby="arena-results-heading">
      <h2 id="arena-results-heading">Домашние результаты</h2>
      <p>
        Для статистики арены нужны подтверждённое место проведения каждого матча и полный срез
        периода. В доступном снимке BBS такой привязки нет.
      </p>
      <ul class="arena-history-list">
        <li v-for="{ team } in arena.assignments" :key="team.code">
          <RouterLink :to="{ name: 'team-profile', params: { teamCode: team.code } }">
            Сезонная статистика {{ team.name }}
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>

  <ResourceState
    v-else
    status="empty"
    icon="pin"
    title="Арена не найдена"
    description="Откройте каталог, чтобы найти домашнюю площадку команды NBA."
  >
    <template #action
      ><RouterLink :to="{ name: 'arenas' }" class="gc-control">Каталог арен</RouterLink></template
    >
  </ResourceState>
</template>
