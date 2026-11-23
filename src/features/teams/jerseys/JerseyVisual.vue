<script setup lang="ts">
import { computed } from 'vue'
import {
  getClearedJerseyMedia,
  JERSEY_COLORS,
  type VerifiedJersey,
} from '@/entities/nba/jerseyDirectory'
import MediaAttribution from '@/shared/components/MediaAttribution.vue'

const props = defineProps<{ jersey: VerifiedJersey }>()
const asset = computed(() => getClearedJerseyMedia(props.jersey))
const colors = computed(() => props.jersey.palette.map((key) => JERSEY_COLORS[key]))
</script>

<template>
  <MediaAttribution v-if="asset" :asset="asset" compact />
  <div v-else class="jersey-visual" :class="{ 'jersey-visual--empty': !colors.length }">
    <template v-if="colors.length">
      <div class="jersey-swatches" aria-hidden="true">
        <span
          v-for="color in colors"
          :key="color.label"
          :style="{ backgroundColor: color.sample }"
        />
      </div>
      <p>
        <span>Палитра</span>
        <span>{{ colors.map(({ label }) => label.toLowerCase()).join(' · ') }}</span>
      </p>
    </template>
    <p v-else>Палитра не подтверждена</p>
  </div>
</template>
