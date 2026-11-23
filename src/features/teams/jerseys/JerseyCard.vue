<script setup lang="ts">
import { computed, useId } from 'vue'
import {
  JERSEY_TYPES,
  formatJerseySeason,
  type VerifiedJersey,
} from '@/entities/nba/jerseyDirectory'
import { eraAt, getTeamHistory } from '@/entities/nba/teamHistory'
import AppIcon from '@/shared/components/AppIcon.vue'
import JerseyVisual from './JerseyVisual.vue'

const props = defineProps<{ jersey: VerifiedJersey; teamCode: string }>()
const headingId = useId()
const era = computed(() => {
  const history = getTeamHistory(props.teamCode)
  return history ? eraAt(history, Number(props.jersey.season.slice(0, 4))) : undefined
})
const labelDate = (date: string) => date.split('-').reverse().join('.')
</script>

<template>
  <article class="jersey-card" :aria-labelledby="headingId">
    <JerseyVisual :jersey="jersey" />
    <div class="jersey-card__content">
      <span class="jersey-kicker"
        >{{ formatJerseySeason(jersey.season) }} · {{ JERSEY_TYPES[jersey.type] }}</span
      >
      <h4 :id="headingId">{{ jersey.name ?? JERSEY_TYPES[jersey.type] }}</h4>
      <p>{{ jersey.description }}</p>
      <details class="jersey-provenance">
        <summary>Происхождение и даты</summary>
        <dl>
          <div v-if="era">
            <dt>Команда в этот период</dt>
            <dd>{{ era.name }} · {{ era.city }}</dd>
          </div>
          <div v-if="jersey.announcedOn">
            <dt>Объявление</dt>
            <dd>
              <time :datetime="jersey.announcedOn">{{ labelDate(jersey.announcedOn) }}</time>
            </dd>
          </div>
          <div v-if="jersey.outfitDate">
            <dt>В календаре формы</dt>
            <dd>
              <time :datetime="jersey.outfitDate">{{ labelDate(jersey.outfitDate) }}</time>
            </dd>
          </div>
          <div>
            <dt>Источник проверен</dt>
            <dd>
              <time :datetime="jersey.sourceAsOf">{{ labelDate(jersey.sourceAsOf) }}</time>
            </dd>
          </div>
        </dl>
        <a
          v-if="jersey.designSourceUrl"
          :href="jersey.designSourceUrl"
          class="ui-text-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          Источник описания дизайна <AppIcon name="arrow-up-right" :size="14" />
        </a>
      </details>
      <a
        :href="jersey.sourceUrl"
        class="ui-text-link jersey-card__source"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{
          jersey.sourceUrl.includes('lockervision.nba.com') ? 'NBA LockerVision' : 'Источник NBA'
        }}
        <AppIcon name="arrow-up-right" :size="14" />
      </a>
    </div>
  </article>
</template>
