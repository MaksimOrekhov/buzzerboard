<script setup lang="ts">
import './players.css'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { bbsPlayerId, formatPlayerStat, playerMetrics, playerPath } from '@/entities/nba/players'
import { findNbaTeam } from '@/entities/nba/teamCatalog'
import { usePlayer } from './api'
import { usePlayerFavorites } from './usePlayerFavorites'
import PlayerForm from './PlayerForm.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import TeamProfileLink from '@/shared/components/TeamProfileLink.vue'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import StatValue from '@/shared/components/StatValue.vue'
import AppTooltip from '@/shared/components/AppTooltip.vue'
import {
  advancedMetrics,
  formatAdvancedStat,
  per36Metrics,
  seasonAdvancedMetrics,
} from '@/entities/nba/advancedStats'

const route = useRoute()
const id = computed(() => (typeof route.params.playerId === 'string' ? route.params.playerId : ''))
const valid = computed(() => bbsPlayerId.test(id.value))
const { data, isPending, isError, refetch } = usePlayer(id)
const { ids, toggle } = usePlayerFavorites()
const team = computed(() => findNbaTeam(data.value?.player.team ?? ''))
const currentTeam = computed(() => findNbaTeam(data.value?.detail?.currentTeam ?? ''))
const initials = computed(() =>
  data.value?.player.name
    .split(/\s+/)
    .slice(0, 2)
    .map((name) => name[0])
    .join(''),
)
const back = computed(() => {
  const from = route.query.from
  return typeof from === 'string' && /^\/(players|favorites)(\?|$)/.test(from) ? from : '/players'
})
const facts = computed(() => {
  const player = data.value?.player
  const birth = data.value?.detail?.birthDate
  const observation = data.value?.detail?.profileAt?.slice(0, 10)
  const age =
    birth && observation && observation > birth
      ? Number(observation.slice(0, 4)) -
        Number(birth.slice(0, 4)) -
        (observation.slice(5) < birth.slice(5) ? 1 : 0)
      : null
  return [
    player?.position,
    player?.number ? '№ ' + player.number : null,
    age && age < 80 ? age + ' лет' : null,
    player?.height,
    player?.weight,
  ].filter(Boolean)
})
const sections = [
  { key: 'basic', title: 'Основное' },
  { key: 'shooting', title: 'Броски' },
  { key: 'defense', title: 'Защита и потери' },
]
const advancedStats = computed(() => seasonAdvancedMetrics(data.value?.player.stats ?? null))
</script>

<template>
  <div class="player-center">
    <RouterLink :to="back" class="ui-text-link">← К списку игроков</RouterLink>
    <ResourceState v-if="!valid" status="empty" title="Игрок не найден" />
    <ResourceState v-else-if="isPending" status="loading" title="Загружаем профиль" />
    <ResourceState v-else-if="isError && !data" status="error" title="Профиль недоступен">
      <template #action
        ><button class="gc-control" type="button" @click="refetch()">
          Повторить запрос
        </button></template
      >
    </ResourceState>
    <template v-else-if="data">
      <PageHeading
        eyebrow="Профиль игрока · 2026/27"
        :title="data.player.name"
        :description="facts.join(' · ') || 'NBA'"
      >
        <template #actions>
          <button class="gc-control" type="button" :aria-pressed="ids.has(id)" @click="toggle(id)">
            <AppIcon name="star" :size="17" />{{ ids.has(id) ? 'В избранном' : 'В избранное' }}
          </button>
        </template>
      </PageHeading>
      <section class="player-panel player-profile-identity" aria-label="Команды игрока">
        <span class="player-initials" aria-hidden="true">{{ initials }}</span>
        <div v-if="team">
          <span class="player-meta">Команда в каталоге сезона</span>
          <TeamProfileLink :team="team.team"
            ><TeamLogo :team="team.team" :size="24" />{{ team.name }}</TeamProfileLink
          >
        </div>
        <div>
          <span class="player-meta">Текущая команда по профилю BBS</span>
          <TeamProfileLink v-if="currentTeam" :team="currentTeam.team">{{
            currentTeam.name
          }}</TeamProfileLink>
          <strong v-else>Не подтверждена</strong>
        </div>
      </section>
      <section class="player-panel">
        <h2>Статистика сезона</h2>
        <p class="player-meta">
          BBS · Снимок {{ new Date(data.fetchedAt).toLocaleString('ru-RU')
          }}{{ data.isStale ? ' · устарел' : '' }}. Средние за игру; GP — количество матчей.
        </p>
        <template v-if="data.player.stats">
          <div v-for="section in sections" :key="section.key">
            <h3>{{ section.title }}</h3>
            <dl class="player-kpis">
              <div
                v-for="[key, short, label] in playerMetrics.filter(
                  (column) => column[3] === section.key,
                )"
                :key="key"
              >
                <dt :title="label">
                  {{ short }} <small>{{ label }}</small>
                </dt>
                <dd><StatValue :value="formatPlayerStat(key, data.player.stats[key])" /></dd>
              </div>
            </dl>
          </div>
        </template>
        <p v-else class="player-empty">Подтверждённых средних за сезон пока нет.</p>
      </section>
      <section
        v-if="data.player.stats"
        class="player-panel"
        aria-labelledby="advanced-player-heading"
      >
        <h2 id="advanced-player-heading">Расширенная статистика</h2>
        <p class="player-meta">
          Расчёт BuzzerBoard по сезонным средним BBS. Отношения приблизительны из-за округления
          источника; это не официальные рейтинги NBA.
        </p>
        <h3>Эффективность</h3>
        <dl class="player-kpis">
          <div v-for="metric in advancedMetrics" :key="metric.key">
            <dt>
              <AppTooltip :text="metric.description">
                <span tabindex="0"
                  >{{ metric.short }} <small>{{ metric.label }}</small></span
                >
              </AppTooltip>
            </dt>
            <dd>
              <StatValue :value="formatAdvancedStat(metric.key, advancedStats[metric.key])" />
            </dd>
          </div>
        </dl>
        <h3>За 36 минут</h3>
        <dl class="player-kpis">
          <div v-for="metric in per36Metrics" :key="metric.key">
            <dt :title="metric.label">
              {{ metric.short }} <small>{{ metric.label }}</small>
            </dt>
            <dd>
              <StatValue :value="formatAdvancedStat(metric.key, advancedStats[metric.key])" />
            </dd>
          </div>
        </dl>
        <p class="player-meta">
          Показатели за 36 минут нормируют среднее на игровое время и не являются прогнозом.
          GmSc/игру — линейная оценка по средним, не PER или рейтинг влияния.
        </p>
      </section>
      <PlayerForm
        v-if="data.detail?.games.length"
        :games="data.detail.games"
        :return-to="playerPath(id)"
      />
      <p v-else class="player-empty">Журнал матчей пока недоступен.</p>
    </template>
  </div>
</template>
