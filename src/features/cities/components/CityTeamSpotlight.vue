<script setup lang="ts">
import '../cities.css'
import { RouterLink } from 'vue-router'
import { cityPath, type City } from '@/entities/nba/cityDirectory'
import AppIcon from '@/shared/components/AppIcon.vue'
import MediaAttribution from '@/shared/components/MediaAttribution.vue'

defineProps<{ city: City }>()
</script>

<template>
  <section class="city-hero city-team-spotlight" aria-labelledby="team-city-heading">
    <div class="city-hero__body">
      <span class="city-kicker">Домашний город · {{ city.countryName }}</span>
      <h2 id="team-city-heading">{{ city.name }}</h2>
      <p>{{ city.region }} · {{ city.geography.value }}</p>
      <RouterLink :to="cityPath(city)" class="ui-text-link">
        Профиль города <AppIcon name="arrow-up-right" :size="15" />
      </RouterLink>
    </div>
    <MediaAttribution
      v-if="city.photo"
      :key="city.photo.assetId"
      :asset="city.photo"
      compact
      class="city-hero__photo"
    />
  </section>
</template>
