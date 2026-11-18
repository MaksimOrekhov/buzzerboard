import { shallowRef } from 'vue'
import { bbsPlayerId } from '@/entities/nba/players'

const storageKey = 'buzzerboard.favorite-players.v1'
function read() {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (Array.isArray(stored))
      return new Set(
        stored.filter((id): id is string => typeof id === 'string' && bbsPlayerId.test(id)),
      )
  } catch {
    return new Set<string>()
  }
  return new Set<string>()
}
const ids = shallowRef<ReadonlySet<string>>(read())
export function usePlayerFavorites() {
  function toggle(id: string) {
    if (!bbsPlayerId.test(id)) return
    const next = new Set(ids.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    ids.value = next
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]))
    } catch {
      return
    }
  }
  return { ids, toggle }
}
