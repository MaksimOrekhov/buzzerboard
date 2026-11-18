import {
  bbsPlayerId,
  playerSeason,
  type PlayerDetail,
  type PlayerCoverage,
  type PlayerResponse,
  type PlayersResponse,
  type NbaPlayerEntry,
} from '@/entities/nba/players'
import type { D1Database } from './types'

interface StoredSnapshot {
  players: NbaPlayerEntry[]
  details: Record<string, PlayerDetail>
  coverage: PlayerCoverage
}

export async function readPlayerSnapshot(
  db: D1Database,
  season: number,
  now: number,
  playerId?: string,
): Promise<PlayersResponse | PlayerResponse | null> {
  if (season !== playerSeason || (playerId && !bbsPlayerId.test(playerId))) return null
  const row = await db
    .prepare('SELECT fetched_at, payload FROM nba_player_snapshot WHERE season_end_year = ?1')
    .bind(season)
    .first<{ fetched_at: string; payload: string }>()
  if (!row) return null
  const data = JSON.parse(row.payload) as StoredSnapshot
  const meta = {
    source: 'bbs' as const,
    seasonEndYear: season,
    fetchedAt: row.fetched_at,
    isStale: now - Date.parse(row.fetched_at) >= 24 * 60 * 60_000,
    coverage: data.coverage,
  }
  if (!playerId) return { ...meta, players: data.players }
  const player = data.players.find((entry) => entry.id === playerId)
  return player ? { ...meta, player, detail: data.details[playerId] ?? null } : null
}
