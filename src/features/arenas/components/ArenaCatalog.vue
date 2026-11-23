<script setup lang="ts">
import '../arenas.css'
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ARENAS, arenaPath, getTeamArena } from '@/entities/nba/arenaDirectory'
import { getArenaMedia } from '@/entities/nba/teamMediaManifest'
import AppButton from '@/shared/components/AppButton.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import AppSearch from '@/shared/components/AppSearch.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import AppSelect from '@/shared/components/AppSelect.vue'
import MediaAttribution from '@/shared/components/MediaAttribution.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import { arenaAttributes, arenaConferences, arenaSortOptions, filterArenas } from '../catalog'
import ArenaCard from './ArenaCard.vue'

const route = useRoute()
const router = useRouter()
const cities = [
  { value: 'all', label: 'Все города' },
  ...Array.from(new Map(ARENAS.map((arena) => [arena.cityId, arena.city])))
    .sort((a, b) => a[1].localeCompare(b[1], 'en'))
    .map(([value, city]) => ({ value, label: city.split(',')[0] ?? city })),
]

function update(key: string, value: string, initial: string) {
  const query = { ...route.query }
  if (!value || value === initial) delete query[key]
  else query[key] = value
  void router.replace({ name: 'arenas', query })
}

function queryFilter<T extends string>(key: string, options: readonly { value: T }[], initial: T) {
  return computed<T>({
    get: () => options.find(({ value }) => value === route.query[key])?.value ?? initial,
    set: (value) => update(key, value, initial),
  })
}

const search = computed({
  get: () => (typeof route.query.q === 'string' ? route.query.q : ''),
  set: (value) => update('q', value, ''),
})
const conference = queryFilter('conference', arenaConferences, 'all')
const city = queryFilter('city', cities, 'all')
const attribute = queryFilter('attribute', arenaAttributes, 'all')
const sort = queryFilter('sort', arenaSortOptions, 'name')
const visible = computed(() =>
  filterArenas(ARENAS, {
    search: search.value,
    conference: conference.value,
    city: city.value,
    attribute: attribute.value,
    sort: sort.value,
  }),
)
const visibleTeams = computed(() =>
  visible.value.reduce((total, arena) => total + arena.assignments.length, 0),
)
const hasFilters = computed(() =>
  Boolean(
    search.value ||
    conference.value !== 'all' ||
    city.value !== 'all' ||
    attribute.value !== 'all' ||
    sort.value !== 'name',
  ),
)
const featured = getTeamArena('CHI')
const featuredPhoto = featured ? getArenaMedia(featured.id)[0] : undefined

function reset() {
  void router.replace({ name: 'arenas' })
}
</script>

<template>
  <div class="arena-guide">
    <PageHeading
      eyebrow="Справочник · 2026/27"
      title="Арены NBA"
      :title-dot="false"
      description="Домашние площадки команд, адреса, фотографии и история зданий."
    >
      <template #actions>
        <RouterLink :to="{ name: 'cities' }" class="gc-control">
          <AppIcon name="globe" :size="16" /> Города NBA
        </RouterLink>
      </template>
    </PageHeading>
    <section
      v-if="featured && featuredPhoto"
      class="arena-featured"
      aria-labelledby="arena-featured-title"
    >
      <div class="arena-featured__copy">
        <h2 id="arena-featured-title">{{ featured.name }}</h2>
        <p>{{ featured.city }}</p>
        <p>
          Домашняя площадка {{ featured.assignments.map(({ team }) => team.name).join(', ') }}
          <template v-if="featured.opened"> · открыта в {{ featured.opened.value }} году</template>
        </p>
        <RouterLink :to="arenaPath(featured)" class="gc-control ui-button--primary">
          Открыть арену <AppIcon name="arrow" :size="16" />
        </RouterLink>
      </div>
      <MediaAttribution :asset="featuredPhoto" compact />
    </section>

    <section class="arena-toolbar" aria-labelledby="arena-catalog-heading">
      <h2 id="arena-catalog-heading">Каталог арен</h2>
      <AppSegmented v-model="conference" label="Конференция" :options="arenaConferences" />
      <div class="arena-filters">
        <AppSearch v-model="search" label="Поиск арен" placeholder="Арена, город или команда" />
        <div class="gc-select-field">
          <AppSelect v-model="city" label="Город" :options="cities" show-label />
        </div>
        <div class="gc-select-field">
          <AppSelect
            v-model="attribute"
            label="Данные об арене"
            :options="arenaAttributes"
            show-label
          />
        </div>
        <div class="gc-select-field">
          <AppSelect
            v-model="sort"
            label="Сортировка арен"
            :options="arenaSortOptions"
            show-label
          />
        </div>
      </div>
      <div class="arena-results">
        <p role="status">
          {{ visible.length }} из {{ ARENAS.length }} арен · {{ visibleTeams }} команд NBA
        </p>
        <AppButton v-if="hasFilters" variant="ghost" @click="reset">Сбросить фильтры</AppButton>
      </div>
    </section>

    <div v-if="visible.length" class="arena-grid">
      <ArenaCard v-for="arena in visible" :key="arena.id" :arena="arena" />
    </div>
    <ResourceState
      v-else
      status="empty"
      icon="search"
      title="Арены не найдены"
      description="Попробуйте изменить поиск или фильтры."
    />
  </div>
</template>
