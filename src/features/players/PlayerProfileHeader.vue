<script setup lang="ts">
import { computed } from 'vue'
import type { PlayerResponse } from '@/entities/nba/players'
import { findNbaTeam } from '@/entities/nba/teamCatalog'
import AppButton from '@/shared/components/AppButton.vue'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import TeamProfileLink from '@/shared/components/TeamProfileLink.vue'
import { formatFreshness, refreshPhaseLabel } from './playerFreshness'

const { profile, favorite } = defineProps<{ profile: PlayerResponse; favorite: boolean }>()
defineEmits<{ toggleFavorite: [] }>()

const initials = computed(() =>
  profile.player.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('')
    .toUpperCase(),
)
const catalog = computed(() => findNbaTeam(profile.player.team ?? ''))
const current = computed(() => findNbaTeam(profile.detail?.currentTeam ?? ''))
const teams = computed(() => {
  if (catalog.value && catalog.value.code === current.value?.code) {
    return [{ label: 'Команда в каталоге сезона и профиле BBS', team: current.value }]
  }
  return [
    { label: 'В каталоге сезона', team: catalog.value },
    { label: 'Текущая по профилю BBS', team: current.value },
  ]
})
const facts = computed(() => {
  const { player, detail } = profile
  const birth = detail?.birthDate
  const observation = detail?.profileAt?.slice(0, 10)
  const age =
    birth && observation && observation > birth
      ? Number(observation.slice(0, 4)) -
        Number(birth.slice(0, 4)) -
        (observation.slice(5) < birth.slice(5) ? 1 : 0)
      : null
  return [
    { label: 'Позиция', value: player.position },
    { label: 'Игровой номер', value: player.number && '№ ' + player.number },
    { label: 'Возраст', value: age && age < 80 ? age + ' лет' : null },
    { label: 'Рост', value: player.height },
    { label: 'Вес', value: player.weight },
  ].filter((fact) => fact.value)
})
const snapshotLabel = computed(() =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(profile.fetchedAt)),
)
</script>

<template>
  <header class="pa-identity">
    <span class="pa-initials" aria-hidden="true">{{ initials }}</span>
    <div class="pa-name">
      <p>Игрок · {{ profile.seasonEndYear - 1 }}/{{ String(profile.seasonEndYear).slice(-2) }}</p>
      <h1>{{ profile.player.name }}</h1>
    </div>
    <AppButton
      class="pa-favorite"
      icon="star"
      :aria-label="`Избранное: ${profile.player.name}`"
      :aria-pressed="favorite"
      @click="$emit('toggleFavorite')"
    >
      <span>{{ favorite ? 'В избранном' : 'В избранное' }}</span>
    </AppButton>
    <div class="pa-affiliation">
      <div v-for="{ label, team } in teams" :key="label" class="pa-team">
        <span :class="{ 'pa-visually-hidden': teams.length === 1 }">{{ label }}</span>
        <TeamProfileLink v-if="team" :team="team.team">
          <TeamLogo :team="team.team" :size="26" />
          <span class="team-profile-link-text">{{ team.name }}</span>
          <span aria-hidden="true">↗</span>
        </TeamProfileLink>
        <strong v-else>Не подтверждена</strong>
      </div>
      <dl v-if="facts.length" class="pa-facts" aria-label="Данные игрока">
        <div v-for="{ label, value } in facts" :key="label">
          <dt class="pa-visually-hidden">{{ label }}</dt>
          <dd>{{ value }}</dd>
        </div>
      </dl>
    </div>
    <details class="pa-source">
      <summary>
        <span class="pa-source-brand">BBS</span>
        <span :class="{ 'pa-stale': profile.isStale }">{{
          profile.isStale ? 'Снимок устарел' : 'Снимок данных'
        }}</span>
        <time :datetime="profile.fetchedAt">{{ snapshotLabel }}</time>
      </summary>
      <div class="pa-source-details">
        <dl>
          <div>
            <dt>Снимок BBS</dt>
            <dd>{{ formatFreshness(profile.fetchedAt) }}</dd>
          </div>
          <div>
            <dt>Средние игрока</dt>
            <dd>{{ formatFreshness(profile.player.averageUpdatedAt) }}</dd>
          </div>
          <div>
            <dt>Профиль BBS</dt>
            <dd>{{ formatFreshness(profile.detail?.profileAt) }}</dd>
          </div>
          <div>
            <dt>Журнал матчей</dt>
            <dd>{{ formatFreshness(profile.detail?.logAt) }}</dd>
          </div>
        </dl>
        <p>
          Покрытие сезона: {{ profile.coverage.checked }}/{{ profile.coverage.total }} игроков
          проверено, {{ profile.coverage.averages }} со средними, {{ profile.coverage.enriched }} с
          деталями, {{ profile.coverage.boxLinks }} со связанными матчами. Строк BBS:
          {{ profile.coverage.providerRows }}.
        </p>
        <p v-if="profile.refreshStatus">
          Цикл BBS: {{ refreshPhaseLabel(profile.refreshStatus.phase) }}. Проверено
          {{ profile.refreshStatus.checked }}/{{ profile.refreshStatus.total }}, обновлено
          {{ profile.refreshStatus.updated }}. Последний завершённый проход:
          {{ formatFreshness(profile.refreshStatus.lastCompletedAt) }}.
        </p>
      </div>
    </details>
  </header>
</template>
