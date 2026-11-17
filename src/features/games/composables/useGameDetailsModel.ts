import { computed, shallowRef } from 'vue'
import type { GameBoxScore, PlayerBoxScore } from '@/entities/nba/model'

export type PlayerSortKey = 'minutes' | 'points' | 'rebounds' | 'assists' | 'plusMinus'

function minuteValue(value: string | null): number {
  if (!value) return -1
  const parts = value.split(':').map(Number)
  return parts.length === 2 && parts.every(Number.isFinite)
    ? parts[0]! * 60 + parts[1]!
    : Number(value) || -1
}

export function sortPlayerLines(
  players: readonly PlayerBoxScore[],
  key: PlayerSortKey,
  direction: 'ascending' | 'descending',
): PlayerBoxScore[] {
  return [...players].sort((left, right) => {
    const leftValue = key === 'minutes' ? minuteValue(left.minutes) : left[key]
    const rightValue = key === 'minutes' ? minuteValue(right.minutes) : right[key]
    if (leftValue === null || leftValue === -1) return 1
    if (rightValue === null || rightValue === -1) return -1
    return (
      (leftValue - rightValue) * (direction === 'ascending' ? 1 : -1) ||
      (left.player.displayName ?? '').localeCompare(right.player.displayName ?? '')
    )
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
