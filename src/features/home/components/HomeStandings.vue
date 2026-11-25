<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import type { Conference } from '@/entities/nba/model'
import { useStandings } from '@/features/standings/composables/useStandings'
import { CURRENT_SEASON } from '@/features/standings/composables/useStandingsCenter'
import { formatPercentage, formatRecord } from '@/features/standings/formatters'
import { TEAMS_PER_CONFERENCE, sortStandingsRows } from '@/features/standings/standingsModel'
import { WorkerApiError } from '@/shared/api/nba/workerClient'
import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'
import SpoilerAggregateGate from '@/features/spoilers/SpoilerAggregateGate.vue'
import AppButton from '@/shared/components/AppButton.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import SnapshotStatus from '@/shared/components/SnapshotStatus.vue'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import TeamProfileLink from '@/shared/components/TeamProfileLink.vue'

const { hideAggregate } = useSpoilerMode()
const scope = 'overview-standings'
const hidden = computed(() => hideAggregate(scope))
const { data, error, isPending, isError, isFetching, isRefetchError, refetch } =
  useStandings(CURRENT_SEASON)
const conference = shallowRef<Conference>('east')
const options = [
  { value: 'east', label: 'Восток' },
  { value: 'west', label: 'Запад' },
] as const
const conferenceName = computed(() => (conference.value === 'east' ? 'Восток' : 'Запад'))
const conferenceRows = computed(() =>
  hidden.value
    ? []
    : (data.value?.data ?? []).filter(
        (row) =>
          row.conference === conference.value &&
          (row.seasonEndYear === CURRENT_SEASON || row.seasonEndYear === null),
      ),
)
const coverage = computed(() => new Set(conferenceRows.value.map(({ team }) => team.id)).size)
const preview = computed(() =>
  sortStandingsRows(conferenceRows.value, 'winPercentage', 'descending').slice(0, 4),
)
const errorTitle = computed(() =>
  error.value instanceof WorkerApiError && error.value.error.code === 'cache_miss'
    ? 'Снимка таблицы пока нет'
    : 'Таблица пока недоступна',
)
</script>

<template>
  <section class="home-panel home-standings" aria-labelledby="home-standings-title">
    <header class="home-panel-heading">
      <div>
        <h2 id="home-standings-title">Турнирная таблица</h2>
        <p>{{ CURRENT_SEASON - 1 }}/{{ String(CURRENT_SEASON).slice(-2) }} · Сортировка по PCT</p>
      </div>
      <RouterLink class="home-icon-link" to="/standings" aria-label="Открыть турнирную таблицу">
        <AppIcon name="arrow-up-right" :size="18" />
      </RouterLink>
    </header>
    <SpoilerAggregateGate v-if="hidden" :scope="scope" title="Картина сезона скрыта" />
    <template v-else>
      <AppSegmented
        v-model="conference"
        class="home-segments"
        :options="options"
        label="Конференция в обзоре"
      />
      <div v-if="data" class="home-standings-meta">
        <SnapshotStatus :meta="data.meta" :refresh-failed="isRefetchError" compact />
        <span v-if="coverage">{{ coverage }} / {{ TEAMS_PER_CONFERENCE }} команд</span>
      </div>
      <p
        v-if="data && (isRefetchError || data.meta.refreshError)"
        class="home-warning"
        role="status"
      >
        Обновление не удалось. Показан последний загруженный снимок.
      </p>
      <p v-if="coverage > 0 && coverage < TEAMS_PER_CONFERENCE" class="home-warning" role="status">
        Получено {{ coverage }} из {{ TEAMS_PER_CONFERENCE }} команд.
      </p>
      <ResourceState v-if="isPending" compact status="loading" />
      <ResourceState
        v-else-if="isError && !data"
        compact
        status="error"
        icon="trophy"
        :title="errorTitle"
        description="Матчи можно посмотреть отдельно."
      >
        <template #action
          ><AppButton icon="refresh" :loading="isFetching" @click="refetch()"
            >Повторить</AppButton
          ></template
        >
      </ResourceState>
      <ResourceState
        v-else-if="!preview.length"
        compact
        status="empty"
        icon="trophy"
        :title="`Нет данных по конференции «${conferenceName}»`"
        description="Переключите конференцию или откройте полную таблицу."
      />
      <template v-else>
        <table class="home-mini-table">
          <caption class="visually-hidden">
            {{
              conferenceName
            }}
            · превью по PCT
          </caption>
          <thead>
            <tr>
              <th scope="col">Команда</th>
              <th scope="col">В–П</th>
              <th scope="col">PCT</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in preview" :key="row.team.id" class="overview-mini-row">
              <th scope="row">
                <TeamProfileLink :team="row.team" class="home-standings-team">
                  <TeamLogo :team="row.team" :size="26" initials-only />
                  <span>{{ row.team.displayName ?? row.team.abbreviation ?? 'Команда' }}</span>
                </TeamProfileLink>
              </th>
              <td>{{ formatRecord(row.record.wins, row.record.losses) }}</td>
              <td>{{ formatPercentage(row.winPercentage) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="home-rank-note">Порядок по PCT · без официальных мест</p>
      </template>
    </template>
    <footer class="home-panel-footer">
      <RouterLink class="home-link" to="/standings"
        >Вся таблица <AppIcon name="arrow" :size="15"
      /></RouterLink>
    </footer>
  </section>
</template>
