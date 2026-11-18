import { computed, shallowRef } from 'vue'
import type { GameBoxScore, PlayerBoxScore } from '@/entities/nba/model'
import {
  parseMinutes,
  playerBoxScoreAdvanced,
  type AdvancedMetric,
} from '@/entities/nba/advancedStats'

export type PlayerSortKey =
  | 'minutes'
  | 'points'
  | 'rebounds'
  | 'assists'
  | 'plusMinus'
  | 'steals'
  | 'blocks'
  | 'turnovers'
  | 'fouls'
  | 'offensiveRebounds'
  | 'defensiveRebounds'
  | 'fieldGoals'
  | 'threePointers'
  | 'freeThrows'
  | AdvancedMetric

function minuteValue(value: string | null): number | null {
  const minutes = parseMinutes(value)
  return minutes === null ? null : minutes * 60
}

function sortValue(line: PlayerBoxScore, key: PlayerSortKey): number | null {
  if (key === 'minutes') return minuteValue(line.minutes)
  if (
    key === 'efg' ||
    key === 'ts' ||
    key === 'gmSc' ||
    key === 'astTo' ||
    key === 'threeRate' ||
    key === 'freeThrowRate' ||
    key === 'twoPoint'
  )
    return playerBoxScoreAdvanced(line, key)
  const value = line[key]
  return typeof value === 'object' && value !== null ? value.percentage : value
}

export function sortPlayerLines(
  players: readonly PlayerBoxScore[],
  key: PlayerSortKey,
  direction: 'ascending' | 'descending',
): PlayerBoxScore[] {
  return [...players].sort((left, right) => {
    const leftValue = sortValue(left, key)
    const rightValue = sortValue(right, key)
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
  const activePlayers = computed(() =>
    sortedPlayers.value.filter((player) => player.didNotPlay !== true),
  )
  const didNotPlay = computed(() =>
    sortedPlayers.value.filter((player) => player.didNotPlay === true),
  )
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
