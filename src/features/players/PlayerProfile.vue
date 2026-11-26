<script setup lang="ts">
import './players.css'
import './player-profile.css'
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { bbsPlayerId, playerPath } from '@/entities/nba/players'
import { usePlayer } from './api'
import { usePlayerFavorites } from './usePlayerFavorites'
import PlayerForm from './PlayerForm.vue'
import PlayerProfileHeader from './PlayerProfileHeader.vue'
import PlayerSeasonStats from './PlayerSeasonStats.vue'
import PlayerSeasonSummary from './PlayerSeasonSummary.vue'
import ResourceState from '@/shared/components/ResourceState.vue'
import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'
import SpoilerAggregateGate from '@/features/spoilers/SpoilerAggregateGate.vue'

const { hideAggregate } = useSpoilerMode()
const route = useRoute()
const router = useRouter()
const id = computed(() => (typeof route.params.playerId === 'string' ? route.params.playerId : ''))
const valid = computed(() => bbsPlayerId.test(id.value))
const { data, isPending, isError, refetch } = usePlayer(id)
const statsScope = computed(() => `player:${id.value}`)
const statsHidden = computed(() =>
  hideAggregate(statsScope.value, data.value?.player.averageUpdatedAt),
)
const { ids, toggle } = usePlayerFavorites()
const back = computed(() => {
  const from = route.query.from
  return typeof from === 'string' && /^\/(players|favorites)(\?|$)/.test(from) ? from : '/players'
})
const gameReturn = computed(() => {
  const query = back.value === '/players' ? '' : '?' + new URLSearchParams({ from: back.value })
  return playerPath(id.value) + query + '#player-matches'
})

const anchors = [
  { id: 'player-overview', label: 'Обзор' },
  { id: 'player-stats', label: 'Статистика' },
  { id: 'player-matches', label: 'Матчи' },
] as const
const profileRoot = useTemplateRef('profile')
const activeAnchor = shallowRef<string>(anchors[0].id)

function updateActiveAnchor() {
  const sections = profileRoot.value?.querySelectorAll<HTMLElement>('[data-player-section]')
  if (!sections?.length) return
  let active = sections[0]!
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= 72) active = section
  }
  if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
    active = sections[sections.length - 1]!
  }
  activeAnchor.value = active.id
}

function showAnchor(hash: string, focus: boolean) {
  if (!anchors.some((anchor) => '#' + anchor.id === hash)) return
  const section = profileRoot.value?.querySelector<HTMLElement>(hash)
  if (!section) return
  section.scrollIntoView({ block: 'start' })
  if (focus) section.focus({ preventScroll: true })
  activeAnchor.value = section.id
}

async function navigateAnchor(event: MouseEvent, anchor: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  const hash = '#' + anchor
  if (route.hash !== hash) await router.push({ hash })
  showAnchor(hash, true)
}

watch(
  [() => route.hash, () => data.value?.player.id],
  async ([hash], [oldHash, oldId]) => {
    await nextTick()
    if (hash) showAnchor(hash, false)
    else if (oldHash || id.value !== oldId) updateActiveAnchor()
  },
  { flush: 'post' },
)

onMounted(() => {
  window.addEventListener('scroll', updateActiveAnchor, { passive: true })
  window.addEventListener('resize', updateActiveAnchor)
  showAnchor(route.hash, false)
})
onUnmounted(() => {
  window.removeEventListener('scroll', updateActiveAnchor)
  window.removeEventListener('resize', updateActiveAnchor)
})
</script>

<template>
  <div ref="profile" class="player-center player-analytics">
    <RouterLink :to="back" class="ui-text-link pa-back">
      <span aria-hidden="true">‹</span>
      {{ back.startsWith('/favorites') ? 'К избранному' : 'К списку игроков' }}
    </RouterLink>
    <ResourceState v-if="!valid" status="empty" title="Игрок не найден" />
    <ResourceState v-else-if="isPending" status="loading" title="Загружаем профиль" />
    <ResourceState v-else-if="isError && !data" status="error" title="Профиль недоступен">
      <template #action>
        <button class="gc-control" type="button" @click="refetch()">Повторить запрос</button>
      </template>
    </ResourceState>
    <template v-else-if="data">
      <PlayerProfileHeader :profile="data" :favorite="ids.has(id)" @toggle-favorite="toggle(id)" />
      <nav class="pa-sections" aria-label="Разделы профиля игрока">
        <a
          v-for="anchor in anchors"
          :key="anchor.id"
          :href="'#' + anchor.id"
          :aria-current="activeAnchor === anchor.id ? 'location' : undefined"
          @click="navigateAnchor($event, anchor.id)"
          >{{ anchor.label }}</a
        >
      </nav>

      <section id="player-overview" data-player-section tabindex="-1" aria-label="Обзор игрока">
        <SpoilerAggregateGate
          v-if="statsHidden"
          :scope="statsScope"
          title="Сезонная статистика скрыта"
        />
        <PlayerSeasonSummary v-else-if="data.player.stats" :stats="data.player.stats" />
        <p v-else class="player-panel player-empty">Подтверждённых средних за сезон пока нет.</p>
      </section>
      <section id="player-matches" data-player-section tabindex="-1" aria-label="Последние игры">
        <PlayerForm
          v-if="data.detail?.games.length"
          :key="id"
          :games="data.detail.games"
          :return-to="gameReturn"
          :hide-trend="statsHidden"
        />
        <section v-else class="player-panel">
          <h2>Журнал матчей</h2>
          <p class="player-meta">Журнал матчей пока недоступен.</p>
        </section>
      </section>
      <section
        id="player-stats"
        data-player-section
        tabindex="-1"
        class="player-panel"
        aria-labelledby="player-season-stats"
      >
        <h2 id="player-season-stats">Статистика сезона</h2>
        <p v-if="statsHidden" class="player-meta">
          Сезонные показатели можно раскрыть в разделе «Обзор».
        </p>
        <PlayerSeasonStats v-else-if="data.player.stats" :stats="data.player.stats" />
        <p v-else class="player-meta">Подтверждённых средних за сезон пока нет.</p>
      </section>
    </template>
  </div>
</template>
