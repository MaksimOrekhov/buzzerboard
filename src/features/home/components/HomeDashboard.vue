<script setup lang="ts">
import '../overview.css'
import { computed, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import type { Conference } from '@/entities/nba/model'
import { comingSoonItems } from '@/app/navigation'
import { useGameCenter } from '@/features/games/composables/useGameCenter'
import { useStandings } from '@/features/standings/composables/useStandings'
import { CURRENT_SEASON } from '@/features/standings/composables/useStandingsCenter'
import { sortStandingsRows } from '@/features/standings/standingsModel'
import { formatRecord, formatPercentage } from '@/features/standings/formatters'
import GameScoreRow from '@/features/games/components/GameScoreRow.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
import AppDatePicker from '@/shared/components/AppDatePicker.vue'
import AppPanel from '@/shared/components/AppPanel.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import AppBadge from '@/shared/components/AppBadge.vue'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import SnapshotStatus from '@/shared/components/SnapshotStatus.vue'
import { gameDetailsPath } from '@/features/games/gameDetailsRoute'
import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'
import SpoilerAggregateGate from '@/features/spoilers/SpoilerAggregateGate.vue'
const {
  selectedDate,
  minDate,
  maxDate,
  setDate,
  query,
  games,
  hasHiddenGames,
  statusOf,
  meta,
  displayDate,
  errorTitle,
  errorDescription,
  expandedGameId,
  isFavorite,
  toggleFavorite,
  toggleDetails,
} = useGameCenter()
const { hideAggregate } = useSpoilerMode()
const seasonHidden = computed(() => hideAggregate('overview-standings'))
const standings = useStandings(CURRENT_SEASON)
const conference = shallowRef<Conference>('east')
const previewTeams = computed(() =>
  sortStandingsRows(
    (standings.data.value?.data ?? []).filter((row) => row.conference === conference.value),
    'winPercentage',
    'descending',
  ).slice(0, 5),
)
const upcoming = computed(() => games.value.filter((game) => statusOf(game) === 'scheduled').length)
const completed = computed(() => games.value.filter((game) => statusOf(game) === 'final').length)
const gameRows = computed(() =>
  [...games.value].sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '')).slice(0, 4),
)
</script>
<template>
  <div class="overview-view">
    <PageHeading
      eyebrow="Ваше пространство NBA"
      title="Обзор"
      description="Матчи дня и картина сезона — всё перед глазами."
      ><template #actions
        ><AppDatePicker
          :model-value="selectedDate"
          :min="minDate"
          :max="maxDate"
          @update:model-value="setDate" /></template
    ></PageHeading>
    <div class="overview-day-banner">
      <div>
        <AppIcon name="calendar" :size="21" />
        <div>
          <h2>{{ displayDate }}</h2>
          <p>Игровой день NBA</p>
        </div>
      </div>
      <dl v-if="query.data.value">
        <div>
          <dt>Матчей</dt>
          <dd>{{ games.length }}</dd>
        </div>
        <div v-if="!hasHiddenGames">
          <dt>Завершено</dt>
          <dd>{{ completed }}</dd>
        </div>
        <div v-if="!hasHiddenGames">
          <dt>Впереди</dt>
          <dd>{{ upcoming }}</dd>
        </div>
      </dl>
    </div>
    <div class="overview-columns">
      <AppPanel title="Матчи дня" description="Расписание и результаты"
        ><template #actions
          ><RouterLink class="ui-text-link" :to="{ path: '/games', query: { date: selectedDate } }"
            >Все матчи<AppIcon name="arrow" :size="15" /></RouterLink></template
        ><ResourceState v-if="query.isPending.value" status="loading" compact /><ResourceState
          v-else-if="query.isError.value && !query.data.value"
          status="error"
          icon="calendar"
          :title="errorTitle"
          :description="errorDescription"
          compact /><ResourceState
          v-else-if="!games.length"
          status="empty"
          icon="calendar"
          title="В этот день матчей нет"
          description="Выберите другую дату в календаре."
          compact />
        <div v-else class="gc-scoreboard overview-scoreboard">
          <GameScoreRow
            v-for="game in gameRows"
            :key="game.id"
            :game="game"
            :favorite="isFavorite(game.id)"
            :expanded="expandedGameId === game.id"
            :details-to="gameDetailsPath(game, `/?date=${selectedDate}`)"
            @favorite="toggleFavorite(game.id)"
            @details="toggleDetails(game.id)"
          />
        </div>
        <p
          v-if="query.isRefetchError.value || meta?.refreshError"
          class="gc-notice gc-notice--warning"
          role="status"
        >
          Не удалось обновить данные. Показаны последние результаты.
        </p>
        <SnapshotStatus v-if="meta" :meta="meta"
      /></AppPanel>
      <AppPanel title="Картина сезона" description="2026/27 · лучший процент побед"
        ><template #actions
          ><RouterLink to="/standings" class="ui-text-link" aria-label="Открыть турнирную таблицу"
            ><AppIcon name="arrow" :size="18" /></RouterLink></template
        ><AppSegmented
          v-model="conference"
          label="Конференция в обзоре"
          :options="[
            { value: 'east', label: 'Восток' },
            { value: 'west', label: 'Запад' },
          ]" /><ResourceState
          v-if="standings.isPending.value"
          status="loading"
          compact /><ResourceState
          v-else-if="standings.isError.value && !standings.data.value"
          status="error"
          icon="trophy"
          title="Таблица пока недоступна"
          description="Попробуйте вернуться позже."
          compact /><ResourceState
          v-else-if="!seasonHidden && !previewTeams.length"
          status="empty"
          title="Таблица пока пуста"
          description="Показатели появятся после загрузки."
          compact />
        <SpoilerAggregateGate
          v-else-if="seasonHidden"
          scope="overview-standings"
          title="Картина сезона скрыта" />
        <div v-else class="overview-mini-table">
          <div class="overview-mini-head"><span>Команда</span><span>В–П</span><span>PCT</span></div>
          <div v-for="row in previewTeams" :key="row.team.id" class="overview-mini-row">
            <div>
              <TeamLogo :team="row.team" :size="32" /><strong>{{
                row.team.displayName ?? row.team.abbreviation
              }}</strong>
            </div>
            <span>{{ formatRecord(row.record.wins, row.record.losses) }}</span><strong>{{
              formatPercentage(row.winPercentage)
            }}</strong>
          </div>
        </div>
        <SnapshotStatus
          v-if="!seasonHidden && standings.data.value"
          :meta="standings.data.value.meta"
      /></AppPanel>
    </div>
    <section class="overview-next" aria-label="Будущие разделы">
      <article v-for="item in comingSoonItems" :key="item.id">
        <AppIcon :name="item.icon" :size="23" />
        <div>
          <h2>{{ item.label }}</h2>
          <p>Больше контекста за каждой цифрой</p>
        </div>
        <AppBadge>Скоро</AppBadge>
      </article>
    </section>
  </div>
</template>
