<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { TeamSeasonProfile } from '@/entities/nba/model'
import { findNbaTeam } from '@/entities/nba/teamCatalog'
import type { Team, TeamId } from '@/entities/nba/model'
import AppIcon from '@/shared/components/AppIcon.vue'
import TeamLogo from '@/shared/components/TeamLogo.vue'
import TeamProfileLink from '@/shared/components/TeamProfileLink.vue'
import VerifiedPlayerLink from '@/features/players/VerifiedPlayerLink.vue'
import { bbsPlayerId } from '@/entities/nba/players'
import { VIEWER_TIME_ZONE } from '@/shared/utils/nbaDate'
const props = defineProps<{ profile: TeamSeasonProfile }>()
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00Z`),
  )
const nextGameTime = (value: string | null, nbaDate: string | null) => {
  if (value)
    return new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: VIEWER_TIME_ZONE,
    }).format(new Date(value))
  return nbaDate ? dateLabel(nbaDate) : 'Время уточняется'
}
const teamLabel = computed(
  () => props.profile.team.displayName ?? props.profile.team.abbreviation ?? 'Команда',
)
function leaderValue(value: number | null) {
  return value === null
    ? '—'
    : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)
}
function opponentTeam(code: string): Team {
  const team = findNbaTeam(code)
  return (
    team?.team ?? {
      id: `nba:team:${code}` as TeamId,
      providerId: null,
      abbreviation: code,
      displayName: code,
    }
  )
}
</script>

<template>
  <section class="teams-panel teams-results-panel" aria-labelledby="teams-results-title">
    <header class="teams-panel-heading">
      <div>
        <span class="teams-eyebrow">Последние матчи и лидеры</span>
        <h2 id="teams-results-title">Форма команды</h2>
      </div>
      <RouterLink to="/games" class="teams-inline-link"
        >Game Center<AppIcon name="arrow" :size="14"
      /></RouterLink>
    </header>
    <RouterLink
      v-if="profile.nextGame?.gameId && profile.nextGame.nbaGameDate"
      class="teams-next-game"
      :to="{
        name: 'game-details',
        params: { gameId: profile.nextGame.gameId },
        query: {
          date: profile.nextGame.nbaGameDate,
          from: `/teams/${profile.team.abbreviation}`,
        },
      }"
    >
      <span class="teams-next-game-overline">Следующая игра</span>
      <TeamLogo
        v-if="profile.nextGame.opponentCode"
        :team="opponentTeam(profile.nextGame.opponentCode)"
        :size="34"
      />
      <span class="teams-next-game-opponent">
        <strong>{{
          profile.nextGame.isHome === null
            ? 'Матч против'
            : profile.nextGame.isHome
              ? 'Дома против'
              : 'В гостях у'
        }}</strong>
        <small>{{ profile.nextGame.opponentCode ?? 'Соперник уточняется' }}</small>
      </span>
      <time :datetime="profile.nextGame.startsAt ?? undefined">{{
        nextGameTime(profile.nextGame.startsAt, profile.nextGame.nbaGameDate)
      }}</time>
      <AppIcon name="arrow" :size="15" />
    </RouterLink>
    <div v-if="profile.lastTen?.length" class="teams-results-list">
      <div
        v-for="game in profile.lastTen"
        :key="game.gameId ?? `${game.nbaGameDate}-${game.opponentCode}`"
        class="teams-result-row"
      >
        <time :datetime="game.nbaGameDate">{{ dateLabel(game.nbaGameDate) }}</time>
        <span
          class="teams-result-outcome"
          :class="`teams-result-outcome--${game.result.toLowerCase()}`"
          >{{ game.result }}</span
        >
        <TeamLogo :team="opponentTeam(game.opponentCode)" :size="28" />
        <span class="teams-result-opponent"
          ><span v-if="game.venue">{{ game.venue === 'home' ? 'vs' : '@' }} </span>
          <TeamProfileLink :team="opponentTeam(game.opponentCode)" class="team-profile-link-text"
            ><span>{{ game.opponentCode }}</span></TeamProfileLink
          ></span
        >
        <strong>{{ game.pointsFor }}–{{ game.pointsAgainst }}</strong>
        <RouterLink
          v-if="game.gameId"
          :to="{
            name: 'game-details',
            params: { gameId: game.gameId },
            query: { date: game.nbaGameDate, from: `/teams/${profile.team.abbreviation}` },
          }"
          :aria-label="`Открыть матч ${teamLabel} — ${game.opponentCode}`"
          ><AppIcon name="arrow" :size="14"
        /></RouterLink>
        <span v-else class="teams-result-link-placeholder" aria-hidden="true">·</span>
      </div>
    </div>
    <p v-else class="teams-data-empty">Список последних десяти матчей отсутствует в снимке BBS.</p>
    <div v-if="profile.leaders.length" class="teams-leaders">
      <h3>Лидеры команды по данным BBS</h3>
      <div class="teams-leader-grid">
        <article v-for="leader in profile.leaders" :key="leader.playerId">
          <span>{{ leader.statLabel }}</span><strong>{{ leaderValue(leader.statValue) }}</strong
          ><small
            ><VerifiedPlayerLink
              v-if="bbsPlayerId.test(leader.playerId)"
              :id="leader.playerId"
              :name="leader.displayName"
            /><template v-else>{{ leader.displayName }}</template></small
          >
        </article>
      </div>
    </div>
    <div v-else class="teams-data-empty">BBS не вернул сезонных лидеров для этой команды.</div>
    <p class="teams-data-footnote">
      <AppIcon name="database" :size="15" />Ссылки ведут к доступным карточкам матчей.
    </p>
  </section>
</template>
