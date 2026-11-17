<script setup lang="ts">
import '../favorites.css'
import { shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import { RouterLink } from 'vue-router'
import { useFavoriteCollections } from '../composables/useFavoriteCollections'
import { formatRecord, formatPercentage } from '@/features/standings/formatters'
import GameScoreRow from '@/features/games/components/GameScoreRow.vue'
import PageHeading from '@/shared/components/PageHeading.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import AppDatePicker from '@/shared/components/AppDatePicker.vue'
import AppIcon from '@/shared/components/AppIcon.vue'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import TeamProfileLink from '@/shared/components/TeamProfileLink.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import SnapshotStatus from '@/shared/components/SnapshotStatus.vue'
import { gameDetailsPath } from '@/features/games/gameDetailsRoute'
const route = useRoute()
const { center, standings, teams, favoriteGames, favoriteGameGroups, favoriteTeams, unknownGames } =
  useFavoriteCollections()
const tab = shallowRef<'teams' | 'games'>(route.query.tab === 'games' ? 'games' : 'teams')
const {
  selectedDate,
  minDate,
  maxDate,
  setDate,
  expandedGameId,
  toggleDetails,
  isFavorite,
  toggleFavorite,
  favoriteIds,
} = center
const teamIds = teams.favoriteIds
</script>
<template>
  <div class="favorites-view">
    <PageHeading
      eyebrow="Ваш выбор"
      title="Избранное"
      description="Только ваши команды и матчи. Всё важное рядом."
    /><AppSegmented
      v-model="tab"
      variant="underline"
      label="Тип избранного"
      :options="[
        { value: 'teams', label: 'Команды', count: teamIds.size },
        { value: 'games', label: 'Матчи', count: favoriteIds.size },
      ]"
    />
    <section v-if="tab === 'teams'" class="favorites-content" aria-label="Избранные команды">
      <ResourceState
        v-if="!teamIds.size"
        status="empty"
        icon="star"
        title="Выберите свои команды"
        description="Нажмите на звезду в турнирной таблице — команда появится здесь."
        ><template #action
          ><RouterLink to="/standings" class="gc-control ui-button--primary"
            >Открыть таблицу<AppIcon
              name="arrow"
              :size="16" /></RouterLink></template></ResourceState
      ><ResourceState v-else-if="standings.isPending.value" status="loading" /><ResourceState
        v-else-if="standings.isError.value && !standings.data.value"
        status="error"
        title="Не удалось загрузить команды"
        description="Ваш выбор сохранён. Попробуйте обновить данные позже."
      />
      <div v-else-if="favoriteTeams.length" class="favorite-teams-grid">
        <article v-for="row in favoriteTeams" :key="row.team.id" class="favorite-team-card">
          <header>
            <TeamLogo :team="row.team" :size="46" />
            <div>
              <TeamProfileLink :team="row.team" class="favorite-team-profile-link">
                <h2>{{ row.team.displayName ?? row.team.abbreviation }}</h2>
                <p>
                  {{
                    row.conference === 'east'
                      ? 'Восточная конференция'
                      : row.conference === 'west'
                        ? 'Западная конференция'
                        : 'Конференция не указана'
                  }}
                </p>
              </TeamProfileLink>
            </div>
            <button
              class="gc-icon-button gc-favorite"
              aria-pressed="true"
              :aria-label="`Убрать ${row.team.displayName ?? row.team.abbreviation} из избранного`"
              @click="teams.toggleFavorite(row.team.id)"
            >
              <AppIcon name="star" />
            </button>
          </header>
          <dl>
            <div>
              <dt>Победы–поражения</dt>
              <dd>{{ formatRecord(row.record.wins, row.record.losses) }}</dd>
            </div>
            <div>
              <dt>PCT</dt>
              <dd>{{ formatPercentage(row.winPercentage) }}</dd>
            </div>
          </dl>
          <RouterLink to="/standings" class="ui-text-link"
            >Все показатели<AppIcon name="arrow" :size="14"
          /></RouterLink>
        </article>
      </div>
      <ResourceState
        v-else
        status="empty"
        title="Показатели пока недоступны"
        description="Избранные команды сохранены, но их ещё нет в загруженной таблице."
      />
      <p
        v-if="standings.data.value && teamIds.size > favoriteTeams.length"
        class="gc-notice favorites-missing"
        role="status"
      >
        Часть избранных команд пока отсутствует в загруженной таблице.
      </p>
      <SnapshotStatus
        v-if="teamIds.size && standings.data.value"
        :meta="standings.data.value.meta"
      />
    </section>
    <section v-else class="favorites-content" aria-label="Избранные матчи">
      <div class="favorites-date-control">
        <div>
          <h2>Сохранённые матчи</h2>
          <p>Выберите день, чтобы загрузить его результаты</p>
        </div>
        <AppDatePicker
          :model-value="selectedDate"
          :min="minDate"
          :max="maxDate"
          @update:model-value="setDate"
        />
      </div>
      <ResourceState
        v-if="!favoriteIds.size"
        status="empty"
        icon="star"
        title="Сохраните интересные матчи"
        description="Нажмите на звезду рядом с матчем в Game Center."
        ><template #action
          ><RouterLink to="/games" class="gc-control ui-button--primary"
            >Перейти к матчам<AppIcon name="arrow" :size="16" /></RouterLink></template
      ></ResourceState>
      <div v-else-if="favoriteGames.length" class="favorite-game-groups">
        <section v-for="group in favoriteGameGroups" :key="group.date" class="favorite-game-group">
          <h3>{{ group.label }}<span>Игровой день · ET</span></h3>
          <div class="gc-scoreboard">
            <GameScoreRow
              v-for="game in group.games"
              :key="game.id"
              :game="game"
              :favorite="isFavorite(game.id)"
              :expanded="expandedGameId === game.id"
              :details-to="gameDetailsPath(game, `/favorites?tab=games&date=${selectedDate}`)"
              @favorite="toggleFavorite(game.id)"
              @details="toggleDetails(game.id)"
            />
          </div>
          <SnapshotStatus :meta="group.meta" />
        </section>
      </div>
      <ResourceState v-else-if="center.query.isPending.value" status="loading" /><ResourceState
        v-else-if="center.query.isError.value"
        status="error"
        title="За выбранный день пока нет данных"
        description="Ваши матчи сохранены. Выберите другой игровой день."
      /><ResourceState
        v-else
        status="empty"
        icon="calendar"
        title="Матчи за другие даты"
        description="Выберите игровой день, чтобы увидеть сохранённые матчи."
      />
      <p v-if="unknownGames" class="gc-notice favorites-missing" role="status">
        Не загружены сохранённые матчи: {{ unknownGames }}. Выберите их игровой день в календаре.
      </p>
    </section>
  </div>
</template>
