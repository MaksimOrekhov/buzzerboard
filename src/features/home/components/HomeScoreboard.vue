<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import type { Game, GameId, GameStatus, TeamId } from '@/entities/nba/model'
import type { GamesResponse } from '@/shared/api/nba/contracts'
import GameScoreRow from '@/features/games/components/GameScoreRow.vue'
import { gameDetailsPath } from '@/features/games/gameDetailsRoute'
import AppButton from '@/shared/components/AppButton.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import AppSelect from '@/shared/components/AppSelect.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import SnapshotStatus from '@/shared/components/SnapshotStatus.vue'
import { VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'
import { homeGameRows } from '../homeGames'

const props = defineProps<{
  date: string
  displayDate: string
  games: readonly Game[]
  meta: GamesResponse['meta'] | null
  pending: boolean
  error: boolean
  fetching: boolean
  refreshFailed: boolean
  errorTitle: string
  errorDescription: string
  hasHiddenGames: boolean
  teamIds: ReadonlySet<TeamId>
  savedGameIds: ReadonlySet<GameId>
  statusOf: (game: Game) => GameStatus
}>()
const emit = defineEmits<{ retry: []; favorite: [id: GameId] }>()
const lens = shallowRef<'league' | 'favorites'>('league')
const status = shallowRef<GameStatus | 'all'>('all')
const lensOptions = [
  { value: 'league', label: 'Вся NBA' },
  { value: 'favorites', label: 'Мои матчи' },
] as const
const statusOptions = [
  { value: 'all', label: 'Все статусы' },
  { value: 'final', label: 'Завершённые', shortLabel: 'Финалы' },
  { value: 'scheduled', label: 'Ожидаются' },
  { value: 'unknown', label: 'Уточняются' },
  { value: 'postponed', label: 'Перенесённые', shortLabel: 'Перенос' },
  { value: 'canceled', label: 'Отменённые', shortLabel: 'Отмена' },
  { value: 'suspended', label: 'Приостановленные', shortLabel: 'Пауза' },
] as const
const matches = computed(() =>
  homeGameRows(
    props.games,
    props.teamIds,
    props.savedGameIds,
    lens.value === 'favorites',
    props.hasHiddenGames ? 'all' : status.value,
    props.statusOf,
  ),
)
const gamesTo = computed(() => ({ path: '/games', query: { date: props.date } }))
const homeReturnTo = computed(() => `/?date=${props.date}`)
const localTimeLabel =
  VIEWER_TIME_ZONE.endsWith('/Nicosia') || VIEWER_TIME_ZONE === 'Europe/Nicosia'
    ? 'Кипр'
    : VIEWER_TIME_ZONE
function resetFilters() {
  lens.value = 'league'
  status.value = 'all'
}
</script>

<template>
  <section class="home-panel home-scoreboard" aria-labelledby="home-games-title">
    <header class="home-panel-heading home-score-heading">
      <div>
        <h2 id="home-games-title">Матчи NBA</h2>
        <p>{{ displayDate }} · NBA ET</p>
      </div>
      <RouterLink
        class="home-link"
        :to="gamesTo"
        aria-label="Открыть Game Center за выбранную дату"
      >
        Game Center <AppIcon name="arrow" :size="15" />
      </RouterLink>
    </header>
    <div v-if="meta" class="home-score-controls">
      <span class="home-game-count"
        ><strong>{{ games.length }}</strong
        ><span> матчей</span></span
      >
      <div v-if="games.length" class="home-game-filters">
        <AppSelect v-model="lens" label="Подборка матчей" :options="lensOptions" />
        <AppSelect
          v-if="!hasHiddenGames"
          v-model="status"
          label="Статус матча"
          :options="statusOptions"
        />
      </div>
      <SnapshotStatus
        class="home-games-source"
        :meta="meta"
        :refresh-failed="refreshFailed"
        compact
      />
      <p v-if="refreshFailed || meta.refreshError" class="home-warning" role="status">
        Обновление не удалось. Показан последний загруженный снимок.
      </p>
    </div>
    <ResourceState v-if="pending" compact status="loading" />
    <ResourceState
      v-else-if="error && !meta"
      compact
      status="error"
      icon="calendar"
      :title="errorTitle"
      :description="errorDescription"
    >
      <template #action>
        <AppButton icon="refresh" :loading="fetching" @click="emit('retry')">Повторить</AppButton>
      </template>
    </ResourceState>
    <ResourceState
      v-else-if="!games.length"
      compact
      status="empty"
      icon="calendar"
      title="В этот день матчей нет"
      description="Выберите другую дату. Таблица и избранное остаются доступны."
    />
    <ResourceState
      v-else-if="!matches.length"
      compact
      status="empty"
      icon="calendar"
      :title="
        lens === 'favorites' ? 'Нет матчей из избранного по этому фильтру' : 'Матчи не найдены'
      "
      description="Посмотрите все матчи выбранного дня."
    >
      <template #action><AppButton @click="resetFilters">Вся NBA</AppButton></template>
    </ResourceState>
    <div v-else class="home-game-list">
      <GameScoreRow
        v-for="game in matches"
        :key="game.id"
        :game="game"
        compact
        :favorite="savedGameIds.has(game.id)"
        :expanded="false"
        :details-to="gameDetailsPath(game, homeReturnTo)"
        @favorite="emit('favorite', game.id)"
      />
    </div>
    <footer class="home-panel-footer home-score-footer">
      <span>Время начала · {{ localTimeLabel }}</span>
      <RouterLink class="home-link" :to="gamesTo">
        Все матчи<template v-if="games.length"> · {{ games.length }}</template>
        <AppIcon name="arrow" :size="15" />
      </RouterLink>
    </footer>
  </section>
</template>
