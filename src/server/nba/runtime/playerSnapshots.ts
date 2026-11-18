import { isPlayerResponse, isStoredPlayers, timestamp } from '@/entities/nba/playerSnapshotGuards'
import type { GameId } from '@/entities/nba/model'
import type { PlayerResponse, PlayersResponse } from '@/entities/nba/players'
import { gameDetailsCacheKey, gamesCacheKey } from './cacheKeys'
import { boxPlayerLine, combinePlayerGames, verifiedPlayerBox } from './playerGames'
import type { D1Database, NbaRepository } from './types'

type ReadResult =
  | { status: 'ready'; data: PlayersResponse | PlayerResponse }
  | { status: 'cache_miss' | 'not_found' | 'invalid_response' }

export async function readPlayerSnapshot(
  db: D1Database,
  repository: Pick<NbaRepository, 'getCache'>,
  season: number,
  now: number,
  playerId?: string,
): Promise<ReadResult> {
  const row = await db
    .prepare('SELECT fetched_at, payload FROM nba_player_snapshot WHERE season_end_year = ?1')
    .bind(season)
    .first<{ fetched_at: string; payload: string }>()
  if (!row) return { status: 'cache_miss' }
  let data: unknown
  try {
    data = JSON.parse(row.payload)
  } catch {
    return { status: 'invalid_response' }
  }
  if (!timestamp(row.fetched_at) || !isStoredPlayers(data, season))
    return { status: 'invalid_response' }
  const meta = {
    source: 'bbs' as const,
    seasonEndYear: season,
    fetchedAt: row.fetched_at,
    isStale: now - Date.parse(row.fetched_at) >= 24 * 60 * 60_000,
    coverage: data.coverage,
  }
  if (!playerId) return { status: 'ready', data: { ...meta, players: data.players } }
  const player = data.players.find((entry) => entry.id === playerId)
  if (!player) return { status: 'not_found' }
  const stored = data.details[playerId]
  const refs = data.gameRefs[playerId] ?? []
  const dates = new Map(
    [...new Set(refs.map((ref) => ref.date))].map((date) => [
      date,
      repository.getCache(gamesCacheKey('bbs', date)),
    ]),
  )
  const boxes = await Promise.all(
    refs.map(async (ref) => {
      const [base, box] = await Promise.all([
        dates.get(ref.date),
        repository.getCache(gameDetailsCacheKey('bbs', ref.gameId as GameId)),
      ])
      const verified = verifiedPlayerBox(base, box, ref, season, now)
      return verified ? boxPlayerLine(verified, playerId) : null
    }),
  )
  const games = combinePlayerGames(
    stored?.games ?? [],
    boxes.filter((box) => box !== null),
  )
  const detail =
    stored || games.length > 0
      ? {
          birthDate: stored?.birthDate ?? null,
          currentTeam: stored?.currentTeam ?? null,
          profileAt: stored?.profileAt ?? null,
          logAt: stored?.logAt ?? null,
          games,
        }
      : null
  const response = { ...meta, player, detail }
  return isPlayerResponse(response)
    ? { status: 'ready', data: response }
    : { status: 'invalid_response' }
}
