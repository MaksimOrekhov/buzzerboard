<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { WorkerApiError } from '@/shared/api/nba/workerClient'
import { useTeamSeason } from '../composables/useTeamSeason'
import { TEAM_SEASON_END_YEAR } from '../season'
import AppIcon from '@/shared/components/AppIcon.vue'
import AppButton from '@/shared/components/AppButton.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import SnapshotStatus from '@/shared/components/SnapshotStatus.vue'
import TeamSeasonPanel from './TeamSeasonPanel.vue'
import TeamResultsPanel from './TeamResultsPanel.vue'
import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'
import SpoilerAggregateGate from '@/features/spoilers/SpoilerAggregateGate.vue'

const props = defineProps<{ code: string }>()
const { hideAggregate } = useSpoilerMode()
const query = useTeamSeason(() => props.code, TEAM_SEASON_END_YEAR)
const { data, isPending, isFetching, isRefetchError } = query
const statsScope = computed(() => `team:${props.code}`)
const statsHidden = computed(() => hideAggregate(statsScope.value, data.value?.meta.fetchedAt))
const errorTitle = computed(() =>
  query.error.value instanceof WorkerApiError && query.error.value.error.code === 'cache_miss'
    ? 'Профиль ещё не кэширован'
    : 'Не удалось загрузить профиль',
)
</script>

<template>
  <p v-if="isRefetchError" class="gc-notice gc-notice--warning" role="status">
    Последнее обновление не удалось. Доступный снимок остаётся виден.
  </p>
  <ResourceState v-if="isPending" status="loading" /><ResourceState
    v-else-if="!data"
    status="error"
    icon="basketball"
    :title="errorTitle"
    description="Профиль читается только из локального BBS cache. Вернитесь позже или откройте другой раздел."
    ><template #action
      ><AppButton :loading="isFetching" @click="query.refetch()">Повторить запрос</AppButton
      ><RouterLink to="/teams" class="gc-control">Все команды</RouterLink></template
    ></ResourceState
  >
  <template v-else>
    <SpoilerAggregateGate
      v-if="statsHidden"
      :scope="statsScope"
      title="Сезонная статистика скрыта"
    />
    <div v-else class="teams-profile-overview">
      <div>
        <span class="teams-eyebrow"
          >Сезон {{ data.data.seasonEndYear - 1 }}/{{
            String(data.data.seasonEndYear).slice(-2)
          }}</span
        ><strong>{{ data.data.wins ?? '—' }}–{{ data.data.losses ?? '—' }}</strong
        ><small>победы — поражения</small>
      </div>
      <div>
        <span>Место в лиге</span
        ><strong>{{ data.data.overallRank ? `#${data.data.overallRank}` : '—' }}</strong
        ><small>из 30 команд</small>
      </div>
      <div>
        <span>Последние 10</span
        ><strong>{{
          data.data.lastTen
            ? `${data.data.lastTen.filter((game) => game.result === 'W').length}–${data.data.lastTen.filter((game) => game.result === 'L').length}`
            : '—'
        }}</strong
        ><small>по сезонному срезу BBS</small>
      </div>
      <div>
        <span>Сезонных лидеров</span><strong>{{ data.data.leaders.length }}</strong
        ><small>строк от источника</small>
      </div>
    </div>
    <div class="teams-profile-columns" :class="{ 'spoiler-team-columns': statsHidden }">
      <TeamSeasonPanel v-if="!statsHidden" :profile="data.data" /><TeamResultsPanel
        :profile="data.data"
        :leaders-hidden="statsHidden"
      />
    </div>
    <p v-if="!statsHidden && data.data.conferenceRank === null" class="teams-profile-note">
      <AppIcon name="database" :size="16" />Ранг в конференции не возвращается BBS. Конференция и
      дивизион показаны по текущему справочнику NBA.
    </p>
    <SnapshotStatus :meta="data.meta" />
  </template>
</template>
