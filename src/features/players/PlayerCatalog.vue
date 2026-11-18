<script setup lang="ts">
import './players.css'
import { computed, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { NBA_TEAMS, findNbaTeam } from '@/entities/nba/teamCatalog'
import {
  comparePlayers,
  formatPlayerStat,
  playerMetrics,
  playerPath,
  type PlayerGroup,
  type PlayerSort,
} from '@/entities/nba/players'
import { usePlayers } from './api'
import { usePlayerFavorites } from './usePlayerFavorites'
import PageHeading from '@/shared/components/PageHeading.vue'
import AppSearch from '@/shared/components/AppSearch.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import StatTable from '@/shared/components/StatTable.vue'

const props = defineProps<{ favoritesOnly?: boolean }>()
const route = useRoute()
const router = useRouter()
const { data, isPending, isError, refetch } = usePlayers()
const { ids, toggle } = usePlayerFavorites()
const groups = [
  { value: 'basic', label: 'Основное' },
  { value: 'shooting', label: 'Броски' },
  { value: 'defense', label: 'Защита и потери' },
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
const metrics = computed(() => playerMetrics.filter((column) => column[3] === group.value))
const defaults: Record<PlayerGroup, PlayerSort> = { basic: 'pts', shooting: 'fg', defense: 'stl' }
const sort = computed<PlayerSort>(() => {
  if (route.query.sort === 'name') return 'name'
  return (
    metrics.value.find((column) => column[0] === route.query.sort)?.[0] ?? defaults[group.value]
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
const filtered = computed(() => {
  const term = search.value.toLowerCase().trim()
  const minGp = Math.min(100, Math.max(0, Number(route.query.gp) || 0))
  return (data.value?.players ?? [])
    .filter(
      (player) =>
        (!term || player.name.toLowerCase().includes(term)) &&
        (!route.query.team || player.team === route.query.team) &&
        (!route.query.conference ||
          (player.team && findNbaTeam(player.team)?.conference === route.query.conference)) &&
        (!route.query.position || player.position === route.query.position) &&
        (!minGp || (player.stats?.gp ?? 0) >= minGp) &&
        (!(props.favoritesOnly || route.query.favorites === '1') || ids.value.has(player.id)),
    )
    .sort((a, b) => comparePlayers(a, b, sort.value, ascending.value))
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
      <div v-if="!favoritesOnly" class="players-coverage">
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
        <label
          >Команда<select :value="route.query.team ?? ''" @change="change('team', $event)">
            <option value="">Все команды</option>
            <option v-for="team in NBA_TEAMS" :key="team.code" :value="team.code">
              {{ team.name }}
            </option>
          </select></label
        >
        <label
          >Конференция<select
            :value="route.query.conference ?? ''"
            @change="change('conference', $event)"
          >
            <option value="">Обе</option>
            <option value="east">Восточная</option>
            <option value="west">Западная</option>
          </select></label
        >
        <label
          >Позиция<select :value="route.query.position ?? ''" @change="change('position', $event)">
            <option value="">Все позиции</option>
            <option v-for="item in positions" :key="item">{{ item }}</option>
          </select></label
        >
        <label
          >Минимум матчей<input
            type="number"
            min="0"
            max="100"
            :value="route.query.gp ?? 0"
            @change="change('gp', $event)"
        /></label>
        <label v-if="!favoritesOnly" class="player-checkbox"
          ><input
            type="checkbox"
            :checked="route.query.favorites === '1'"
            @change="set('favorites', route.query.favorites === '1' ? '' : '1')"
          />
          Избранные</label
        >
      </div>
      <p class="player-meta">
        Минимум матчей — пользовательский фильтр. Средние в расчёте на игру, GP — всего матчей.
      </p>
      <div class="players-table-panel">
        <header class="players-panel-heading">
          <AppSegmented
            :model-value="group"
            :options="groups"
            label="Показатели"
            @update:model-value="setGroup"
          /><span role="status">{{ filtered.length }} игроков</span>
        </header>
        <StatTable v-if="rows.length" label="Сезонная статистика игроков">
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
                  v-for="[key, short, label] in metrics"
                  :key="key"
                  scope="col"
                  :aria-sort="sort === key ? (ascending ? 'ascending' : 'descending') : undefined"
                >
                  <button :aria-label="'Сортировать: ' + label" :title="label" @click="sortBy(key)">
                    {{ short }} <span v-if="sort === key">{{ ascending ? '↑' : '↓' }}</span>
                  </button>
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
                    </div>
                  </div>
                </th>
                <td v-for="[key] in metrics" :key="key">
                  {{ formatPlayerStat(key, player.stats?.[key]) }}
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
