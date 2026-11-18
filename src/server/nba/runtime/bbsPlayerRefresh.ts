import type { NbaPlayerEntry, PlayerStats } from '@/entities/nba/players'
import { playerMetrics, playerSeason } from '@/entities/nba/players'
import {
  bbsDirectoryPlayer,
  normalizeBbsPlayerDirectoryPage,
} from '@/server/nba/adapters/bbsPlayers'
import { findNbaTeam } from '@/entities/nba/teamCatalog'
import {
  calendarDate,
  isPlayerEntry,
  isStoredPlayers,
  record,
  seasonDate,
  timestamp,
  type StoredPlayerDetail,
  type StoredPlayers,
} from '@/entities/nba/playerSnapshotGuards'
import { normalizeBbsPlayerAverage as normalizeAverage } from '@/server/nba/adapters/bbsPlayers'
import { createTeam, readString } from '@/server/nba/adapters/normalizers/primitives'
import { gameDetailsCacheKey, gamesCacheKey, teamDirectoryCacheKey } from './cacheKeys'
import { getBbsJson } from './bbsRefresh'
import type { D1Database, NbaRepository, WorkerEnvironment } from './types'
import { boxPlayerLine, combinePlayerGames, verifiedPlayerBox } from './playerGames'
import { getDateKeyInTimeZone, NBA_TIME_ZONE } from '@/shared/utils/nbaDate'
import { parseNbaGameDate } from '@/server/nba/adapters/normalizers/primitives'
import type { NbaGameDate } from '@/entities/nba/model'

const PAGE_SIZE = 200
const DIRECTORY_REFRESH_MS = 7 * 24 * 60 * 60_000
const OBSERVATION_BATCH_SIZE = 25
const PLAYER_RETRY_MS = 15 * 60_000
const GLOBAL_PAUSE_CODES = new Set([
  'authentication',
  'forbidden',
  'quota_exceeded',
  'rate_limited',
  'upstream_unavailable',
  'timeout',
  'storage_unavailable',
])
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
class InvalidDirectory extends Error {}
class InvalidPlayerDetail extends Error {}

type SchedulerLease = { key: string; token: string; coreReserve?: number }

const MAX_SNAPSHOT_BYTES = 1_800_000

type PlayerRefreshPhase =
  'directory' | 'averages' | 'publish' | 'retry' | 'gameRefs' | 'enrich' | 'idle'
interface PlayerRetry {
  id: string
  attempts: number
  retryAt: number
}
interface PlayerRefreshProgress {
  seasonEndYear: number
  phase: PlayerRefreshPhase
  playerIds: string[]
  cursor: number
  directoryOffset: number
  directoryTotal: number | null
  cycleStartedAt: string | null
  lastCompletedAt: string | null
  nextCycleAt: number
  successful: number
  retained: number
  lastCycleTotal: number
  failed: number
  retries: PlayerRetry[]
  pauseUntil: number | null
  lastEnrichedPlayerId: string | null
}

function parseProgress(json: string, season: number): PlayerRefreshProgress | null {
  try {
    const value: unknown = JSON.parse(json)
    if (!record(value) || value.seasonEndYear !== season) return null
    if (
      !['directory', 'averages', 'publish', 'retry', 'gameRefs', 'enrich', 'idle'].includes(
        String(value.phase),
      ) ||
      !Array.isArray(value.playerIds) ||
      !value.playerIds.every((id) => typeof id === 'string' && UUID.test(id)) ||
      new Set(value.playerIds).size !== value.playerIds.length ||
      !Number.isSafeInteger(value.cursor) ||
      Number(value.cursor) < 0 ||
      Number(value.cursor) > value.playerIds.length ||
      !Number.isSafeInteger(value.directoryOffset) ||
      Number(value.directoryOffset) < 0 ||
      !(
        value.directoryTotal === null ||
        (Number.isSafeInteger(value.directoryTotal) && Number(value.directoryTotal) > 0)
      ) ||
      !(value.cycleStartedAt === null || timestamp(value.cycleStartedAt)) ||
      !(value.lastCompletedAt === null || timestamp(value.lastCompletedAt)) ||
      !Number.isSafeInteger(value.nextCycleAt) ||
      Number(value.nextCycleAt) < 0 ||
      !Number.isSafeInteger(value.successful) ||
      Number(value.successful) < 0 ||
      !Number.isSafeInteger(value.retained) ||
      Number(value.retained) < 0 ||
      !Number.isSafeInteger(value.lastCycleTotal) ||
      Number(value.lastCycleTotal) < 0 ||
      !Number.isSafeInteger(value.failed) ||
      Number(value.failed) < 0 ||
      !Array.isArray(value.retries) ||
      value.retries.length > 1500 ||
      !value.retries.every(
        (retry) =>
          record(retry) &&
          typeof retry.id === 'string' &&
          UUID.test(retry.id) &&
          typeof retry.attempts === 'number' &&
          Number.isSafeInteger(retry.attempts) &&
          retry.attempts > 0 &&
          retry.attempts <= 3 &&
          typeof retry.retryAt === 'number' &&
          Number.isSafeInteger(retry.retryAt) &&
          retry.retryAt >= 0,
      ) ||
      !(
        value.pauseUntil === null ||
        (Number.isSafeInteger(value.pauseUntil) && Number(value.pauseUntil) >= 0)
      ) ||
      !(
        value.lastEnrichedPlayerId === null ||
        (typeof value.lastEnrichedPlayerId === 'string' && UUID.test(value.lastEnrichedPlayerId))
      )
    )
      return null
    return value as unknown as PlayerRefreshProgress
  } catch {
    return null
  }
}

function progressWrite(
  db: D1Database,
  progress: PlayerRefreshProgress,
  lock: SchedulerLease,
  now: number,
) {
  return db
    .prepare(
      `INSERT INTO nba_player_refresh_state (season_end_year, progress_json, updated_at_ms)
     SELECT ?1, ?2, ?3 WHERE EXISTS (
       SELECT 1 FROM nba_refresh_locks WHERE lock_key = ?4 AND token = ?5 AND lease_expires_at_ms > ?3
     )
     ON CONFLICT(season_end_year) DO UPDATE SET progress_json=excluded.progress_json, updated_at_ms=excluded.updated_at_ms
     WHERE EXISTS (SELECT 1 FROM nba_refresh_locks WHERE lock_key = ?4 AND token = ?5 AND lease_expires_at_ms > ?3)`,
    )
    .bind(progress.seasonEndYear, JSON.stringify(progress), now, lock.key, lock.token)
}

async function saveProgress(
  db: D1Database,
  progress: PlayerRefreshProgress,
  lock: SchedulerLease,
  now: number,
) {
  requireWrite(await progressWrite(db, progress, lock, now).run())
}

function requireWrite(result: { meta?: { changes?: number } } | undefined) {
  if (result?.meta?.changes !== 1) throw new Error('Player refresh write lost its scheduler lease')
}

async function commitProgress(
  db: D1Database,
  progress: PlayerRefreshProgress,
  lock: SchedulerLease,
  writes: (now: number) => ReturnType<D1Database['prepare']>[],
) {
  // All writes use the same fence instant inside one D1 transaction.
  const now = Date.now()
  const results = await db.batch([...writes(now), progressWrite(db, progress, lock, now)])
  requireWrite(results.at(-1))
}

async function loadProgress(db: D1Database, season: number): Promise<PlayerRefreshProgress | null> {
  const row = await db
    .prepare('SELECT progress_json FROM nba_player_refresh_state WHERE season_end_year = ?1')
    .bind(season)
    .first<{ progress_json: string }>()
  if (!row) return null
  const progress = parseProgress(row.progress_json, season)
  if (!progress) throw new Error('Corrupt BBS player refresh progress; preserved for diagnosis')
  return progress
}

async function loadSnapshot(db: D1Database, season: number): Promise<StoredPlayers | null> {
  const row = await db
    .prepare('SELECT payload FROM nba_player_snapshot WHERE season_end_year = ?1')
    .bind(season)
    .first<{ payload: string }>()
  if (!row) return null
  const payload: unknown = JSON.parse(row.payload)
  if (!isStoredPlayers(payload, season)) throw new Error('Invalid existing player snapshot')
  return payload
}

function snapshotWrite(db: D1Database, season: number, data: StoredPlayers, lock: SchedulerLease) {
  if (!isStoredPlayers(data, season)) throw new Error('Refusing to publish invalid player snapshot')
  const payload = JSON.stringify(data)
  if (new TextEncoder().encode(payload).byteLength >= MAX_SNAPSHOT_BYTES)
    throw new Error('Player snapshot exceeds safe D1 row size')
  return (now: number) =>
    db
      .prepare(
        `INSERT INTO nba_player_snapshot (season_end_year, fetched_at, payload)
     SELECT ?1, ?2, ?3 WHERE EXISTS (
       SELECT 1 FROM nba_refresh_locks WHERE lock_key=?4 AND token=?5 AND lease_expires_at_ms>?6
     )
     ON CONFLICT(season_end_year) DO UPDATE SET fetched_at=excluded.fetched_at,payload=excluded.payload`,
      )
      .bind(season, oldestObservation(data), payload, lock.key, lock.token, now)
}

function deleteDirectoryPages(db: D1Database, season: number, lock: SchedulerLease, now: number) {
  return db
    .prepare(
      `DELETE FROM nba_player_refresh_directory_pages WHERE season_end_year=?1 AND EXISTS (
      SELECT 1 FROM nba_refresh_locks WHERE lock_key=?2 AND token=?3 AND lease_expires_at_ms>?4
    )`,
    )
    .bind(season, lock.key, lock.token, now)
}

function initialProgress(
  season: number,
  snapshot: StoredPlayers | null,
  now: number,
): PlayerRefreshProgress {
  const directoryDue = !snapshot || now - Date.parse(snapshot.directoryAt) >= DIRECTORY_REFRESH_MS
  return {
    seasonEndYear: season,
    phase: directoryDue ? 'directory' : 'averages',
    playerIds: snapshot?.players.map(({ id }) => id.slice('bbs:player:'.length)) ?? [],
    cursor: 0,
    directoryOffset: 0,
    directoryTotal: null,
    cycleStartedAt: new Date(now).toISOString(),
    lastCompletedAt: null,
    nextCycleAt: 0,
    successful: 0,
    retained: 0,
    lastCycleTotal: 0,
    failed: 0,
    retries: [],
    pauseUntil: null,
    lastEnrichedPlayerId: null,
  }
}

function refreshCoverage(data: StoredPlayers): StoredPlayers {
  const checked = Object.keys(data.averageAt).length
  return {
    ...data,
    coverage: {
      ...data.coverage,
      total: data.players.length,
      providerRows: Math.max(data.coverage.providerRows, data.players.length),
      checked,
      averages: data.players.filter(
        (player) =>
          player.stats !== null && typeof player.stats.gp === 'number' && player.stats.gp > 0,
      ).length,
      enriched: Object.values(data.details).filter(
        (detail) => detail.profileAt && detail.logAt && detail.games.length,
      ).length,
    },
  }
}

function teamCrosswalk(value: unknown): Map<string, string> {
  if (!Array.isArray(value) || value.length !== 30)
    throw new Error('BBS team directory unavailable')
  const result = new Map<string, string>()
  for (const row of value) {
    if (!record(row) || typeof row.providerTeamId !== 'string' || typeof row.teamId !== 'string')
      throw new Error('Invalid BBS team crosswalk')
    const code = row.teamId.split(':').at(-1)
    if (!code || !findNbaTeam(code) || result.has(row.providerTeamId))
      throw new Error('Invalid BBS team crosswalk')
    result.set(row.providerTeamId, code)
  }
  if (new Set(result.values()).size !== 30) throw new Error('Invalid BBS team crosswalk')
  return result
}

function directoryPageWrite(
  db: D1Database,
  season: number,
  page: { offset: number; total: number; payload: unknown; observedAt: string },
  lock: SchedulerLease,
  now: number,
) {
  return db
    .prepare(
      `INSERT INTO nba_player_refresh_directory_pages (season_end_year,page_offset,total_rows,payload_json,observed_at)
     SELECT ?1,?2,?3,?4,?5 WHERE EXISTS (
       SELECT 1 FROM nba_refresh_locks WHERE lock_key=?6 AND token=?7 AND lease_expires_at_ms>?8
     ) ON CONFLICT(season_end_year,page_offset) DO UPDATE SET total_rows=excluded.total_rows,payload_json=excluded.payload_json,observed_at=excluded.observed_at`,
    )
    .bind(
      season,
      page.offset,
      page.total,
      JSON.stringify(page.payload),
      page.observedAt,
      lock.key,
      lock.token,
      now,
    )
}

async function publishDirectory(
  db: D1Database,
  repository: NbaRepository,
  progress: PlayerRefreshProgress,
  lock: SchedulerLease,
  now: number,
): Promise<StoredPlayers> {
  const total = progress.directoryTotal
  if (!total || progress.directoryOffset < total)
    throw new InvalidDirectory('Incomplete BBS player directory')
  const pages = await db
    .prepare(
      'SELECT page_offset,total_rows,payload_json,observed_at FROM nba_player_refresh_directory_pages WHERE season_end_year=?1 ORDER BY page_offset',
    )
    .bind(progress.seasonEndYear)
    .run<{ page_offset: number; total_rows: number; payload_json: string; observed_at: string }>()
  const rows: Record<string, unknown>[] = []
  let oldest = new Date(now).toISOString()
  for (let index = 0; index < Math.ceil(total / PAGE_SIZE); index += 1) {
    const pageRow = pages.results?.[index]
    if (
      !pageRow ||
      pageRow.page_offset !== index * PAGE_SIZE ||
      pageRow.total_rows !== total ||
      !timestamp(pageRow.observed_at)
    )
      throw new InvalidDirectory('Incomplete staged BBS player directory')
    let page
    try {
      page = normalizeBbsPlayerDirectoryPage(
        JSON.parse(pageRow.payload_json),
        progress.seasonEndYear - 1,
        pageRow.page_offset,
      )
    } catch {
      throw new InvalidDirectory('Invalid staged directory page')
    }
    if (page.total !== total)
      throw new InvalidDirectory('BBS player directory total changed during pagination')
    rows.push(...page.rows)
    if (Date.parse(pageRow.observed_at) < Date.parse(oldest)) oldest = pageRow.observed_at
  }
  if (rows.length !== total) throw new InvalidDirectory('Incomplete staged BBS player directory')
  const providerTeams = await repository.getCache(
    teamDirectoryCacheKey('bbs', progress.seasonEndYear as never),
  )
  const teamByProviderId = teamCrosswalk(
    providerTeams?.capability === 'teamDirectory' ? providerTeams.data : null,
  )
  const incoming = new Map<string, NbaPlayerEntry>()
  for (const row of rows) {
    let player
    try {
      player = bbsDirectoryPlayer(row, teamByProviderId)
    } catch {
      throw new InvalidDirectory('Invalid staged BBS player')
    }
    if (incoming.has(player.id))
      throw new InvalidDirectory('Duplicate BBS player directory identity')
    incoming.set(player.id, player)
  }
  const previous = await loadSnapshot(db, progress.seasonEndYear)
  const previousPlayers = new Map(previous?.players.map((player) => [player.id, player]) ?? [])
  const players = [...incoming.values()].map((player) => ({
    ...player,
    stats: previousPlayers.get(player.id)?.stats ?? null,
  }))
  for (const player of previous?.players ?? []) if (!incoming.has(player.id)) players.push(player)
  const ids = new Set(players.map(({ id }) => id))
  const averageAt = Object.fromEntries(
    Object.entries(previous?.averageAt ?? {}).filter(([id]) => ids.has(id)),
  )
  const details = Object.fromEntries(
    Object.entries(previous?.details ?? {}).filter(([id]) => ids.has(id)),
  )
  const gameRefs = Object.fromEntries(
    Object.entries(previous?.gameRefs ?? {}).filter(([id]) => ids.has(id)),
  )
  const base: StoredPlayers = {
    version: 2,
    players,
    details,
    gameRefs,
    directoryAt: oldest,
    averageAt,
    coverage: {
      providerRows: Math.max(total, players.length),
      total: players.length,
      checked: Object.keys(averageAt).length,
      averages: players.filter(
        ({ stats }) => stats !== null && typeof stats.gp === 'number' && stats.gp > 0,
      ).length,
      enriched: Object.values(details).filter(
        (detail) => detail.profileAt && detail.logAt && detail.games.length,
      ).length,
      boxLinks: previous?.coverage.boxLinks ?? 0,
    },
  }
  const data = refreshCoverage(base)
  progress.phase = 'averages'
  progress.playerIds = players.map(({ id }) => id.slice('bbs:player:'.length))
  progress.cursor = 0
  progress.directoryOffset = 0
  progress.directoryTotal = null
  const snapshot = snapshotWrite(db, progress.seasonEndYear, data, lock)
  await commitProgress(db, progress, lock, (now) => [
    snapshot(now),
    deleteDirectoryPages(db, progress.seasonEndYear, lock, now),
  ])
  return data
}

function averageWrite(
  db: D1Database,
  season: number,
  playerId: string,
  stats: PlayerStats | null,
  observedAt: string,
  lock: SchedulerLease,
  now: number,
) {
  return db
    .prepare(
      `INSERT INTO nba_player_refresh_observations (season_end_year,player_id,stats_json,observed_at,published_at_ms)
     SELECT ?1,?2,?3,?4,NULL WHERE EXISTS (
       SELECT 1 FROM nba_refresh_locks WHERE lock_key=?5 AND token=?6 AND lease_expires_at_ms>?7
     ) ON CONFLICT(season_end_year,player_id) DO UPDATE SET stats_json=excluded.stats_json,observed_at=excluded.observed_at,published_at_ms=NULL
     WHERE nba_player_refresh_observations.observed_at <= excluded.observed_at`,
    )
    .bind(
      season,
      `bbs:player:${playerId}`,
      JSON.stringify(stats),
      observedAt,
      lock.key,
      lock.token,
      now,
    )
}

async function pendingObservations(db: D1Database, season: number, limit: number) {
  return db
    .prepare(
      'SELECT player_id,stats_json,observed_at FROM nba_player_refresh_observations WHERE season_end_year=?1 AND published_at_ms IS NULL ORDER BY observed_at,player_id LIMIT ?2',
    )
    .bind(season, limit)
    .run<{ player_id: string; stats_json: string; observed_at: string }>()
}

async function publishObservations(
  db: D1Database,
  progress: PlayerRefreshProgress,
  lock: SchedulerLease,
  observations: { player_id: string; stats_json: string; observed_at: string }[],
) {
  const data = await loadSnapshot(db, progress.seasonEndYear)
  if (!data) throw new Error('Player snapshot unavailable while publishing season averages')
  const indices = new Map(data.players.map(({ id }, index) => [id, index]))
  for (const row of observations) {
    const index = indices.get(row.player_id)
    const player = index === undefined ? undefined : data.players[index]
    const stats = JSON.parse(row.stats_json) as PlayerStats | null
    if (
      !player ||
      index === undefined ||
      !timestamp(row.observed_at) ||
      (stats !== null && !isPlayerEntry({ ...player, stats }))
    )
      throw new Error('Invalid staged player observation')
    const previousAt = data.averageAt[row.player_id]
    if (
      stats === null ||
      (player.stats?.gp ?? 0) > (stats.gp ?? 0) ||
      (player.stats &&
        playerMetrics.some(([key]) => player.stats?.[key] != null && stats[key] === null)) ||
      (previousAt && Date.parse(previousAt) >= Date.parse(row.observed_at))
    ) {
      progress.retained += 1
      continue
    }
    data.players[index] = { ...player, stats }
    data.averageAt[row.player_id] = row.observed_at
    progress.successful += 1
  }
  const snapshot = snapshotWrite(db, progress.seasonEndYear, refreshCoverage(data), lock)
  await commitProgress(db, progress, lock, (now) => [
    snapshot(now),
    ...observations.map((row) =>
      db
        .prepare(
          `UPDATE nba_player_refresh_observations SET published_at_ms=?3
     WHERE season_end_year=?1 AND player_id=?2 AND published_at_ms IS NULL AND observed_at=?4
       AND EXISTS (SELECT 1 FROM nba_refresh_locks WHERE lock_key=?5 AND token=?6 AND lease_expires_at_ms>?3)`,
        )
        .bind(progress.seasonEndYear, row.player_id, now, row.observed_at, lock.key, lock.token),
    ),
  ])
}

function oldestObservation(data: StoredPlayers) {
  const dates = [data.directoryAt, ...Object.values(data.averageAt)].filter(timestamp)
  return dates.reduce((oldest, value) => (Date.parse(value) < Date.parse(oldest) ? value : oldest))
}

function normalizedProfile(
  payload: unknown,
  id: string,
  teamByProviderId: ReadonlyMap<string, string>,
) {
  const root = record(payload) && record(payload.data) ? payload.data : null
  const profile = root && record(root.player) ? root.player : null
  if (!profile || `bbs:player:${profile.id}` !== `bbs:player:${id}` || profile.league !== 'NBA')
    throw new InvalidPlayerDetail('BBS player profile identity mismatch')
  const birthDate = profile.date_of_birth
  if (birthDate !== null && birthDate !== undefined && !calendarDate(birthDate))
    throw new InvalidPlayerDetail('Invalid BBS player birth date')
  const current = profile.current_team
  if (
    current !== null &&
    current !== undefined &&
    (!record(current) || typeof current.id !== 'string' || !UUID.test(current.id))
  )
    throw new InvalidPlayerDetail('Invalid BBS player current team')
  return {
    birthDate: typeof birthDate === 'string' ? birthDate : null,
    currentTeam:
      current && typeof current.id === 'string' ? (teamByProviderId.get(current.id) ?? null) : null,
  }
}

function gameMinutes(value: unknown): number | null {
  if (typeof value === 'string') {
    const match = /^(\d+):(\d{1,2})$/.exec(value.trim())
    if (match && Number(match[2]) < 60) return Number(match[1]) + Number(match[2]) / 60
  }
  const numeric =
    typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 80 ? numeric : null
}

function normalizedPlayerLog(
  payload: unknown,
  playerId: string,
  season: number,
): StoredPlayerDetail['games'] {
  const data = record(payload) && 'data' in payload ? payload.data : payload
  const rows = Array.isArray(data) ? data : record(data) ? data.games : null
  if (!Array.isArray(rows) || rows.length > 15)
    throw new InvalidPlayerDetail('Invalid BBS player game log')
  const games: StoredPlayerDetail['games'] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (
      !record(row) ||
      !seasonDate(row.date, season) ||
      (row.player_id != null && String(row.player_id) !== playerId)
    )
      throw new InvalidPlayerDetail('BBS player game log identity/date mismatch')
    const matchId =
      row.match_id === null || row.match_id === undefined ? null : String(row.match_id)
    if (matchId !== null && !/^[\w-]{1,100}$/.test(matchId))
      throw new InvalidPlayerDetail('Invalid BBS player game reference')
    const team = readString(row.abbr)
    const opponent = team
      ? (createTeam('bbs', team, team, null)?.abbreviation ?? team.slice(0, 130))
      : (readString(row.opponent)?.slice(0, 130) ?? null)
    const key = matchId ?? `${row.date}:${opponent ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    const value = (field: string) => {
      const raw = row[field]
      if (raw === null || raw === undefined || raw === '') return null
      const parsed = Number(raw)
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
    }
    games.push({
      date: row.date,
      opponent,
      gameId: null,
      matchId: matchId ? `bbs:game:${matchId}` : null,
      pts: value('pts'),
      reb: value('reb'),
      ast: value('ast'),
      min: gameMinutes(row.min_played),
    })
  }
  return games
}

async function enrichOnePlayer(
  repository: NbaRepository,
  fetcher: typeof fetch,
  env: WorkerEnvironment,
  progress: PlayerRefreshProgress,
  snapshot: StoredPlayers,
  lock: SchedulerLease,
  now: number,
) {
  if (snapshot.players.length === 0) return
  const previousIndex = progress.lastEnrichedPlayerId
    ? snapshot.players.findIndex(({ id }) => id === `bbs:player:${progress.lastEnrichedPlayerId}`)
    : -1
  const ordered = [
    ...snapshot.players.slice(previousIndex + 1),
    ...snapshot.players.slice(0, previousIndex + 1),
  ]
  const candidate = ordered.find((player) => {
    const detail = snapshot.details[player.id]
    return (
      !detail?.profileAt ||
      !detail.logAt ||
      now - Math.min(Date.parse(detail.profileAt), Date.parse(detail.logAt)) >=
        30 * 24 * 60 * 60_000
    )
  })
  if (!candidate) return
  const id = bbsPlayerIdValue(candidate.id)
  progress.lastEnrichedPlayerId = id
  const teamCache = await repository.getCache(
    teamDirectoryCacheKey('bbs', progress.seasonEndYear as never),
  )
  const teams = teamCrosswalk(teamCache?.capability === 'teamDirectory' ? teamCache.data : null)
  const old = snapshot.details[candidate.id]
  const profilePayload = await getBbsJson(
    `/v1/players/${id}/profile`,
    env,
    repository,
    fetcher,
    now,
    lock,
  )
  const profile = normalizedProfile(profilePayload, id, teams)
  const profileAt = new Date(Date.now()).toISOString()
  const logPayload = await getBbsJson(
    `/v1/players/${id}/gamelog?season=${progress.seasonEndYear - 1}&limit=15`,
    env,
    repository,
    fetcher,
    Date.now(),
    lock,
  )
  const games = normalizedPlayerLog(logPayload, id, progress.seasonEndYear)
  const logAt = new Date(Date.now()).toISOString()
  const keepGames =
    games.length > 0 &&
    games.length >= (old?.games.length ?? 0) &&
    (old?.games.every((prior) => {
      const incoming = games.find((game) =>
        prior.matchId
          ? game.matchId === prior.matchId
          : game.date === prior.date && game.opponent === prior.opponent,
      )
      return (
        !incoming ||
        (['pts', 'reb', 'ast', 'min'] as const).every(
          (field) => prior[field] === null || incoming[field] !== null,
        )
      )
    }) ??
      true) &&
    (old?.games.every((prior) => games.some((game) => game.date >= prior.date)) ?? true)
  snapshot.details[candidate.id] = {
    birthDate: profile.birthDate ?? old?.birthDate ?? null,
    currentTeam: profile.currentTeam ?? old?.currentTeam ?? null,
    profileAt: profile.birthDate && profile.currentTeam ? profileAt : (old?.profileAt ?? null),
    games: keepGames ? games : (old?.games ?? []),
    logAt: keepGames ? logAt : (old?.logAt ?? null),
  }
  return refreshCoverage(snapshot)
}

async function refreshRecentGameRefs(
  repository: NbaRepository,
  snapshot: StoredPlayers,
  season: number,
  now: number,
): Promise<StoredPlayers> {
  const today = parseNbaGameDate(getDateKeyInTimeZone(new Date(now), NBA_TIME_ZONE))
  if (!today) return snapshot
  const dates: NbaGameDate[] = []
  for (let offset = 0; offset > -2; offset -= 1) {
    const date = parseNbaGameDate(
      new Date(Date.parse(`${today}T12:00:00.000Z`) + offset * 86_400_000)
        .toISOString()
        .slice(0, 10),
    )
    if (date) dates.push(date)
  }
  const bases = await repository.getCaches(dates.map((date) => gamesCacheKey('bbs', date)))
  const targets = bases.flatMap((base) =>
    base?.capability === 'games'
      ? base.data
          .filter((game) => game.provider === 'bbs' && game.status === 'final')
          .slice(0, 15)
          .map((game) => ({ date: game.nbaGameDate, gameId: game.id, base }))
      : [],
  )
  const boxes = await repository.getCaches(
    targets.map(({ gameId }) => gameDetailsCacheKey('bbs', gameId)),
  )
  const identities = new Set(snapshot.players.map(({ id }) => id))
  const newRefs = new Map<string, { date: string; gameId: string }[]>()
  const newGames = new Map<string, NonNullable<ReturnType<typeof boxPlayerLine>>[]>()
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]!
    const box = boxes[index]
    const verified = verifiedPlayerBox(
      target.base,
      box?.capability === 'boxScore' ? box : null,
      { date: target.date, gameId: target.gameId },
      season,
      now,
    )
    if (!verified) continue
    for (const line of verified.players) {
      const id = line.player.id
      if (!identities.has(id)) continue
      const game = boxPlayerLine(verified, id)
      if (!game) continue
      const refs = newRefs.get(id) ?? []
      refs.push({ date: game.date, gameId: game.gameId! })
      newRefs.set(id, refs)
      const games = newGames.get(id) ?? []
      games.push(game)
      newGames.set(id, games)
    }
  }
  const gameRefs = { ...snapshot.gameRefs }
  for (const player of snapshot.players) {
    const id = player.id
    const combined = new Map<string, { date: string; gameId: string }>()
    for (const ref of [...(gameRefs[id] ?? []), ...(newRefs.get(id) ?? [])])
      combined.set(ref.gameId, ref)
    gameRefs[id] = [...combined.values()]
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 15)
  }
  let boxLinks = 0
  for (const [id, refs] of Object.entries(gameRefs)) {
    const games = (newGames.get(id) ?? []).filter((game) => game !== null)
    const combined = combinePlayerGames(snapshot.details[id]?.games ?? [], games)
    const recentIds = new Set(refs.map((ref) => ref.gameId))
    boxLinks += combined.filter((game) => game.gameId && recentIds.has(game.gameId)).length
  }
  return refreshCoverage({
    ...snapshot,
    gameRefs,
    coverage: { ...snapshot.coverage, boxLinks: Math.max(snapshot.coverage.boxLinks, boxLinks) },
  })
}

function bbsPlayerIdValue(value: string) {
  const id = value.startsWith('bbs:player:') ? value.slice('bbs:player:'.length) : ''
  if (!UUID.test(id)) throw new Error('Invalid verified BBS player ID')
  return id
}

async function getDirectoryPage(
  db: D1Database,
  repository: NbaRepository,
  fetcher: typeof fetch,
  env: WorkerEnvironment,
  progress: PlayerRefreshProgress,
  lock: SchedulerLease,
  now: number,
) {
  const offset = progress.directoryOffset
  const payload = await getBbsJson(
    `/v1/stored/players?league=nba&season=${progress.seasonEndYear - 1}&limit=${PAGE_SIZE}&offset=${offset}`,
    env,
    repository,
    fetcher,
    now,
    lock,
  )
  let page
  try {
    page = normalizeBbsPlayerDirectoryPage(payload, progress.seasonEndYear - 1, offset)
  } catch {
    throw new InvalidDirectory('Invalid BBS player directory page')
  }
  if (progress.directoryTotal !== null && progress.directoryTotal !== page.total)
    throw new InvalidDirectory('BBS player directory total changed during pagination')
  progress.directoryTotal = page.total
  progress.directoryOffset += page.rows.length
  progress.pauseUntil = null
  await commitProgress(db, progress, lock, (time) => [
    directoryPageWrite(
      db,
      progress.seasonEndYear,
      {
        offset,
        total: page.total,
        payload,
        observedAt: new Date(time).toISOString(),
      },
      lock,
      time,
    ),
  ])
}

function retryAfter(cause: unknown, fallback: number) {
  return cause &&
    typeof cause === 'object' &&
    'retryAt' in cause &&
    typeof cause.retryAt === 'number' &&
    Number.isFinite(cause.retryAt)
    ? cause.retryAt
    : fallback
}

function isGlobalError(cause: unknown) {
  return (
    cause &&
    typeof cause === 'object' &&
    'code' in cause &&
    GLOBAL_PAUSE_CODES.has(String(cause.code))
  )
}

function nextCoreWindow(cycleStart: number) {
  const date = getDateKeyInTimeZone(new Date(cycleStart), NBA_TIME_ZONE)
  // Noon UTC on the next NBA date is before the outer scheduler's 10:00 ET gate.
  return Date.parse(`${date}T12:00:00.000Z`) + 86_400_000
}

function publicStatus(progress: PlayerRefreshProgress) {
  return {
    phase: progress.phase,
    total:
      progress.phase === 'idle'
        ? progress.lastCycleTotal
        : progress.phase === 'directory'
          ? (progress.directoryTotal ?? progress.playerIds.length)
          : progress.playerIds.length,
    checked: progress.successful + progress.retained + progress.failed,
    updated: progress.successful,
    retained: progress.retained,
    failed: progress.failed,
    cycleStartedAt: progress.cycleStartedAt,
    lastCompletedAt: progress.lastCompletedAt,
    nextCycleAt: progress.nextCycleAt,
  }
}

export function parseBbsPlayerRefreshStatus(
  progressJson: string | null | undefined,
  season: number,
) {
  const progress = progressJson ? parseProgress(progressJson, season) : null
  return progress ? publicStatus(progress) : null
}

async function finishCycle(
  db: D1Database,
  progress: PlayerRefreshProgress,
  lock: SchedulerLease,
  now: number,
  snapshot?: StoredPlayers,
) {
  progress.lastCycleTotal = progress.playerIds.length
  progress.phase = 'idle'
  progress.lastCompletedAt = new Date(now).toISOString()
  progress.nextCycleAt = nextCoreWindow(
    Date.parse(progress.cycleStartedAt ?? new Date(now).toISOString()),
  )
  progress.cursor = 0
  progress.playerIds = []
  progress.retries = []
  progress.pauseUntil = null
  if (snapshot) {
    const write = snapshotWrite(db, progress.seasonEndYear, snapshot, lock)
    await commitProgress(db, progress, lock, (time) => [write(time)])
  } else await saveProgress(db, progress, lock, now)
}

export async function runScheduledBbsPlayerRefresh(
  db: D1Database | undefined,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
  lock: SchedulerLease,
) {
  if (
    env.BBS_PLAYER_REFRESH_ENABLED !== 'true' ||
    env.BBS_REFRESH_ENABLED !== 'true' ||
    !env.BBS_API_KEY ||
    !db
  )
    return null
  const season = playerSeason
  let progress = await loadProgress(db, season)
  if (!progress || (progress.phase === 'idle' && now >= progress.nextCycleAt)) {
    const previous = progress
    progress = initialProgress(season, await loadSnapshot(db, season), now)
    progress.lastCompletedAt = previous?.lastCompletedAt ?? null
    progress.lastEnrichedPlayerId = previous?.lastEnrichedPlayerId ?? null
  }
  if (progress.phase === 'idle' || (progress.pauseUntil ?? 0) > now) return publicStatus(progress)

  try {
    if (progress.phase === 'directory') {
      if (progress.directoryTotal !== null && progress.directoryOffset === progress.directoryTotal)
        await publishDirectory(db, repository, progress, lock, now)
      else await getDirectoryPage(db, repository, fetcher, env, progress, lock, now)
    } else if (
      progress.phase === 'averages' ||
      progress.phase === 'publish' ||
      progress.phase === 'retry'
    ) {
      const observations =
        (await pendingObservations(db, season, OBSERVATION_BATCH_SIZE)).results ?? []
      if (
        observations.length === OBSERVATION_BATCH_SIZE ||
        (progress.phase === 'publish' && observations.length > 0)
      ) {
        await publishObservations(db, progress, lock, observations)
      } else if (progress.phase === 'publish') {
        progress.phase = 'gameRefs'
        await saveProgress(db, progress, lock, Date.now())
      } else {
        await refreshAverage(db, repository, fetcher, env, progress, lock, now)
      }
    } else if (progress.phase === 'gameRefs') {
      const snapshot = await loadSnapshot(db, season)
      if (!snapshot) throw new Error('Missing player snapshot for game links')
      const data = await refreshRecentGameRefs(repository, snapshot, season, now)
      progress.phase = 'enrich'
      const write = snapshotWrite(db, season, data, lock)
      await commitProgress(db, progress, lock, (time) => [write(time)])
    } else if (progress.phase === 'enrich') {
      const snapshot = await loadSnapshot(db, season)
      let enriched
      const lastEnriched = progress.lastEnrichedPlayerId
      try {
        if (snapshot)
          enriched = await enrichOnePlayer(repository, fetcher, env, progress, snapshot, lock, now)
      } catch (cause) {
        if (!(cause instanceof InvalidPlayerDetail) && !isRejectedPlayerResponse(cause)) {
          progress.lastEnrichedPlayerId = lastEnriched
          throw cause
        }
      }
      await finishCycle(db, progress, lock, Date.now(), enriched)
    }
  } catch (cause) {
    if (cause instanceof InvalidDirectory) {
      progress.directoryOffset = 0
      progress.directoryTotal = null
      progress.pauseUntil = Date.now() + PLAYER_RETRY_MS
      await commitProgress(db, progress, lock, (time) => [
        deleteDirectoryPages(db, season, lock, time),
      ])
    } else if (isGlobalError(cause)) {
      progress.pauseUntil = retryAfter(cause, Date.now() + PLAYER_RETRY_MS)
      await saveProgress(db, progress, lock, Date.now())
    } else {
      throw cause
    }
  }
  return publicStatus(progress)
}

function isRejectedPlayerResponse(cause: unknown) {
  return (
    record(cause) &&
    ['not_found', 'invalid_response', 'invalid_request'].includes(String(cause.code))
  )
}

async function refreshAverage(
  db: D1Database,
  repository: NbaRepository,
  fetcher: typeof fetch,
  env: WorkerEnvironment,
  progress: PlayerRefreshProgress,
  lock: SchedulerLease,
  now: number,
) {
  const retry =
    progress.phase === 'retry' ? progress.retries.find((item) => item.retryAt <= now) : undefined
  const id = progress.phase === 'averages' ? progress.playerIds[progress.cursor] : retry?.id
  if (!id) return
  let payload: unknown
  let rejected = false
  try {
    payload = await getBbsJson(
      `/v1/nba/players/${id}/season-averages?season=${progress.seasonEndYear - 1}`,
      env,
      repository,
      fetcher,
      now,
      lock,
    )
  } catch (cause) {
    if (!isRejectedPlayerResponse(cause)) throw cause
    rejected = true
  }
  let stats: PlayerStats | null = null
  if (!rejected) {
    try {
      stats = normalizeAverage(
        Array.isArray(payload) ? { data: payload } : payload,
        {
          id: `bbs:player:${id}`,
          name: 'Player',
          team: null,
          position: null,
          number: null,
          height: null,
          weight: null,
          stats: null,
        },
        progress.seasonEndYear - 1,
      )
    } catch {
      rejected = true
    }
  }
  if (!retry) progress.cursor += 1
  if (rejected) {
    if (!retry) progress.retries.push({ id, attempts: 1, retryAt: now + PLAYER_RETRY_MS })
    else if (retry.attempts < 3) {
      retry.attempts += 1
      retry.retryAt = now + PLAYER_RETRY_MS * 2 ** (retry.attempts - 1)
    } else {
      progress.retries = progress.retries.filter((item) => item !== retry)
      progress.failed += 1
    }
  } else if (retry) {
    progress.retries = progress.retries.filter((item) => item !== retry)
  }
  if (progress.cursor === progress.playerIds.length)
    progress.phase = progress.retries.length ? 'retry' : 'publish'
  progress.pauseUntil = null
  if (rejected) await saveProgress(db, progress, lock, Date.now())
  else
    await commitProgress(db, progress, lock, (time) => [
      averageWrite(db, progress.seasonEndYear, id, stats, new Date(time).toISOString(), lock, time),
    ])
}
