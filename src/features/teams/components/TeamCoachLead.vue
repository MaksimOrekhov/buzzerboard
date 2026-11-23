<script setup lang="ts">
import { computed } from 'vue'
import { COACHING_DIRECTORY, type CoachingAssignment } from '@/entities/nba/coachingDirectory'
import { getPersonMedia } from '@/entities/nba/teamMediaManifest'
import MediaAttribution from '@/shared/components/MediaAttribution.vue'
import CoachSource from './CoachSource.vue'

const props = defineProps<{ appointment: CoachingAssignment; stale: boolean }>()
const person = computed(() => COACHING_DIRECTORY.people[props.appointment.personId])
const source = computed(() => COACHING_DIRECTORY.sources[props.appointment.source])
const media = computed(() => getPersonMedia(props.appointment.personId))
</script>

<template>
  <section
    v-if="person"
    class="coach-card coach-lead"
    :class="{ 'coach-lead--with-portrait': media.length }"
    aria-labelledby="coach-lead-heading"
  >
    <header>
      <p class="coach-job">
        {{
          appointment.status === 'interim'
            ? 'Исполняющий обязанности главного тренера'
            : 'Главный тренер'
        }}
      </p>
      <h3 id="coach-lead-heading">{{ person.name }}</h3>
    </header>
    <aside v-if="media.length" class="coach-portraits" aria-label="Портреты тренера">
      <MediaAttribution v-for="asset in media" :key="asset.assetId" :asset="asset" portrait />
    </aside>
    <div class="coach-lead-details">
      <p v-if="stale" class="gc-notice gc-notice--warning">
        Последнее подтверждённое назначение. Нужна повторная сверка.
      </p>
      <div class="coach-links coach-muted">
        <span v-if="source"
          >Сверено <time :datetime="source.asOf">{{ source.asOf }}</time></span
        >
        <CoachSource :source-id="appointment.source">Источник должности</CoachSource>
      </div>
      <p v-if="!media.length" class="coach-photo-placeholder">
        Портрет с проверенной лицензией пока недоступен.
      </p>
      <dl class="coach-facts">
        <div>
          <dt>Дата назначения</dt>
          <dd>
            <time v-if="appointment.validFrom" :datetime="appointment.validFrom">{{
              appointment.validFrom
            }}</time>
            <span v-else>Нет подтверждения</span>
            <CoachSource v-if="appointment.startSource" :source-id="appointment.startSource" />
          </dd>
        </div>
        <div>
          <dt>Национальность</dt>
          <dd>
            {{ person.nationality?.value ?? 'Нет подтверждения' }}
            <CoachSource v-if="person.nationality" :source-id="person.nationality.source" />
          </dd>
        </div>
        <div>
          <dt>Дата рождения</dt>
          <dd>
            <time v-if="person.birthDate" :datetime="person.birthDate.value">{{
              person.birthDate.value
            }}</time>
            <span v-else>Нет подтверждения</span>
            <CoachSource v-if="person.birthDate" :source-id="person.birthDate.source" />
          </dd>
        </div>
        <div class="coach-bio">
          <dt>Карьера</dt>
          <dd>
            {{ person.career?.value ?? 'Нет подтверждённых сведений' }}
            <CoachSource v-if="person.career" :source-id="person.career.source" />
          </dd>
        </div>
        <div v-if="person.achievement" class="coach-bio">
          <dt>Достижения</dt>
          <dd>
            {{ person.achievement.value }}
            <CoachSource :source-id="person.achievement.source" />
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>
