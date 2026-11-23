<script setup lang="ts">
import '../cities.css'
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { CITIES, CITY_FRANCHISE_COUNT, cityPath, getTeamCity } from '@/entities/nba/cityDirectory'
import AppButton from '@/shared/components/AppButton.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import AppSearch from '@/shared/components/AppSearch.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import AppSelect from '@/shared/components/AppSelect.vue'
import MediaAttribution from '@/shared/components/MediaAttribution.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import {
  cityAttributes,
  cityConferences,
  cityRegions,
  citySorts,
  filterCities,
  readCityFilters,
  type CityFilters,
} from '../catalog'
import CityCard from './CityCard.vue'

const route = useRoute()
const router = useRouter()
const filters = computed(() => readCityFilters(route.query))
const defaults = readCityFilters({})
const featured = getTeamCity('TOR')
const shown = computed(() => filterCities(CITIES, filters.value))
const filtered = computed(() =>
  Object.keys(defaults).some(
    (key) => filters.value[key as keyof CityFilters] !== defaults[key as keyof CityFilters],
  ),
)

function filterModel<K extends keyof CityFilters>(key: K) {
  return computed({
    get: () => filters.value[key],
    set: (value: CityFilters[K]) => {
      if (filters.value[key] === value) return
      const query = { ...route.query }
      if (value === defaults[key]) delete query[key]
      else query[key] = value
      const location = { name: 'cities', query }
      if (key === 'q' && route.query.q) void router.replace(location)
      else void router.push(location)
    },
  })
}
const search = filterModel('q')
const conference = filterModel('conference')
const region = filterModel('region')
const attribute = filterModel('attribute')
const sort = filterModel('sort')
</script>

<template>
  <div class="city-guide">
    <PageHeading
      eyebrow="City Guide"
      title="Города NBA"
      description="Домашние города команд, панорамы и местное время."
      :title-dot="false"
    >
      <template #actions>
        <RouterLink :to="{ name: 'arenas' }" class="gc-control">
          <AppIcon name="pin" :size="16" /> Арены NBA
        </RouterLink>
      </template>
    </PageHeading>
    <section v-if="featured" class="city-hero" aria-labelledby="city-featured-title">
      <div class="city-hero__body">
        <span class="city-kicker">{{ featured.region }} · {{ featured.countryName }}</span>
        <h2 id="city-featured-title">{{ featured.name }}</h2>
        <p>Панорама с островов Торонто и домашний город Raptors на берегу озера Онтарио.</p>
        <RouterLink :to="cityPath(featured)" class="gc-control ui-button--primary">
          Открыть Торонто <AppIcon name="arrow-up-right" :size="16" />
        </RouterLink>
        <div class="city-hero__stats">
          <div>
            <strong>{{ CITY_FRANCHISE_COUNT }}</strong><span>франшиз</span>
          </div>
          <div>
            <strong>{{ CITIES.length }}</strong><span>уникальных мест</span>
          </div>
        </div>
      </div>
      <MediaAttribution
        v-if="featured.photo"
        :asset="featured.photo"
        compact
        class="city-hero__photo"
      />
    </section>

    <section class="city-toolbar city-panel" aria-labelledby="city-catalog-heading">
      <h2 id="city-catalog-heading">Каталог городов</h2>
      <AppSegmented v-model="conference" label="Конференция городов" :options="cityConferences" />
      <div class="city-filters">
        <AppSearch v-model="search" label="Поиск городов" placeholder="Город, команда или штат" />
        <AppSelect v-model="region" label="Страна или регион" :options="cityRegions" />
        <AppSelect v-model="attribute" label="Данные о городе" :options="cityAttributes" />
        <AppSelect v-model="sort" label="Сортировка городов" :options="citySorts" />
      </div>
      <div class="city-toolbar__status">
        <span aria-live="polite">Мест показано {{ shown.length }} из {{ CITIES.length }}</span>
        <AppButton v-if="filtered" variant="ghost" @click="router.push({ name: 'cities' })">
          Сбросить фильтры
        </AppButton>
      </div>
      <p v-if="sort !== 'name'" class="city-sort-note">
        {{
          sort === 'population'
            ? 'Срезы населения США за 2025 год и Канады за 2021 год.'
            : 'Площадь суши США за 2020 год и Канады за 2021 год.'
        }}
        Границы указаны у каждого места. Нью-Йорк включает Бруклин.
      </p>
    </section>

    <div v-if="shown.length" class="city-grid" aria-label="Места NBA">
      <CityCard v-for="city in shown" :key="city.id" :city="city" />
    </div>
    <ResourceState
      v-else
      status="empty"
      icon="search"
      title="Города не найдены"
      description="Измените запрос или сбросьте фильтры."
    />
  </div>
</template>
