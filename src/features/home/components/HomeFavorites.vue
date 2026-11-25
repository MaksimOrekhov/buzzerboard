<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import type { Game, GameId, TeamId } from '@/entities/nba/model'
import { NBA_TEAMS } from '@/entities/nba/teamCatalog'
import { playerPath } from '@/entities/nba/players'
import { gameDetailsPath } from '@/features/games/gameDetailsRoute'
import { usePlayers } from '@/features/players/api'
import { usePlayerFavorites } from '@/features/players/usePlayerFavorites'
import AppIcon from '@/shared/components/AppIcon.vue'
import AppSegmented from '@/shared/components/AppSegmented.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import TeamProfileLink from '@/shared/components/TeamProfileLink.vue'

const props = defineProps<{
  date: string
  games: readonly Game[]
  teamIds: ReadonlySet<TeamId>
  gameIds: ReadonlySet<GameId>
}>()
const emit = defineEmits<{ team: [id: TeamId]; game: [id: GameId] }>()
const { ids: playerIds, toggle: togglePlayer } = usePlayerFavorites()
const tab = shallowRef<'teams' | 'games' | 'players'>('teams')
const options = computed(
  () =>
    [
      { value: 'teams', label: 'Команды', count: props.teamIds.size },
      { value: 'players', label: 'Игроки', count: playerIds.value.size },
      { value: 'games', label: 'Матчи', count: props.gameIds.size },
    ] as const,
)
const total = computed(() => props.teamIds.size + playerIds.value.size + props.gameIds.size)
const { data: players, isLoading: loadingPlayers } = usePlayers(
  () => tab.value === 'players' && playerIds.value.size > 0,
)
const teams = computed(() => NBA_TEAMS.filter(({ team }) => props.teamIds.has(team.id)))
const games = computed(() => props.games.filter(({ id }) => props.gameIds.has(id)))
const savedPlayers = computed(() =>
  (players.value?.players ?? [])
    .filter(({ id }) => playerIds.value.has(id))
    .sort((a, b) => a.name.localeCompare(b.name)),
)
const itemsCount = computed(
  () =>
    ({ teams: teams.value.length, games: games.value.length, players: savedPlayers.value.length })[
      tab.value
    ],
)
const savedCount = computed(
  () => options.value.find(({ value }) => value === tab.value)?.count ?? 0,
)
const favoritesTo = computed(() => ({ path: '/favorites', query: { tab: tab.value } }))
const gameName = (game: Game) =>
  `${game.awayTeam.abbreviation ?? game.awayTeam.displayName ?? 'Гости'} – ${game.homeTeam.abbreviation ?? game.homeTeam.displayName ?? 'Хозяева'}`
</script>

<template>
  <section
    id="home-favorites"
    class="home-panel home-favorites"
    aria-labelledby="home-favorites-title"
  >
    <header class="home-panel-heading">
      <h2 id="home-favorites-title">Избранное</h2>
      <div class="home-favorites-actions">
        <RouterLink
          class="gc-control home-add-favorite"
          :to="tab === 'players' ? '/players' : '/teams'"
          :aria-label="tab === 'players' ? 'Выбрать игроков' : 'Выбрать команды'"
        >
          <AppIcon :name="tab === 'players' ? 'basketball' : 'users'" :size="16" />
          {{ tab === 'players' ? 'Игроки' : 'Команды' }}
        </RouterLink>
        <RouterLink class="home-icon-link" :to="favoritesTo" aria-label="Открыть раздел Избранное">
          <AppIcon name="arrow-up-right" :size="18" />
        </RouterLink>
      </div>
    </header>
    <div v-if="!total" class="home-favorites-empty">
      <AppIcon name="star" :size="22" />
      <div>
        <strong>Добавьте любимую команду</strong>
        <p>Выберите команду или игрока в каталоге. Матч можно сохранить звёздочкой в расписании.</p>
        <RouterLink class="home-link" to="/players"
          >Каталог игроков <AppIcon name="arrow" :size="15"
        /></RouterLink>
      </div>
    </div>
    <template v-else>
      <AppSegmented v-model="tab" class="home-segments" :options="options" label="Тип избранного" />
      <ResourceState v-if="tab === 'players' && loadingPlayers" compact status="loading" />
      <div v-else-if="itemsCount" class="home-favorite-items">
        <template v-if="tab === 'teams'">
          <article
            v-for="{ team, name } in teams.slice(0, 3)"
            :key="team.id"
            class="home-favorite-card"
          >
            <TeamProfileLink :team="team" class="home-favorite-item">
              <TeamLogo :team="team" :size="30" initials-only />
              <span
                ><strong>{{ name }}</strong
                ><small>Профиль команды</small></span
              >
            </TeamProfileLink>
            <button
              type="button"
              class="home-favorite-star"
              aria-pressed="true"
              :aria-label="`Убрать из избранного: ${name}`"
              @click="emit('team', team.id)"
            >
              <AppIcon name="star" :size="16" />
            </button>
          </article>
        </template>
        <template v-else-if="tab === 'games'">
          <article v-for="game in games.slice(0, 3)" :key="game.id" class="home-favorite-card">
            <RouterLink class="home-favorite-item" :to="gameDetailsPath(game, `/?date=${date}`)">
              <AppIcon name="basketball" :size="21" />
              <span
                ><strong>{{ gameName(game) }}</strong
                ><small>Сохранённый матч</small></span
              >
            </RouterLink>
            <button
              type="button"
              class="home-favorite-star"
              aria-pressed="true"
              :aria-label="`Убрать из избранного: ${gameName(game)}`"
              @click="emit('game', game.id)"
            >
              <AppIcon name="star" :size="16" />
            </button>
          </article>
        </template>
        <template v-else>
          <article
            v-for="player in savedPlayers.slice(0, 3)"
            :key="player.id"
            class="home-favorite-card"
          >
            <RouterLink class="home-favorite-item" :to="playerPath(player.id)">
              <AppIcon name="basketball" :size="21" />
              <span
                ><strong>{{ player.name }}</strong
                ><small>Профиль игрока</small></span
              >
            </RouterLink>
            <button
              type="button"
              class="home-favorite-star"
              aria-pressed="true"
              :aria-label="`Убрать из избранного: ${player.name}`"
              @click="togglePlayer(player.id)"
            >
              <AppIcon name="star" :size="16" />
            </button>
          </article>
        </template>
      </div>
      <div v-else class="home-favorites-empty">
        <AppIcon name="star" :size="22" />
        <div>
          <strong>{{
            savedCount ? 'Сохранённые записи недоступны в этом снимке' : 'Здесь пока пусто'
          }}</strong>
          <p v-if="tab === 'games'">На главной доступны матчи выбранной даты.</p>
          <RouterLink class="home-link" :to="favoritesTo"
            >Открыть избранное <AppIcon name="arrow" :size="15"
          /></RouterLink>
        </div>
      </div>
      <footer
        v-if="itemsCount && (itemsCount > 3 || savedCount > itemsCount)"
        class="home-panel-footer"
      >
        <RouterLink class="home-link" :to="favoritesTo"
          >Всё избранное <AppIcon name="arrow" :size="15"
        /></RouterLink>
      </footer>
    </template>
  </section>
</template>
