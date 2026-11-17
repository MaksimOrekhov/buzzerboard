import { computed, shallowRef } from 'vue'
import type { GameBoxScore, PlayerBoxScore } from '@/entities/nba/model'

export type PlayerSortKey = 'minutes' | 'points' | 'rebounds' | 'assists' | 'plusMinus'

function minuteValue(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const trimmed = value.trim()
  const clock = /^(\d+):(\d{1,2})$/.exec(trimmed)
  if (clock) {
    const minutes = Number(clock[1])
    const seconds = Number(clock[2])
    return seconds < 60 ? minutes * 60 + seconds : null
  }
  const minutes = Number(trimmed)
  return Number.isFinite(minutes) && minutes >= 0 ? minutes * 60 : null
}

export function sortPlayerLines(
  players: readonly PlayerBoxScore[],
  key: PlayerSortKey,
  direction: 'ascending' | 'descending',
): PlayerBoxScore[] {
  return [...players].sort((left, right) => {
    const leftValue = key === 'minutes' ? minuteValue(left.minutes) : left[key]
    const rightValue = key === 'minutes' ? minuteValue(right.minutes) : right[key]
    const byName = (left.player.displayName ?? '').localeCompare(right.player.displayName ?? '')
    const byId = left.player.id.localeCompare(right.player.id)
    const tieBreak = byName || byId
    if (leftValue === null && rightValue === null) return tieBreak
    if (leftValue === null) return 1
    if (rightValue === null) return -1
    return (leftValue - rightValue) * (direction === 'ascending' ? 1 : -1) || tieBreak
  })
}

export function useGameDetailsModel(boxScore: () => GameBoxScore | null) {
  const sortBy = shallowRef<PlayerSortKey>('points')
  const direction = shallowRef<'ascending' | 'descending'>('descending')
  const sortedPlayers = computed(() => {
    const score = boxScore()
    if (!score) return []
    return sortPlayerLines(score.players, sortBy.value, direction.value)
  })
  const activePlayers = computed(() => sortedPlayers.value.filter((player) => !player.didNotPlay))
  const didNotPlay = computed(() => sortedPlayers.value.filter((player) => player.didNotPlay))
  const leaders = computed(() => {
    const played = activePlayers.value
    return [
      { key: 'points', label: 'Очки', value: (player: PlayerBoxScore) => player.points },
      { key: 'rebounds', label: 'Подборы', value: (player: PlayerBoxScore) => player.rebounds },
      { key: 'assists', label: 'Передачи', value: (player: PlayerBoxScore) => player.assists },
    ].map((metric) => {
      const known = played.filter((player) => metric.value(player) !== null)
      const maximum = known.length
        ? Math.max(...known.map((player) => metric.value(player)!))
        : null
      return {
        ...metric,
        maximum,
        players: maximum === null ? [] : known.filter((player) => metric.value(player) === maximum),
      }
    })
  })
  function setSort(key: PlayerSortKey) {
    if (sortBy.value === key)
      direction.value = direction.value === 'ascending' ? 'descending' : 'ascending'
    else {
      sortBy.value = key
      direction.value = 'descending'
    }
  }
  return { sortBy, direction, activePlayers, didNotPlay, leaders, setSort }
}
