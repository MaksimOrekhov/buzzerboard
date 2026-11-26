<script setup lang="ts">
import './players.css'
import { formatFreshness, refreshPhaseLabel } from './playerFreshness'
import { computed, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { NBA_TEAMS, findNbaTeam } from '@/entities/nba/teamCatalog'
import {
  comparePlayers,
  formatPlayerStat,
  playerMetrics,
  playerPath,
  type PlayerGroup,
  type PlayerMetric,
  type PlayerSort,
} from '@/entities/nba/players'
import {
  advancedMetrics,
  formatAdvancedStat,
  meetsPlayerThresholds,
  per36Metrics,
  seasonAdvancedMetric,
  type AdvancedStatsMetric,
} from '@/entities/nba/advancedStats'
import { usePlayers } from './api'
import { usePlayerFavorites } from './usePlayerFavorites'
import PageHeading from '@/shared/components/PageHeading.vue'
import AppSearch from '@/shared/components/AppSearch.vue'
import AppSelect from '@/shared/components/AppSelect.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import StatTable from '@/shared/components/StatTable.vue'
import AppTooltip from '@/shared/components/AppTooltip.vue'

import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'
import SpoilerAggregateGate from '@/features/spoilers/SpoilerAggregateGate.vue'
const { hideAggregate } = useSpoilerMode()
const props = defineProps<{ favoritesOnly?: boolean }>()
const statsScope = computed(() => (props.favoritesOnly ? 'favorite-players' : 'player-directory'))
const statsHidden = computed(() => hideAggregate(statsScope.value))
const route = useRoute()
const router = useRouter()
const { data, isPending, isError, refetch } = usePlayers()
const { ids, toggle } = usePlayerFavorites()
const groups = [
  { value: 'basic', label: 'Основное' },
  { value: 'shooting', label: 'Броски' },
  { value: 'defense', label: 'Защита и потери' },
  { value: 'advanced', label: 'Эффективность' },
  { value: 'per36', label: 'За 36 минут' },
] as const
const group = computed<PlayerGroup>(
  () => groups.find((item) => item.value === route.query.group)?.value ?? 'basic',
)
const search = shallowRef(typeof route.query.q === 'string' ? route.query.q : '')
watch(
  () => route.query.q,
  (value) => {
    search.value = typeof value === 'string' ? value : ''
  },
)
function set(key: string, value: string) {
  const query = { ...route.query, page: undefined, [key]: value || undefined }
  void router.replace({ query })
}
watch(search, (value) => {
  if (value !== (route.query.q ?? '')) set('q', value)
})
const metrics = computed(() => {
  if (group.value === 'advanced')
    return advancedMetrics.map(({ key, short, label }) => ({ key, short, label }))
  if (group.value === 'per36')
    return per36Metrics.map(({ key, short, label }) => ({ key, short, label }))
  return playerMetrics
    .filter((column) => column[3] === group.value)
    .map(([key, short, label]) => ({ key, short, label }))
})
const visibleMetrics = computed(() => (statsHidden.value ? [] : metrics.value))
const defaults: Record<PlayerGroup, PlayerSort> = {
  basic: 'pts',
  shooting: 'fg',
  defense: 'stl',
  advanced: 'ts',
  per36: 'pts36',
}
const sort = computed<PlayerSort>(() => {
  if (statsHidden.value || route.query.sort === 'name') return 'name'
  return (
    metrics.value.find((column) => column.key === route.query.sort)?.key ?? defaults[group.value]
  )
})
const ascending = computed(() => route.query.dir === 'asc')
function sortBy(key: PlayerSort) {
  void router.replace({
    query: {
      ...route.query,
      page: undefined,
      sort: key,
      dir: sort.value === key && !ascending.value ? 'asc' : 'desc',
    },
  })
}
function setGroup(value: PlayerGroup) {
  void router.replace({
    query: { ...route.query, group: value, page: undefined, dir: undefined, sort: undefined },
  })
}
const positions = computed(() =>
  [
    ...new Set(
      data.value?.players.flatMap((player) => (player.position ? [player.position] : [])) ?? [],
    ),
  ].sort(),
)
const teamOptions = [
  { value: 'all', label: 'Все команды' },
  ...NBA_TEAMS.map(({ code, name }) => ({ value: code, label: name })),
]
const conferenceOptions = [
  { value: 'all', label: 'Обе конференции' },
  { value: 'east', label: 'Восточная' },
  { value: 'west', label: 'Западная' },
]
const positionOptions = computed(() => [
  { value: 'all', label: 'Все позиции' },
  ...positions.value.map((position) => ({ value: position, label: position })),
])
function selected(key: string, options: readonly { value: string }[]) {
  return options.find(({ value }) => value === route.query[key])?.value ?? 'all'
}
function selectFilter(key: string, value: string) {
  set(key, value === 'all' ? '' : value)
}
function metricValue(player: NonNullable<typeof data.value>['players'][number], key: PlayerSort) {
  if (key === 'name') return null
  const stats = player.stats
  if (!stats) return null
  if (key in stats) return formatPlayerStat(key as PlayerMetric, stats[key as PlayerMetric])
  return formatAdvancedStat(
    key as AdvancedStatsMetric,
    seasonAdvancedMetric(stats, key as AdvancedStatsMetric),
  )
}
function sampleContext(player: NonNullable<typeof data.value>['players'][number]) {
  const stats = player.stats
  if (!stats) return ''
  return `GP ${formatPlayerStat('gp', stats.gp)} · MIN ${formatPlayerStat('min', stats.min)} · FGA ${formatPlayerStat('fga', stats.fga)}`
}
const filtered = computed(() => {
  const term = search.value.toLowerCase().trim()
  const minGp = Math.min(100, Math.max(0, Number(route.query.gp) || 0))
  const minMinutes = Math.min(48, Math.max(0, Number(route.query.min) || 0))
  const minFga = Math.min(40, Math.max(0, Number(route.query.fga) || 0))
  const team = selected('team', teamOptions)
  const conference = selected('conference', conferenceOptions)
  const position = selected('position', positionOptions.value)
  return (data.value?.players ?? [])
    .filter(
      (player) =>
        (!term || player.name.toLowerCase().includes(term)) &&
        (team === 'all' || player.team === team) &&
        (conference === 'all' ||
          (player.team && findNbaTeam(player.team)?.conference === conference)) &&
        (position === 'all' || player.position === position) &&
        (statsHidden.value ||
          meetsPlayerThresholds(player.stats, { gp: minGp, minutes: minMinutes, fga: minFga })) &&
        (!(props.favoritesOnly || route.query.favorites === '1') || ids.value.has(player.id)),
    )
    .sort((a, b) => comparePlayers(a, b, sort.value, ascending.value, seasonAdvancedMetric))
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / 25)))
const page = computed(() =>
  Math.min(pageCount.value, Math.max(1, Math.trunc(Number(route.query.page) || 1))),
)
const rows = computed(() => filtered.value.slice((page.value - 1) * 25, page.value * 25))
const change = (key: string, event: Event) => set(key, (event.target as HTMLInputElement).value)
</script>

<template>
  <section class="player-center">
    <PageHeading
      v-if="!favoritesOnly"
      eyebrow="NBA · 2026/27"
      title="Игроки"
      description="Сравните сезонную статистику и откройте индивидуальные профили."
    />
    <ResourceState v-if="isPending" status="loading" title="Загружаем игроков" />
    <ResourceState
      v-else-if="isError && !data"
      status="error"
      title="Каталог игроков недоступен"
      description="Локальный снимок BBS пока не загружен."
    >
      <template #action
        ><button class="gc-control" type="button" @click="refetch()">
          Повторить запрос
        </button></template
      >
    </ResourceState>
    <template v-else-if="data">
      <div v-if="!favoritesOnly && !statsHidden" class="players-coverage">
        <div>
          <span>В каталоге</span><strong>{{ data.coverage.total }}</strong>
        </div>
        <div>
          <span>Со средними за сезон</span
          ><strong>{{ data.coverage.averages }} / {{ data.coverage.total }}</strong>
        </div>
        <div>
          <span>С профилем и журналом</span><strong>{{ data.coverage.enriched }}</strong>
        </div>
        <p>
          BBS · Проверено {{ data.coverage.checked }} из {{ data.coverage.total }}. Каталог
          участников сезона, не текущий состав.<br />
          Снимок: {{ new Date(data.fetchedAt).toLocaleString('ru-RU')
          }}{{ data.isStale ? ' · устарел' : '' }}.
        </p>
      </div>
      <div class="players-filters">
        <AppSearch v-model="search" label="Поиск игрока" placeholder="Имя игрока" />
        <AppSelect
          label="Фильтр по команде"
          :options="teamOptions"
          :model-value="selected('team', teamOptions)"
          @update:model-value="selectFilter('team', $event)"
        />
        <AppSelect
          label="Фильтр по конференции"
          :options="conferenceOptions"
          :model-value="selected('conference', conferenceOptions)"
          @update:model-value="selectFilter('conference', $event)"
        />
        <AppSelect
          label="Фильтр по позиции"
          :options="positionOptions"
          :model-value="selected('position', positionOptions)"
          @update:model-value="selectFilter('position', $event)"
        />
        <label v-if="!statsHidden"
          >Мин. матчей<input
            type="number"
            min="0"
            max="100"
            :value="route.query.gp ?? 0"
            @change="change('gp', $event)"
        /></label>
        <label v-if="!statsHidden"
          >Мин. минут за игру<input
            type="number"
            min="0"
            max="48"
            step="0.5"
            :value="route.query.min ?? 0"
            @change="change('min', $event)"
        /></label>
        <label v-if="!statsHidden"
          >Мин. FGA за игру<input
            type="number"
            min="0"
            max="40"
            step="0.5"
            :value="route.query.fga ?? 0"
            @change="change('fga', $event)"
        /></label>
        <button
          v-if="!favoritesOnly"
          class="gc-control gc-favorites-filter"
          type="button"
          aria-label="Только избранные"
          :aria-pressed="route.query.favorites === '1'"
          @click="set('favorites', route.query.favorites === '1' ? '' : '1')"
        >
          <AppIcon name="star" :size="17" /><span>Избранные</span>
        </button>
      </div>
      <details
        v-if="!statsHidden && (group === 'advanced' || group === 'per36')"
        class="player-method-note"
      >
        <summary>Методика расширенных показателей</summary>
        <p>
          Это расчёты BuzzerBoard по средним BBS, а не официальные рейтинги NBA. Сезонные отношения
          приблизительны из-за округления средних.
        </p>
        <ul>
          <li
            v-for="metric in group === 'advanced' ? advancedMetrics : per36Metrics"
            :key="metric.key"
          >
            <strong>{{ metric.short }}</strong> —
            {{ 'description' in metric ? metric.description : metric.label }}
          </li>
        </ul>
        <p>
          Порог матчей, минут и FGA задаёт пользователь; это не официальный квалификационный
          минимум.
        </p>
      </details>
      <SpoilerAggregateGate
        v-if="statsHidden"
        :scope="statsScope"
        title="Сезонные показатели игроков скрыты"
      />
      <p v-else class="player-meta">
        Средние за матч; GP — матчи сезона. Пороги GP, минут и FGA — пользовательские, по умолчанию
        выключены.
        <template v-if="!statsHidden && data?.refreshStatus">
          Автообновление BBS: {{ refreshPhaseLabel(data.refreshStatus.phase) }}, проверено
          {{ data.refreshStatus.checked }}/{{ data.refreshStatus.total }}, обновлено
          {{ data.refreshStatus.updated }}, сохранено без изменений
          {{ data.refreshStatus.retained }}, не удалось {{ data.refreshStatus.failed }}. Последний
          завершённый проход: {{ formatFreshness(data.refreshStatus.lastCompletedAt) }}.
        </template>
      </p>
      <div class="players-table-panel">
        <header class="players-panel-heading">
          <AppSegmented
            v-if="!statsHidden"
            :model-value="group"
            :options="groups"
            label="Показатели"
            @update:model-value="setGroup"
          /><span role="status">{{ filtered.length }} игроков</span>
        </header>
        <StatTable
          v-if="rows.length"
          :label="statsHidden ? 'Каталог игроков' : 'Сезонная статистика игроков'"
        >
          <table class="players-table">
            <thead>
              <tr>
                <th
                  scope="col"
                  :aria-sort="
                    sort === 'name' ? (ascending ? 'ascending' : 'descending') : undefined
                  "
                >
                  <button @click="sortBy('name')">
                    Игрок <span v-if="sort === 'name'">{{ ascending ? '↑' : '↓' }}</span>
                  </button>
                </th>
                <th
                  v-for="{ key, short, label } in visibleMetrics"
                  :key="key"
                  scope="col"
                  :aria-sort="sort === key ? (ascending ? 'ascending' : 'descending') : undefined"
                >
                  <AppTooltip :text="label">
                    <button :aria-label="'Сортировать: ' + label" @click="sortBy(key)">
                      {{ short }} <span v-if="sort === key">{{ ascending ? '↑' : '↓' }}</span>
                    </button>
                  </AppTooltip>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="player in rows" :key="player.id">
                <th scope="row">
                  <div class="player-identity">
                    <button
                      type="button"
                      class="gc-icon-button"
                      :aria-label="'Избранное: ' + player.name"
                      :aria-pressed="ids.has(player.id)"
                      @click="toggle(player.id)"
                    >
                      <AppIcon name="star" :size="16" />
                    </button>
                    <div>
                      <RouterLink
                        :to="{
                          path: playerPath(player.id),
                          query: {
                            from: favoritesOnly
                              ? router.resolve({
                                  path: '/favorites',
                                  query: { ...route.query, tab: 'players' },
                                }).fullPath
                              : route.fullPath,
                          },
                        }"
                        >{{ player.name }}</RouterLink
                      >
                      <small
                        ><RouterLink v-if="player.team" :to="'/teams/' + player.team">{{
                          player.team
                        }}</RouterLink
                        ><span v-else>Команда не подтверждена</span
                        >{{ player.position ? ' · ' + player.position : '' }}</small
                      >
                      <small
                        v-if="!statsHidden && (group === 'advanced' || group === 'per36')"
                        class="player-sample-context"
                      >
                        {{ sampleContext(player) }}
                      </small>
                      <small v-if="!statsHidden && data?.refreshStatus">
                        Средние BBS: {{ formatFreshness(player.averageUpdatedAt) }}
                      </small>
                    </div>
                  </div>
                </th>
                <td v-for="{ key } in visibleMetrics" :key="key">
                  {{ metricValue(player, key) }}
                </td>
              </tr>
            </tbody>
          </table>
        </StatTable>
        <p v-else class="player-empty">Игроки по этим условиям не найдены.</p>
        <footer class="players-panel-heading">
          <span>{{ page }} из {{ pageCount }}</span>
          <div class="players-pages">
            <button class="gc-control" :disabled="page <= 1" @click="set('page', String(page - 1))">
              Назад
            </button>
            <button
              class="gc-control"
              :disabled="page >= pageCount"
              @click="set('page', String(page + 1))"
            >
              Далее
            </button>
          </div>
        </footer>
      </div>
    </template>
  </section>
</template>
