<script setup lang="ts">
import './game-details.css'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useGameDetails } from '@/features/games/composables/useGameDetails'
import { useGameDetailsModel } from '@/features/games/composables/useGameDetailsModel'
import AppIcon from '@/shared/components/AppIcon.vue'
import AppButton from '@/shared/components/AppButton.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import SnapshotStatus from '@/shared/components/SnapshotStatus.vue'
import GameScoreHero from './GameScoreHero.vue'
import TeamBoxScoreComparison from './TeamBoxScoreComparison.vue'
import PlayerBoxScoreTable from './PlayerBoxScoreTable.vue'
import StatValue from '@/shared/components/StatValue.vue'

import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'
const { hideGame, isFutureSchedule } = useSpoilerMode()
const { query, returnTo, apiError, gameId, date } = useGameDetails()
const response = computed(() => query.data.value ?? null)
const game = computed(() => response.value?.data.game ?? null)
const hidden = computed(() => (game.value ? hideGame(game.value) : false))
const scheduleOnly = computed(() => (game.value ? isFutureSchedule(game.value) : false))
const boxScore = computed(() => response.value?.data.boxScore ?? null)
const comparisonTeams = computed(() =>
  [game.value?.awayTeam, game.value?.homeTeam].map(
    (team) => boxScore.value?.teams.find((row) => row.team.id === team?.id) ?? null,
  ),
)
const model = useGameDetailsModel(() => boxScore.value)
const teamPlayers = (teamId: string) =>
  model.activePlayers.value.filter((line) => line.player.teamId === teamId)
const teamDnp = (teamId: string) =>
  model.didNotPlay.value.filter((line) => line.player.teamId === teamId)
const leaders = computed(() => model.leaders.value.filter((leader) => leader.players.length))
const scoreMeta = computed(() => response.value?.meta ?? null)
const boxScoreMeta = computed(() => response.value?.boxScoreMeta ?? null)
const invalidRoute = computed(() => !gameId.value || !date.value)
const fetchErrorTitle = computed(() =>
  apiError.value?.code === 'cache_miss' ? 'Матч не найден в кеше' : 'Не удалось загрузить матч',
)
const fetchErrorDescription = computed(() =>
  apiError.value?.code === 'cache_miss'
    ? 'Проверьте игровой день или вернитесь к списку матчей.'
    : 'Последний сохранённый снимок матча пока недоступен.',
)
const unavailableDetails = computed(() =>
  response.value?.boxScoreAvailability === 'snapshot_mismatch'
    ? 'Снимки матча и статистики не совпадают. Показан текущий результат без противоречивых данных игроков.'
    : boxScoreMeta.value?.refreshError
      ? 'Обновление не удалось. Доступен последний сохранённый результат.'
      : 'Пока доступен только результат матча.',
)
</script>

<template>
  <div class="game-details-view">
    <PageHeading
      eyebrow="Game Center · Детали"
      :title="
        game
          ? `${game.awayTeam.abbreviation ?? 'Гости'} — ${game.homeTeam.abbreviation ?? 'Хозяева'}`
          : 'Карточка матча'
      "
      description="Результат, сравнение команд и статистика игроков."
    >
      <template #actions
        ><RouterLink
          class="gc-control ui-button ui-button--secondary game-detail-back"
          :to="returnTo"
          ><AppIcon name="arrow" :size="16" />{{
            returnTo.startsWith('/teams/')
              ? 'К профилю команды'
              : returnTo.startsWith('/players/')
                ? 'К профилю игрока'
                : 'К игровому дню'
          }}</RouterLink
        ></template
      >
    </PageHeading>

    <ResourceState
      v-if="invalidRoute"
      status="error"
      icon="calendar"
      title="Не указан игровой день"
      description="Откройте матч из расписания, обзора или избранного — карточка использует NBA-дату исходного матча."
    >
      <template #action
        ><RouterLink to="/games" class="gc-control ui-button--primary"
          >К матчам</RouterLink
        ></template
      >
    </ResourceState>
    <ResourceState v-else-if="query.isPending.value" status="loading" title="Загружаем матч" />
    <ResourceState
      v-else-if="query.isError.value && !response"
      status="error"
      icon="basketball"
      :title="fetchErrorTitle"
      :description="fetchErrorDescription"
    >
      <template #action
        ><div class="game-detail-error-actions">
          <AppButton variant="secondary" icon="refresh" @click="query.refetch()"
            >Повторить запрос</AppButton
          ><RouterLink :to="returnTo" class="ui-text-link"
            >Вернуться назад<AppIcon name="arrow" :size="14"
          /></RouterLink></div
      ></template>
    </ResourceState>
    <template v-else-if="game">
      <GameScoreHero :game="game" :hidden="hidden" :schedule-only="scheduleOnly" />
      <template v-if="!hidden && !scheduleOnly">
        <p v-if="query.isRefetchError.value" class="gc-notice gc-notice--warning" role="status">
          Не удалось обновить данные. Показан предыдущий результат.
        </p>
        <SnapshotStatus v-if="scoreMeta" :meta="scoreMeta" />
        <div v-if="boxScore" class="game-detail-data">
          <TeamBoxScoreComparison
            :teams="comparisonTeams"
            :match-teams="[game.awayTeam, game.homeTeam]"
          />
          <section
            v-if="leaders.length"
            class="game-detail-leaders"
            aria-labelledby="game-leaders-heading"
          >
            <header class="game-detail-section-heading">
              <div>
                <span>02 / ИГРОКИ</span>
                <h2 id="game-leaders-heading">Лидеры среди доступных данных</h2>
              </div>
            </header>
            <article v-for="leader in leaders" :key="leader.key" class="game-leader-card">
              <span>{{ leader.label }}</span><StatValue :value="leader.maximum" />
              <div>
                <span v-for="player in leader.players" :key="player.player.id"
                  >{{ player.player.displayName ?? 'Игрок'
                  }}<small>{{
                    player.player.teamId === game.homeTeam.id
                      ? game.homeTeam.abbreviation
                      : game.awayTeam.abbreviation
                  }}</small></span
                >
              </div>
            </article>
          </section>
          <section class="game-detail-panel" aria-labelledby="player-box-score-heading">
            <header class="game-detail-section-heading">
              <div>
                <span>{{ leaders.length ? '03' : '02' }} / ИГРОКИ</span>
                <h2 id="player-box-score-heading">Статистика игроков</h2>
              </div>
              <p>Выберите набор показателей и нажмите на заголовок столбца.</p>
            </header>
            <div class="player-box-score-grid">
              <PlayerBoxScoreTable
                v-for="team in [game.awayTeam, game.homeTeam]"
                :key="team.id"
                :team="team"
                :players="teamPlayers(team.id)"
                :did-not-play="teamDnp(team.id)"
                :sort-by="model.sortBy.value"
                :direction="model.direction.value"
                @sort="model.setSort"
              />
            </div>
          </section>
          <SnapshotStatus v-if="boxScoreMeta" :meta="boxScoreMeta" />
        </div>
        <section
          v-else
          class="game-detail-panel game-detail-no-box"
          aria-labelledby="no-boxscore-heading"
        >
          <div class="game-detail-no-box-icon"><AppIcon name="chart" :size="20" /></div>
          <div>
            <span>BOX SCORE</span>
            <h2 id="no-boxscore-heading">Подробная статистика пока недоступна</h2>
            <p>{{ unavailableDetails }}</p>
          </div>
          <AppIcon name="database" :size="17" />
        </section>
        <SnapshotStatus v-if="boxScoreMeta && !boxScore" :meta="boxScoreMeta" />
        <footer class="game-detail-footnote">
          Числа без значения источника показаны как «—». Проценты и лидеры рассчитаны только из
          полученных строк.
        </footer>
      </template>
    </template>
  </div>
</template>
