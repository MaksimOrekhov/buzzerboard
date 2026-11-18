import { computed, readonly, shallowRef, onMounted, onUnmounted } from 'vue'
import type { Game } from '@/entities/nba/model'
import {
  completedRowIsProtected,
  gameIsProtected,
  gameRevealKey,
  predatesProtectedGames,
  spoilerWindow,
  type GameIdentity,
} from './spoilerVisibility'

export const SPOILER_STORAGE_KEY = 'buzzerboard:spoilers:v1'
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>
interface Preference {
  enabled: boolean
  day: string
  games: string[]
  aggregates: string[]
}

export function createSpoilerMode(clock: () => number, storage: () => StorageAccess) {
  const window = shallowRef(spoilerWindow(clock()))
  const empty = (enabled = false): Preference => ({
    enabled,
    day: window.value.today,
    games: [],
    aggregates: [],
  })
  function read(): Preference {
    try {
      const value: unknown = JSON.parse(storage().getItem(SPOILER_STORAGE_KEY) ?? 'null')
      if (!value || typeof value !== 'object' || !('enabled' in value) || value.enabled !== true)
        return empty()
      if (!('day' in value) || value.day !== window.value.today) return empty(true)
      const keys = (input: unknown) =>
        Array.isArray(input) ? input.filter((key): key is string => typeof key === 'string') : []
      return {
        ...empty(true),
        games: keys('games' in value ? value.games : null),
        aggregates: keys('aggregates' in value ? value.aggregates : null),
      }
    } catch {
      return empty()
    }
  }
  const preference = shallowRef(read())
  const enabled = computed(() => preference.value.enabled)
  function save(value: Preference) {
    preference.value = value
    try {
      storage().setItem(SPOILER_STORAGE_KEY, JSON.stringify(value))
    } catch {
      // Keep the in-memory preference when storage is disabled.
    }
  }
  function updateClock() {
    window.value = spoilerWindow(clock())
    if (preference.value.day !== window.value.today) save(empty(enabled.value))
  }
  function syncStorage() {
    window.value = spoilerWindow(clock())
    preference.value = read()
  }
  function hasReveal(game: GameIdentity) {
    const key = gameRevealKey(game)
    return key !== null && preference.value.games.includes(key)
  }
  function isFutureSchedule(game: Game) {
    return enabled.value && game.nbaGameDate > window.value.today
  }
  function hideGame(game: Game) {
    return enabled.value && gameIsProtected(game, window.value) && !hasReveal(game)
  }
  function hideCompleted(game: GameIdentity) {
    return (
      enabled.value && completedRowIsProtected(game.nbaGameDate, window.value) && !hasReveal(game)
    )
  }
  function hideAggregate(scope: string, coverageTimestamp?: string | null) {
    return (
      enabled.value &&
      !preference.value.aggregates.includes(scope) &&
      !predatesProtectedGames(coverageTimestamp, window.value)
    )
  }
  function toggle() {
    updateClock()
    save(empty(!enabled.value))
  }
  function revealGame(game: GameIdentity) {
    updateClock()
    const key = gameRevealKey(game)
    if (
      enabled.value &&
      key &&
      completedRowIsProtected(game.nbaGameDate, window.value) &&
      !hasReveal(game)
    )
      save({ ...preference.value, games: [...preference.value.games, key] })
  }
  function revealAggregate(scope: string) {
    updateClock()
    if (hideAggregate(scope))
      save({ ...preference.value, aggregates: [...preference.value.aggregates, scope] })
  }

  return {
    enabled,
    window: readonly(window),
    isFutureSchedule,
    hideGame,
    hideCompleted,
    hideAggregate,
    toggle,
    revealGame,
    revealAggregate,
    updateClock,
    syncStorage,
  }
}

const spoilerMode = createSpoilerMode(
  () => Date.now(),
  () => globalThis.localStorage,
)

export function useSpoilerMode() {
  return spoilerMode
}

export function useSpoilerClock() {
  const { updateClock, syncStorage } = spoilerMode
  let timer: ReturnType<typeof setTimeout> | undefined
  function tick() {
    clearTimeout(timer)
    updateClock()
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000))
  }
  function onStorage(event: StorageEvent) {
    if (event.key === SPOILER_STORAGE_KEY || event.key === null) syncStorage()
  }
  updateClock()
  onMounted(() => {
    tick()
    document.addEventListener('visibilitychange', tick)
    globalThis.addEventListener('pageshow', tick)
    globalThis.addEventListener('focus', tick)
    globalThis.addEventListener('storage', onStorage)
  })
  onUnmounted(() => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', tick)
    globalThis.removeEventListener('pageshow', tick)
    globalThis.removeEventListener('focus', tick)
    globalThis.removeEventListener('storage', onStorage)
  })
}
