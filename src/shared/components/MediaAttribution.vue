<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { isApprovedTeamMediaAsset, type TeamMediaAsset } from '@/entities/nba/teamMediaManifest'

const props = defineProps<{ asset: TeamMediaAsset }>()
const failed = shallowRef(false)

watch(
  () => props.asset.publicPath,
  () => {
    failed.value = false
  },
)
</script>

<template>
  <figure v-if="isApprovedTeamMediaAsset(asset)" class="media-attribution">
    <img
      v-if="!failed"
      :src="asset.publicPath"
      :alt="asset.attribution"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    />
    <div v-else class="media-attribution__fallback" role="img" :aria-label="asset.attribution">
      Image unavailable
    </div>
    <figcaption>
      {{ asset.attribution }}
      <a :href="asset.licenseUrl" target="_blank" rel="noopener noreferrer">{{ asset.license }}</a>
      <span v-if="asset.modifications !== 'none'"> · Modified: {{ asset.modifications }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.media-attribution {
  margin: 0;
  max-width: 100%;
}
.media-attribution img {
  display: block;
  max-width: 100%;
  height: auto;
}
.media-attribution figcaption {
  margin-top: 0.375rem;
  font-size: 0.75rem;
  line-height: 1.4;
}
.media-attribution__fallback {
  display: grid;
  min-height: 8rem;
  place-items: center;
  background: #f3f4f6;
  color: #4b5563;
}
</style>
