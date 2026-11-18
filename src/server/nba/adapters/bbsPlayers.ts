import type { PlayerStats } from '@/entities/nba/players'
import { bbsPlayerId, playerMetrics } from '@/entities/nba/players'
import { isPlayerEntry, record, seasonDate } from '@/entities/nba/playerSnapshotGuards'
import type { NbaPlayerEntry } from '@/entities/nba/players'
import {
  isRecord,
  readNonNegativeNumber,
  readString,
  unwrapProviderPayload,
} from './normalizers/primitives'

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const averageFields = {
  pts: 'pts',
  reb: 'reb',
  ast: 'ast',
  fgm: 'fgm',
  fga: 'fga',
  threeM: 'fg3m',
  threeA: 'fg3a',
  ftm: 'ftm',
  fta: 'fta',
  stl: 'stl',
  blk: 'blk',
  oreb: 'oreb',
  dreb: 'dreb',
  tov: 'turnover',
  pf: 'pf',
} as const

function percentage(value: unknown): number | null {
  const parsed = readNonNegativeNumber(value)
  if (parsed === null) return null
  const fraction = parsed > 1 ? parsed / 100 : parsed
  return fraction <= 1 ? fraction : null
}

function minutes(value: unknown): number | null {
  if (typeof value === 'string') {
    const match = /^(\d+):(\d{1,2})$/.exec(value.trim())
    if (match && Number(match[2]) < 60) return Number(match[1]) + Number(match[2]) / 60
  }
  return readNonNegativeNumber(value)
}

export function normalizeBbsPlayerAverage(
  payload: unknown,
  player: NbaPlayerEntry,
  season: number,
): PlayerStats | null {
  const root = unwrapProviderPayload(payload)
  const rows = root?.data
  if (!Array.isArray(rows) || rows.length > 1) throw new Error('Invalid BBS player average rows')
  if (rows.length === 0) return null
  const row = rows[0]
  if (
    !isRecord(row) ||
    row.season !== season ||
    !UUID.test(String(row.player_id ?? '')) ||
    `bbs:player:${row.player_id}` !== player.id
  )
    throw new Error('BBS player average identity mismatch')
  const gp = readNonNegativeNumber(row.games_played)
  if (gp === null || !Number.isSafeInteger(gp)) throw new Error('Invalid BBS games played')
  const stats = {
    gp,
    min: gp ? minutes(row.min) : null,
    ...Object.fromEntries(
      Object.entries(averageFields).map(([key, providerKey]) => [
        key,
        gp ? readNonNegativeNumber(row[providerKey]) : null,
      ]),
    ),
    fg: gp ? percentage(row.fg_pct) : null,
    three: gp ? percentage(row.fg3_pct) : null,
    ft: gp ? percentage(row.ft_pct) : null,
  }
  const candidate = { ...player, stats }
  if (!isPlayerEntry(candidate) || Object.keys(stats).length !== playerMetrics.length)
    throw new Error('Invalid BBS player average values')
  return stats as PlayerStats
}

export interface BbsDirectoryPage {
  total: number
  offset: number
  rows: Record<string, unknown>[]
}

export function normalizeBbsPlayerDirectoryPage(
  payload: unknown,
  season: number,
  expectedOffset: number,
): BbsDirectoryPage {
  if (!record(payload) || !Array.isArray(payload.data) || !record(payload.pagination))
    throw new Error('Invalid BBS player directory page')
  const total = Number(payload.pagination.total)
  const offset = Number(payload.pagination.offset)
  const expectedLength = Math.min(200, total - expectedOffset)
  if (
    !Number.isSafeInteger(total) ||
    total < 1 ||
    total > 1500 ||
    offset !== expectedOffset ||
    expectedOffset >= total ||
    payload.data.length !== expectedLength ||
    payload.meta === null ||
    !record(payload.meta) ||
    !record(payload.meta.filters_applied) ||
    payload.meta.filters_applied.season !== season ||
    !record(payload.meta.filters_applied.league_scope) ||
    payload.meta.filters_applied.league_scope.mode !== 'requested_season'
  )
    throw new Error('Incomplete or incompatible BBS player directory pagination')
  if (!payload.data.every(record)) throw new Error('Invalid BBS player directory row')
  return { total, offset, rows: payload.data }
}

export function bbsDirectoryPlayer(
  row: Record<string, unknown>,
  teamByProviderId: ReadonlyMap<string, string>,
): NbaPlayerEntry {
  const id = row.id
  const name = readString(row.name)
  const team = isRecord(row.team) ? row.team : null
  if (
    typeof id !== 'string' ||
    !UUID.test(id) ||
    !name ||
    !team ||
    team.league !== 'NBA' ||
    typeof team.id !== 'string' ||
    !UUID.test(team.id) ||
    !teamByProviderId.has(team.id)
  )
    throw new Error('Invalid BBS player directory identity or team')
  return {
    id: `bbs:player:${id}`,
    name: name.slice(0, 130),
    team: teamByProviderId.get(team.id) ?? null,
    position: readString(row.position)?.slice(0, 130) ?? null,
    number: readString(row.jersey_number)?.slice(0, 130) ?? null,
    height: readString(row.height)?.slice(0, 130) ?? null,
    weight: readString(row.weight)?.slice(0, 130) ?? null,
    stats: null,
  }
}

export function bbsPlayerUuid(playerId: string): string | null {
  return bbsPlayerId.test(playerId) ? playerId.slice('bbs:player:'.length) : null
}

export function bbsPlayerGameDate(value: unknown, seasonEndYear: number): string | null {
  return typeof value === 'string' && seasonDate(value, seasonEndYear) ? value : null
}
