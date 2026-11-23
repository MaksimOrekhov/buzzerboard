<script setup lang="ts">
import './jerseys.css'
import { computed } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import {
  formatJerseySeason,
  getClearedJerseyMedia,
  getTeamJerseys,
  getUnverifiedCurrentTypes,
  JERSEY_COLORS,
  JERSEY_CURRENT_SEASON,
  JERSEY_DATA_AVAILABLE,
  JERSEY_TYPES,
  type JerseyType,
  type VerifiedJersey,
} from '@/entities/nba/jerseyDirectory'
import AppButton from '@/shared/components/AppButton.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import AppSelect from '@/shared/components/AppSelect.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import { filterJerseys, withoutJerseyFilters, type JerseyFilters } from './catalog'
import JerseyCard from './JerseyCard.vue'

const props = defineProps<{ teamCode: string }>()
const route = useRoute()
const router = useRouter()
const sets = computed(() => getTeamJerseys(props.teamCode))
const current = computed(() => sets.value.filter(({ season }) => season === JERSEY_CURRENT_SEASON))
const archive = computed(() => sets.value.filter(({ season }) => season !== JERSEY_CURRENT_SEASON))
const missing = computed(() => getUnverifiedCurrentTypes(sets.value))
const featuredColors = computed(() =>
  (current.value.find(({ palette }) => palette.length)?.palette ?? []).map(
    (key) => JERSEY_COLORS[key],
  ),
)
const anyImages = computed(() => sets.value.some((set) => Boolean(getClearedJerseyMedia(set))))
const views = [
  { value: 'current', label: 'Текущий сезон' },
  { value: 'archive', label: 'Архив' },
] as const
const orderOptions = [
  { value: 'newest', label: 'Сначала новые' },
  { value: 'oldest', label: 'Сначала ранние' },
] as const

function navigate(query: LocationQueryRaw) {
  void router.push({ path: route.path, query })
}

const view = computed<JerseyFilters['view']>({
  get: () =>
    route.query.jerseyView === 'archive' ||
    archive.value.some(({ season }) => route.query.jerseySeason === season)
      ? 'archive'
      : 'current',
  set: (value) => {
    const query: LocationQueryRaw = {
      ...route.query,
      jerseyView: value === 'archive' ? value : undefined,
      jerseySeason: undefined,
    }
    if (value === 'current') delete query.jerseyOrder
    navigate(query)
  },
})
const viewOptions = computed(() => [
  { ...views[0], count: current.value.length },
  { ...views[1], count: archive.value.length },
])
const seasonOptions = computed(() => [
  { value: JERSEY_CURRENT_SEASON, label: formatJerseySeason(JERSEY_CURRENT_SEASON) },
  { value: 'all', label: 'Все сезоны' },
  ...[...new Set(archive.value.map(({ season }) => season))]
    .sort()
    .reverse()
    .map((value) => ({ value, label: formatJerseySeason(value) })),
])
const typeOptions = computed(() => [
  { value: 'all' as const, label: 'Все типы' },
  ...Object.entries(JERSEY_TYPES)
    .filter(([type]) => sets.value.some((set) => set.type === type))
    .map(([value, label]) => ({ value: value as JerseyType, label })),
])

const season = computed({
  get: () =>
    view.value === 'current'
      ? JERSEY_CURRENT_SEASON
      : (archive.value.find(({ season }) => season === route.query.jerseySeason)?.season ?? 'all'),
  set: (value) => {
    const archiveView = value !== JERSEY_CURRENT_SEASON
    navigate({
      ...route.query,
      jerseyView: archiveView ? 'archive' : undefined,
      jerseySeason: archiveView && value !== 'all' ? value : undefined,
      jerseyOrder: archiveView ? route.query.jerseyOrder : undefined,
    })
  },
})
const type = computed({
  get: () =>
    typeOptions.value.find(({ value }) => value === route.query.jerseyType)?.value ?? 'all',
  set: (value) => navigate({ ...route.query, jerseyType: value === 'all' ? undefined : value }),
})
const order = computed<JerseyFilters['order']>({
  get: () => (route.query.jerseyOrder === 'oldest' ? 'oldest' : 'newest'),
  set: (value) => navigate({ ...route.query, jerseyOrder: value === 'newest' ? undefined : value }),
})
const seasons = computed(() => {
  const grouped = new Map<string, VerifiedJersey[]>()
  const shown = filterJerseys(
    sets.value,
    { view: view.value, season: season.value, type: type.value, order: order.value },
    JERSEY_CURRENT_SEASON,
  )
  for (const jersey of shown) {
    const group = grouped.get(jersey.season)
    if (group) group.push(jersey)
    else grouped.set(jersey.season, [jersey])
  }
  return [...grouped]
})
const filtered = computed(
  () =>
    (view.value === 'archive' && season.value !== 'all') ||
    type.value !== 'all' ||
    order.value !== 'newest',
)

function reset() {
  navigate({
    ...withoutJerseyFilters(route.query),
    jerseyView: view.value === 'archive' ? 'archive' : undefined,
  })
}
</script>

<template>
  <section class="jersey-panel" aria-labelledby="jerseys-heading">
    <header class="jersey-hero">
      <div class="jersey-hero__copy">
        <p class="jersey-kicker">Коллекция франшизы</p>
        <h2 id="jerseys-heading">Форма</h2>
        <p>Игровые комплекты по сезонам, их цвета и история дизайна.</p>
      </div>
      <div class="jersey-hero__season">
        <span>Текущий сезон</span>
        <strong>{{ formatJerseySeason(JERSEY_CURRENT_SEASON) }}</strong>
        <div v-if="featuredColors.length" class="jersey-hero__palette" aria-hidden="true">
          <span
            v-for="color in featuredColors"
            :key="color.label"
            :style="{ backgroundColor: color.sample }"
          />
        </div>
      </div>
    </header>

    <ResourceState
      v-if="!JERSEY_DATA_AVAILABLE"
      status="error"
      title="Справочник формы недоступен"
      icon="database"
    />
    <template v-else>
      <div class="jersey-toolbar">
        <AppSegmented v-model="view" label="Коллекция формы" :options="viewOptions" />
        <div class="jersey-filters">
          <div>
            <AppSelect v-model="season" label="Сезон" :options="seasonOptions" show-label />
          </div>
          <div><AppSelect v-model="type" label="Тип" :options="typeOptions" show-label /></div>
          <div v-if="view === 'archive'">
            <AppSelect v-model="order" label="Сортировка" :options="orderOptions" show-label />
          </div>
        </div>
        <div class="jersey-toolbar__note">
          <p v-if="!anyImages">
            Цветовые образцы показывают палитру формы. Фото с подтверждёнными правами пока
            недоступны.
          </p>
          <AppButton v-if="filtered" variant="ghost" @click="reset">Сбросить фильтры</AppButton>
        </div>
      </div>

      <ResourceState
        v-if="!seasons.length"
        status="empty"
        icon="search"
        :title="filtered ? 'Комплекты не найдены' : 'Подтверждённых комплектов пока нет'"
        :description="
          filtered
            ? 'Измените сезон или тип формы.'
            : 'Здесь появятся комплекты с проверенным сезоном и источником.'
        "
      />
      <section
        v-for="[year, jerseys] in seasons"
        :key="year"
        class="jersey-season"
        :class="{ 'jersey-season--archive': view === 'archive' }"
        :aria-label="'Подборка ' + formatJerseySeason(year)"
      >
        <header class="jersey-season__heading">
          <h3>{{ formatJerseySeason(year) }}</h3>
          <span>Проверенная подборка · {{ jerseys.length }}</span>
        </header>
        <div class="jersey-grid">
          <JerseyCard
            v-for="jersey in jerseys"
            :key="jersey.jerseyId"
            :jersey="jersey"
            :team-code="teamCode"
          />
        </div>
      </section>
      <p v-if="view === 'current' && missing.length" class="jersey-coverage">
        Пока нет подтверждения для следующих типов в этом сезоне:
        {{ missing.map((type) => JERSEY_TYPES[type]).join(', ') }}.
      </p>
    </template>
  </section>
</template>
