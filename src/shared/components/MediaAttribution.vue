<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { isReviewedTeamMediaAsset, type TeamMediaAsset } from '@/entities/nba/teamMediaManifest'

const props = defineProps<{ asset: TeamMediaAsset }>()
const failed = shallowRef(false)
const reviewedAsset = computed(() => (isReviewedTeamMediaAsset(props.asset) ? props.asset : null))

watch(
  () => props.asset.publicPath,
  () => {
    failed.value = false
  },
)
</script>

<template>
  <figure class="media-attribution">
    <img
      v-if="reviewedAsset && !failed"
      :src="reviewedAsset.publicPath"
      :alt="reviewedAsset.alt"
      :width="reviewedAsset.width"
      :height="reviewedAsset.height"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    />
    <div
      v-else
      class="media-attribution__fallback"
      role="img"
      :aria-label="reviewedAsset?.alt ?? 'Медиа не прошло проверку лицензии и источника'"
    >
      {{ reviewedAsset ? 'Изображение временно недоступно' : 'Изображение не прошло проверку' }}
    </div>
    <figcaption v-if="reviewedAsset" class="media-attribution__caption">
      <p class="media-attribution__title">{{ reviewedAsset.title }}</p>
      <p class="media-attribution__description">{{ reviewedAsset.description }}</p>
      <p class="media-attribution__date">Снято: {{ reviewedAsset.capturedAt }}</p>
      <p class="media-attribution__links">
        <span>Автор: {{ reviewedAsset.author }}</span>
        <a :href="reviewedAsset.sourceUrl" target="_blank" rel="noopener noreferrer">
          Файл на Wikimedia Commons
        </a>
        <a :href="reviewedAsset.licenseUrl" target="_blank" rel="noopener noreferrer">
          {{ reviewedAsset.license }}
        </a>
      </p>
      <p class="media-attribution__changes">Изменения: {{ reviewedAsset.modifications }}</p>
    </figcaption>
    <figcaption v-else class="media-attribution__fallback-copy">
      Медиа не показано: лицензия, источник или ссылка на локальный файл не прошли проверку.
    </figcaption>
  </figure>
</template>

<style scoped>
.media-attribution {
  overflow: hidden;
  max-width: 100%;
  margin: 0;
  border: 1px solid var(--gc-line, #272e3d);
  border-radius: var(--gc-radius, 12px);
  background: var(--gc-panel, #151a24);
  color: var(--gc-text, #f1f4fa);
}

.media-attribution img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
}

.media-attribution__caption {
  padding: var(--gc-space-sm, 8px) var(--gc-space-md, 16px) var(--gc-space-md, 16px);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.media-attribution__caption p {
  margin: 0;
}

.media-attribution__title {
  font-weight: 700;
}

.media-attribution__description,
.media-attribution__date,
.media-attribution__changes {
  margin-top: var(--gc-space-xs, 4px) !important;
  color: var(--gc-muted, #95a1b5);
}

.media-attribution__links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gc-space-sm, 8px);
  margin-top: var(--gc-space-sm, 8px) !important;
  color: var(--gc-secondary, #c4ccda);
}

.media-attribution a {
  color: var(--gc-accent, #70c8ef);
  text-underline-offset: 2px;
}

.media-attribution__fallback,
.media-attribution__fallback-copy {
  color: var(--gc-muted, #95a1b5);
  background: var(--gc-panel-hover, #1b2230);
}

.media-attribution__fallback {
  display: grid;
  min-height: 8rem;
  place-items: center;
  padding: var(--gc-space-md, 16px);
  text-align: center;
}

.media-attribution__fallback-copy {
  padding: var(--gc-space-sm, 8px) var(--gc-space-md, 16px);
  font-size: 0.8125rem;
}
</style>
