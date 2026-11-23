<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { cityPath, type City } from '@/entities/nba/cityDirectory'
import AppIcon from '@/shared/components/AppIcon.vue'
import MediaAttribution from '@/shared/components/MediaAttribution.vue'
import { formatCityNumber } from '../catalog'

defineProps<{ city: City }>()
</script>

<template>
  <article class="city-card">
    <MediaAttribution v-if="city.photo" :asset="city.photo" class="city-card__photo" compact />
    <div class="city-card__copy">
      <span class="city-kicker">{{ city.geography.value }} · {{ city.countryName }}</span>
      <h3>
        <RouterLink :to="cityPath(city)">
          {{ city.name }}<AppIcon name="arrow-up-right" :size="16" />
        </RouterLink>
      </h3>
      <p>{{ city.region }} · {{ city.assignments.map(({ team }) => team.name).join(', ') }}</p>
      <p v-if="city.population" class="city-card__measure">
        <strong>{{ formatCityNumber(city.population.value) }}</strong>
        <span>{{ city.population.asOf.slice(0, 4) }} · {{ city.boundary }}</span>
      </p>
      <p v-else class="city-card__measure">Численность не подтверждена</p>
      <p v-if="city.landArea" class="city-card__measure">
        <strong>{{ formatCityNumber(city.landArea.value) }} км²</strong>
        <span>суша · {{ city.landArea.asOf.slice(0, 4) }}</span>
      </p>
    </div>
  </article>
</template>
