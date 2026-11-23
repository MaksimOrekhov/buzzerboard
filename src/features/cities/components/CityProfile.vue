<script setup lang="ts">
import '../cities.css'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { arenaPath } from '@/entities/nba/arenaDirectory'
import { CITIES, cityMapUrl, cityPath, getCity } from '@/entities/nba/cityDirectory'
import AppIcon from '@/shared/components/AppIcon.vue'
import MediaAttribution from '@/shared/components/MediaAttribution.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import { formatCityNumber } from '../catalog'
import CityLocalTime from './CityLocalTime.vue'
import CitySourceLink from './CitySourceLink.vue'

const route = useRoute()
const city = computed(() =>
  typeof route.params.cityId === 'string' ? getCity(route.params.cityId) : undefined,
)
const boroughs = computed(() =>
  city.value ? CITIES.filter(({ boroughOf }) => boroughOf === city.value?.id) : [],
)
const parent = computed(() => (city.value?.boroughOf ? getCity(city.value.boroughOf) : undefined))
</script>

<template>
  <div v-if="city" class="city-guide city-profile">
    <nav class="city-breadcrumb" aria-label="Навигация по справочнику">
      <RouterLink :to="{ name: 'cities' }">← Каталог городов</RouterLink>
    </nav>
    <PageHeading
      eyebrow="City Guide"
      :title="city.name"
      :description="`${city.nameEn} · ${city.region} · ${city.countryName}`"
      :title-dot="false"
    />
    <section
      class="city-hero"
      :class="{ 'city-hero--facts': !city.photo }"
      aria-labelledby="about-city-title"
    >
      <div class="city-hero__body">
        <span class="city-kicker">{{ city.geography.value }}</span>
        <h2 id="about-city-title">О городе</h2>
        <p>{{ city.description.value }}</p>
        <CitySourceLink :source="city.description">Источник описания</CitySourceLink>
        <div class="city-hero__stats">
          <div v-if="city.population">
            <strong>{{ formatCityNumber(city.population.value) }}</strong>
            <span>жителей · {{ city.population.asOf.slice(0, 4) }}</span>
          </div>
          <div v-if="city.landArea">
            <strong>{{ formatCityNumber(city.landArea.value) }}</strong>
            <span>км² суши · {{ city.landArea.asOf.slice(0, 4) }}</span>
          </div>
        </div>
      </div>
      <MediaAttribution
        v-if="city.photo"
        :key="city.photo.assetId"
        :asset="city.photo"
        compact
        class="city-hero__photo"
      />
      <div v-else class="city-hero__locator">
        <AppIcon name="globe" :size="32" />
        <strong>{{ city.nameEn }}</strong>
        <span>{{ city.regionEn }} · {{ city.country }}</span>
        <span>Панорама с проверенной лицензией пока недоступна</span>
      </div>
    </section>

    <div class="city-profile__grid">
      <section class="city-panel" aria-labelledby="city-facts-title">
        <h2 id="city-facts-title">География и время</h2>
        <dl class="city-facts">
          <div>
            <dt>Территория</dt>
            <dd>{{ city.boundary }}<CitySourceLink :source="city.geography" /></dd>
          </div>
          <div>
            <dt>Местное время</dt>
            <dd>
              <CityLocalTime :time-zone="city.timeZone.value" /><small
                >{{ city.timeZone.value }} · с учётом правил DST</small
              >
              <CitySourceLink :source="city.timeZone" /><CitySourceLink :source="city.timeRules" />
            </dd>
          </div>
          <div v-if="city.population">
            <dt>Численность</dt>
            <dd>
              {{ formatCityNumber(city.population.value) }} чел. · {{ city.boundary }}
              <CitySourceLink :source="city.population" />
            </dd>
          </div>
          <div v-if="city.landArea">
            <dt>Площадь суши</dt>
            <dd>
              {{ formatCityNumber(city.landArea.value) }} км² · {{ city.boundary }}
              <CitySourceLink :source="city.landArea" />
            </dd>
          </div>
          <div v-if="city.established">
            <dt>{{ city.established.label }}</dt>
            <dd>
              {{ city.established.value
              }}<CitySourceLink :source="city.established">Исторический источник</CitySourceLink>
            </dd>
          </div>
        </dl>
        <RouterLink v-if="parent" :to="cityPath(parent)" class="ui-text-link">
          В составе города {{ parent.name }} <AppIcon name="arrow-up-right" :size="14" />
        </RouterLink>
        <RouterLink
          v-for="borough in boroughs"
          :key="borough.id"
          :to="cityPath(borough)"
          class="ui-text-link"
        >
          Боро {{ borough.name }} <AppIcon name="arrow-up-right" :size="14" />
        </RouterLink>
      </section>

      <section class="city-panel" aria-labelledby="city-map-title">
        <h2 id="city-map-title">На карте</h2>
        <div class="city-map-point">
          <AppIcon name="pin" :size="28" />
          <strong>{{ city.name }}</strong>
          <template v-if="city.center">
            <span
              >{{ city.center.value.lat.toFixed(4) }}°,
              {{ city.center.value.lon.toFixed(4) }}°</span
            >
            <small
              >Ориентир {{ city.kind === 'borough' ? 'в центре боро' : 'в центре города' }}</small
            >
          </template>
          <span v-else>{{ city.region }} · {{ city.countryName }}</span>
        </div>
        <CitySourceLink v-if="city.center" :source="city.center" />
        <a :href="cityMapUrl(city)" target="_blank" rel="noopener noreferrer" class="gc-control">
          {{ city.center ? 'Открыть на OpenStreetMap' : 'Найти на OpenStreetMap' }}
          <AppIcon name="arrow-up-right" :size="16" />
        </a>
        <a
          class="city-source"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          >© OpenStreetMap contributors</a
        >
      </section>
    </div>

    <section class="city-panel" aria-labelledby="city-teams-title">
      <h2 id="city-teams-title">Франшиза и домашняя арена</h2>
      <div
        v-for="{ team, arena, brandArea, arenaLocality } in city.assignments"
        :key="team.code"
        class="city-tenancy"
      >
        <div>
          <RouterLink
            :to="{ name: 'team-profile', params: { teamCode: team.code } }"
            class="city-tenancy__link"
          >
            <AppIcon name="basketball" :size="20" /> {{ team.name }}
            <AppIcon name="arrow-up-right" :size="15" />
          </RouterLink>
          <template v-if="brandArea">
            <p>География бренда · {{ brandArea.value.name }} ({{ brandArea.value.kind }})</p>
            <CitySourceLink :source="brandArea" />
            <RouterLink
              v-if="brandArea.value.relatedCityId"
              :to="{ name: 'city-profile', params: { cityId: brandArea.value.relatedCityId } }"
              class="ui-text-link"
            >
              Город бренда
            </RouterLink>
          </template>
        </div>
        <div>
          <RouterLink :to="arenaPath(arena)" class="city-tenancy__link">
            <AppIcon name="pin" :size="20" /> {{ arena.name }}
            <AppIcon name="arrow-up-right" :size="15" />
          </RouterLink>
          <p>
            Муниципалитет арены · {{ parent?.name ?? city.name
            }}<template v-if="arenaLocality || parent">
              · {{ arenaLocality?.value.name ?? city.name }}</template
            >
          </p>
          <p v-if="arena.address">{{ arena.address.value }}</p>
          <CitySourceLink :source="city.identity" />
          <template v-if="arena.occupants">
            <p>Другие команды арены · {{ arena.occupants.value.join(', ') }}</p>
            <CitySourceLink :source="{ ...arena.occupants, label: 'Источник по командам арены' }" />
          </template>
        </div>
      </div>
    </section>
  </div>

  <ResourceState
    v-else
    status="empty"
    icon="pin"
    title="Город не найден"
    description="Выберите место из справочника NBA."
  >
    <template #action
      ><RouterLink :to="{ name: 'cities' }" class="gc-control"
        >Каталог городов</RouterLink
      ></template
    >
  </ResourceState>
</template>
