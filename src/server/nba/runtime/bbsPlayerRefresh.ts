import type { NbaPlayerEntry, PlayerStats } from '@/entities/nba/players'
import { playerSeason } from '@/entities/nba/players'
import {
  bbsDirectoryPlayer,
  normalizeBbsPlayerDirectoryPage,
} from '@/server/nba/adapters/bbsPlayers'
import { findNbaTeam } from '@/entities/nba/teamCatalog'
import {
  calendarDate,
  isPlayerDetail,
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

async function saveProgress(
  db: D1Database,
  progress: PlayerRefreshProgress,
  lock: { key: string; token: string },
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO nba_player_refresh_state (season_end_year, progress_json, updated_at_ms)
     SELECT ?1, ?2, ?3 WHERE EXISTS (
       SELECT 1 FROM nba_refresh_locks WHERE lock_key = ?4 AND token = ?5 AND lease_expires_at_ms > ?3
     )
     ON CONFLICT(season_end_year) DO UPDATE SET progress_json=excluded.progress_json, updated_at_ms=excluded.updated_at_ms
     WHERE EXISTS (SELECT 1 FROM nba_refresh_locks WHERE lock_key = ?4 AND token = ?5 AND lease_expires_at_ms > ?3)`,
    )
    .bind(progress.seasonEndYear, JSON.stringify(progress), now, lock.key, lock.token)
    .run()
  return result.meta?.changes === 1
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
  try {
    const payload: unknown = JSON.parse(row.payload)
    return isStoredPlayers(payload, season) ? payload : null
  } catch {
    return null
  }
}

async function saveSnapshot(
  db: D1Database,
  season: number,
  data: StoredPlayers,
  lock: { key: string; token: string },
  now: number,
): Promise<boolean> {
  if (!isStoredPlayers(data, season)) throw new Error('Refusing to publish invalid player snapshot')
  const observations = [data.directoryAt, ...Object.values(data.averageAt)].filter(timestamp)
  const fetchedAt = observations.reduce((oldest, value) =>
    Date.parse(value) < Date.parse(oldest) ? value : oldest,
  )
  const payload = JSON.stringify(data)
  if (new TextEncoder().encode(payload).byteLength >= MAX_SNAPSHOT_BYTES)
    throw new Error('Player snapshot exceeds safe D1 row size')
  const result = await db
    .prepare(
      `INSERT INTO nba_player_snapshot (season_end_year, fetched_at, payload)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(season_end_year) DO UPDATE SET fetched_at=excluded.fetched_at, payload=excluded.payload
     WHERE EXISTS (SELECT 1 FROM nba_refresh_locks WHERE lock_key=?4 AND token=?5 AND lease_expires_at_ms>?6)`,
    )
    .bind(season, fetchedAt, payload, lock.key, lock.token, now)
    .run()
  return result.meta?.changes === 1
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

async function saveDirectoryPage(
  db: D1Database,
  season: number,
  page: { offset: number; total: number; payload: unknown; observedAt: string },
  lock: { key: string; token: string },
  now: number,
) {
  const result = await db
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
    .run()
  return result.meta?.changes === 1
}

async function publishDirectory(
  db: D1Database,
  repository: NbaRepository,
  progress: PlayerRefreshProgress,
  lock: { key: string; token: string },
  now: number,
): Promise<StoredPlayers> {
  const total = progress.directoryTotal
  if (!total || progress.directoryOffset < total) throw new Error('Incomplete BBS player directory')
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
      throw new Error('Incomplete staged BBS player directory')
    const page = normalizeBbsPlayerDirectoryPage(
      JSON.parse(pageRow.payload_json),
      progress.seasonEndYear - 1,
      pageRow.page_offset,
    )
    if (page.total !== total)
      throw new Error('BBS player directory total changed during pagination')
    rows.push(...page.rows)
    if (Date.parse(pageRow.observed_at) < Date.parse(oldest)) oldest = pageRow.observed_at
  }
  if (rows.length !== total) throw new Error('Incomplete staged BBS player directory')
  const providerTeams = await repository.getCache(
    teamDirectoryCacheKey('bbs', progress.seasonEndYear as never),
  )
  const teamByProviderId = teamCrosswalk(
    providerTeams?.capability === 'teamDirectory' ? providerTeams.data : null,
  )
  const incoming = new Map<string, NbaPlayerEntry>()
  for (const row of rows) {
    const player = bbsDirectoryPlayer(row, teamByProviderId)
    if (incoming.has(player.id)) throw new Error('Duplicate BBS player directory identity')
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
  if (!isStoredPlayers(data, progress.seasonEndYear))
    throw new Error('BBS player directory failed snapshot validation')
  if (!(await saveSnapshot(db, progress.seasonEndYear, data, lock, Date.now())))
    throw new Error('Lost scheduler lease before directory publication')
  await db.batch([
    db
      .prepare('DELETE FROM nba_player_refresh_directory_pages WHERE season_end_year=?1')
      .bind(progress.seasonEndYear),
  ])
  progress.phase = 'averages'
  progress.playerIds = players.map(({ id }) => id.slice('bbs:player:'.length))
  progress.cursor = 0
  progress.directoryOffset = 0
  progress.directoryTotal = null
  return data
}

async function stageAverage(
  db: D1Database,
  season: number,
  playerId: string,
  stats: PlayerStats | null,
  observedAt: string,
  lock: { key: string; token: string },
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO nba_player_refresh_observations (season_end_year,player_id,stats_json,observed_at,published_at_ms)
     SELECT ?1,?2,?3,?4,NULL WHERE EXISTS (
       SELECT 1 FROM nba_refresh_locks WHERE lock_key=?5 AND token=?6 AND lease_expires_at_ms>?7
     ) ON CONFLICT(season_end_year,player_id) DO UPDATE SET stats_json=excluded.stats_json,observed_at=excluded.observed_at,published_at_ms=NULL
     WHERE nba_player_refresh_observations.observed_at < excluded.observed_at`,
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
    .run()
  return (result.meta?.changes ?? 0) === 1
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
  lock: { key: string; token: string },
  now: number,
): Promise<number> {
  const result = await pendingObservations(db, progress.seasonEndYear, OBSERVATION_BATCH_SIZE)
  const observations = result.results ?? []
  if (!observations.length) return 0
  const data = await loadSnapshot(db, progress.seasonEndYear)
  if (!data) throw new Error('Player snapshot unavailable while publishing season averages')
  const playersById = new Map(data.players.map((player) => [player.id, player]))
  const touched: string[] = []
  for (const row of observations) {
    const player = playersById.get(row.player_id)
    if (!player || !timestamp(row.observed_at)) continue
    let stats: unknown
    try {
      stats = JSON.parse(row.stats_json)
    } catch {
      continue
    }
    if (stats !== null && !isPlayerEntry({ ...player, stats })) continue
    const previousAt = data.averageAt[row.player_id]
    if (previousAt && Date.parse(previousAt) >= Date.parse(row.observed_at)) {
      touched.push(row.player_id)
      continue
    }
    if (stats !== null) {
      const updated = { ...player, stats: stats as PlayerStats }
      const index = data.players.findIndex(({ id }) => id === row.player_id)
      data.players[index] = updated
      playersById.set(row.player_id, updated)
    }
    data.averageAt[row.player_id] = row.observed_at
    touched.push(row.player_id)
  }
  const updated = refreshCoverage(data)
  if (!isStoredPlayers(updated, progress.seasonEndYear))
    throw new Error('Refusing invalid staged player averages')
  const payload = JSON.stringify(updated)
  if (new TextEncoder().encode(payload).byteLength >= MAX_SNAPSHOT_BYTES)
    throw new Error('Player snapshot exceeds safe D1 row size')
  const statements = [
    db
      .prepare(
        `INSERT INTO nba_player_snapshot (season_end_year,fetched_at,payload) VALUES (?1,?2,?3)
       ON CONFLICT(season_end_year) DO UPDATE SET fetched_at=excluded.fetched_at,payload=excluded.payload
       WHERE EXISTS (SELECT 1 FROM nba_refresh_locks WHERE lock_key=?4 AND token=?5 AND lease_expires_at_ms>?6)`,
      )
      .bind(progress.seasonEndYear, oldestObservation(updated), payload, lock.key, lock.token, now),
    ...touched.map((id) =>
      db
        .prepare(
          'UPDATE nba_player_refresh_observations SET published_at_ms=?3 WHERE season_end_year=?1 AND player_id=?2 AND published_at_ms IS NULL',
        )
        .bind(progress.seasonEndYear, id, now),
    ),
  ]
  const batch = await db.batch(statements)
  return batch[0]?.meta?.changes === 1 ? touched.length : 0
}

function oldestObservation(data: StoredPlayers) {
  const dates = [data.directoryAt, ...Object.values(data.averageAt)].filter(timestamp)
  return dates.reduce((oldest, value) => (Date.parse(value) < Date.parse(oldest) ? value : oldest))
}

async function updatePlayerDetail(
  db: D1Database,
  progress: PlayerRefreshProgress,
  playerId: string,
  update: (detail: StoredPlayerDetail) => StoredPlayerDetail,
  lock: { key: string; token: string },
  now: number,
) {
  const data = await loadSnapshot(db, progress.seasonEndYear)
  if (!data) throw new Error('Player snapshot unavailable during profile enrichment')
  const id = `bbs:player:${playerId}`
  if (!data.players.some((player) => player.id === id))
    throw new Error('Unknown BBS player during enrichment')
  const current: StoredPlayerDetail = data.details[id] ?? {
    birthDate: null,
    currentTeam: null,
    profileAt: null,
    logAt: null,
    games: [],
  }
  data.details[id] = update(current)
  const refreshed = refreshCoverage(data)
  if (!isStoredPlayers(refreshed, progress.seasonEndYear))
    throw new Error('Refusing invalid enriched player snapshot')
  if (!(await saveSnapshot(db, progress.seasonEndYear, refreshed, lock, now)))
    throw new Error('Lost scheduler lease while publishing player enrichment')
}

function normalizedProfile(
  payload: unknown,
  id: string,
  teamByProviderId: ReadonlyMap<string, string>,
) {
  const root = record(payload) && record(payload.data) ? payload.data : null
  const profile = root && record(root.player) ? root.player : null
  if (!profile || `bbs:player:${profile.id}` !== `bbs:player:${id}` || profile.league !== 'NBA')
    throw new Error('BBS player profile identity mismatch')
  const birthDate = profile.date_of_birth
  if (birthDate !== null && birthDate !== undefined && !calendarDate(birthDate))
    throw new Error('Invalid BBS player birth date')
  const current = profile.current_team
  if (
    current !== null &&
    current !== undefined &&
    (!record(current) || typeof current.id !== 'string' || !UUID.test(current.id))
  )
    throw new Error('Invalid BBS player current team')
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
  if (!Array.isArray(rows) || rows.length > 15) throw new Error('Invalid BBS player game log')
  const games: StoredPlayerDetail['games'] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (
      !record(row) ||
      !seasonDate(row.date, season) ||
      (row.player_id != null && String(row.player_id) !== playerId)
    )
      throw new Error('BBS player game log identity/date mismatch')
    const matchId =
      row.match_id === null || row.match_id === undefined ? null : String(row.match_id)
    if (matchId !== null && !/^[\w-]{1,100}$/.test(matchId))
      throw new Error('Invalid BBS player game reference')
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
  db: D1Database,
  repository: NbaRepository,
  fetcher: typeof fetch,
  env: WorkerEnvironment,
  progress: PlayerRefreshProgress,
  snapshot: StoredPlayers,
  lock: { key: string; token: string },
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
  await updatePlayerDetail(
    db,
    progress,
    id,
    (detail) => ({
      ...detail,
      birthDate: profile.birthDate ?? detail.birthDate,
      currentTeam: profile.currentTeam ?? detail.currentTeam,
      profileAt,
    }),
    lock,
    Date.now(),
  )

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
  const keepGames = games.length > 0 || !old?.games.length
  if (
    isPlayerDetail(
      {
        ...(old ?? { birthDate: null, currentTeam: null, profileAt: null, logAt: null, games: [] }),
        games: keepGames ? games : old!.games,
      },
      progress.seasonEndYear,
    )
  ) {
    await updatePlayerDetail(
      db,
      progress,
      id,
      (detail) => ({
        ...detail,
        games: keepGames ? games : detail.games,
        logAt,
      }),
      lock,
      Date.now(),
    )
  } else {
    throw new Error('Invalid normalized BBS player game log')
  }
  progress.lastEnrichedPlayerId = id
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
  return refreshCoverage({ ...snapshot, gameRefs, coverage: { ...snapshot.coverage, boxLinks } })
}

function bbsPlayerIdValue(value: string) {
  const id = value.startsWith('bbs:player:') ? value.slice('bbs:player:'.length) : ''
  if (!UUID.test(id)) throw new Error('Invalid verified BBS player ID')
  return id
}

function parseAverageResponse(payload: unknown, player: NbaPlayerEntry, startYear: number) {
  const wrapped = record(payload) && 'data' in payload ? payload : { data: payload }
  return normalizeAverage(wrapped, player, startYear)
}

async function getDirectoryPage(
  db: D1Database,
  repository: NbaRepository,
  fetcher: typeof fetch,
  env: WorkerEnvironment,
  progress: PlayerRefreshProgress,
  lock: { key: string; token: string },
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
  const page = normalizeBbsPlayerDirectoryPage(payload, progress.seasonEndYear - 1, offset)
  if (progress.directoryTotal !== null && progress.directoryTotal !== page.total)
    throw new Error('BBS player directory total changed during pagination')
  if (!progress.directoryTotal) progress.directoryTotal = page.total
  const observedAt = new Date(Date.now()).toISOString()
  if (
    !(await saveDirectoryPage(
      db,
      progress.seasonEndYear,
      { offset, total: page.total, payload, observedAt },
      lock,
      Date.now(),
    ))
  )
    throw new Error('Lost scheduler lease while staging player directory')
  progress.directoryOffset += page.rows.length
  if (progress.directoryOffset >= page.total) {
    await publishDirectory(db, repository, progress, lock, Date.now())
    progress.cycleStartedAt = new Date(Date.now()).toISOString()
  }
}

function retryAfter(cause: unknown, fallback: number) {
  return cause &&
    typeof cause === 'object' &&
    'retryAt' in cause &&
    Number.isFinite(Number(cause.retryAt))
    ? Number(cause.retryAt)
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

function nextUtcDay(now: number) {
  return Math.floor(now / 86_400_000) * 86_400_000 + 86_400_000
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
    updated: progress.successful,
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
  lock: { key: string; token: string },
  now: number,
) {
  progress.lastCycleTotal = progress.playerIds.length
  progress.phase = 'idle'
  progress.lastCompletedAt = new Date(now).toISOString()
  progress.nextCycleAt = nextUtcDay(now)
  progress.cursor = 0
  progress.playerIds = []
  progress.retries = []
  progress.pauseUntil = null
  await saveProgress(db, progress, lock, now)
}

async function maybePublish(
  db: D1Database,
  progress: PlayerRefreshProgress,
  lock: { key: string; token: string },
  now: number,
  force: boolean,
) {
  const count = await db
    .prepare(
      'SELECT COUNT(*) AS total FROM nba_player_refresh_observations WHERE season_end_year=?1 AND published_at_ms IS NULL',
    )
    .bind(progress.seasonEndYear)
    .first<{ total: number }>()
  if (!count || count.total === 0 || (!force && count.total < OBSERVATION_BATCH_SIZE)) return 0
  return publishObservations(db, progress, lock, now)
}

export async function runScheduledBbsPlayerRefresh(
  db: D1Database | undefined,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
  lock: { key: string; token: string },
) {
  if (
    env.BBS_PLAYER_REFRESH_ENABLED !== 'true' ||
    env.BBS_REFRESH_ENABLED !== 'true' ||
    !env.BBS_API_KEY ||
    !db
  )
    return null
  const season = playerSeason
  const snapshot = await loadSnapshot(db, season)
  let progress = await loadProgress(db, season)
  if (!progress) progress = initialProgress(season, snapshot, now)
  if (progress.pauseUntil !== null && progress.pauseUntil > now) return publicStatus(progress)
  if (progress.phase === 'idle') {
    if (now < progress.nextCycleAt) return publicStatus(progress)
    const lastCompletedAt = progress.lastCompletedAt
    const lastEnrichedPlayerId = progress.lastEnrichedPlayerId
    const directoryDue = !snapshot || now - Date.parse(snapshot.directoryAt) >= DIRECTORY_REFRESH_MS
    progress = initialProgress(season, snapshot, now)
    progress.phase = directoryDue ? 'directory' : 'averages'
    progress.lastCompletedAt = lastCompletedAt
    progress.lastEnrichedPlayerId = lastEnrichedPlayerId
  }
  try {
    if (progress.phase === 'directory') {
      await getDirectoryPage(db, repository, fetcher, env, progress, lock, now)
      progress.pauseUntil = null
      await saveProgress(db, progress, lock, Date.now())
      return publicStatus(progress)
    }
    if (progress.phase === 'averages') {
      if (progress.cursor >= progress.playerIds.length) {
        progress.phase = progress.retries.length ? 'retry' : 'publish'
        await maybePublish(db, progress, lock, Date.now(), true)
        await saveProgress(db, progress, lock, Date.now())
        return publicStatus(progress)
      }
      const playerId = progress.playerIds[progress.cursor]!
      const fullId = `bbs:player:${playerId}`
      const payload = await getBbsJson(
        `/v1/nba/players/${playerId}/season-averages?season=${season - 1}`,
        env,
        repository,
        fetcher,
        now,
        lock,
      )
      const placeholder: NbaPlayerEntry = {
        id: fullId,
        name: 'Player',
        team: null,
        position: null,
        number: null,
        height: null,
        weight: null,
        stats: null,
      }
      const stats = parseAverageResponse(payload, placeholder, season - 1)
      if (
        !(await stageAverage(
          db,
          season,
          playerId,
          stats,
          new Date(Date.now()).toISOString(),
          lock,
          Date.now(),
        ))
      )
        throw new Error('Lost scheduler lease while staging player average')
      progress.cursor += 1
      progress.successful += 1
      progress.pauseUntil = null
      await maybePublish(
        db,
        progress,
        lock,
        Date.now(),
        progress.cursor >= progress.playerIds.length,
      )
      if (progress.cursor >= progress.playerIds.length)
        progress.phase = progress.retries.length ? 'retry' : 'publish'
      await saveProgress(db, progress, lock, Date.now())
      return publicStatus(progress)
    }
    if (progress.phase === 'publish') {
      const written = await maybePublish(db, progress, lock, Date.now(), true)
      const count = await db
        .prepare(
          'SELECT COUNT(*) AS total FROM nba_player_refresh_observations WHERE season_end_year=?1 AND published_at_ms IS NULL',
        )
        .bind(season)
        .first<{ total: number }>()
      if ((count?.total ?? 0) === 0) progress.phase = 'gameRefs'
      else if (!written) throw new Error('Unable to publish staged player averages')
      await saveProgress(db, progress, lock, Date.now())
      return publicStatus(progress)
    }
    if (progress.phase === 'gameRefs') {
      if (snapshot) {
        const data = await refreshRecentGameRefs(repository, snapshot, season, now)
        if (!(await saveSnapshot(db, season, data, lock, Date.now())))
          throw new Error('Lost scheduler lease while publishing cached player game links')
      }
      progress.phase = 'enrich'
      await saveProgress(db, progress, lock, Date.now())
      return publicStatus(progress)
    }
    if (progress.phase === 'retry') {
      const retryIndex = progress.retries.findIndex((entry) => entry.retryAt <= now)
      if (retryIndex < 0) {
        if (progress.retries.length) return publicStatus(progress)
        progress.phase = 'publish'
        await saveProgress(db, progress, lock, Date.now())
        return publicStatus(progress)
      }
      const retry = progress.retries[retryIndex]!
      const payload = await getBbsJson(
        `/v1/nba/players/${retry.id}/season-averages?season=${season - 1}`,
        env,
        repository,
        fetcher,
        now,
        lock,
      )
      const player = snapshot?.players.find(({ id }) => id === `bbs:player:${retry.id}`)
      if (!player) throw new Error('Player disappeared during averages retry')
      const stats = parseAverageResponse(payload, player, season - 1)
      if (
        !(await stageAverage(
          db,
          season,
          retry.id,
          stats,
          new Date(Date.now()).toISOString(),
          lock,
          Date.now(),
        ))
      )
        throw new Error('Lost scheduler lease while staging player average retry')
      progress.retries.splice(retryIndex, 1)
      progress.successful += 1
      progress.phase = progress.retries.length ? 'retry' : 'publish'
      await maybePublish(db, progress, lock, Date.now(), true)
      await saveProgress(db, progress, lock, Date.now())
      return publicStatus(progress)
    }
    if (progress.phase === 'enrich') {
      if (snapshot)
        await enrichOnePlayer(db, repository, fetcher, env, progress, snapshot, lock, now)
      await finishCycle(db, progress, lock, Date.now())
      return publicStatus(progress)
    }
  } catch (cause) {
    if (isGlobalError(cause)) {
      progress.pauseUntil = retryAfter(cause, Date.now() + 15 * 60_000)
    } else if (progress.phase === 'averages' && progress.cursor < progress.playerIds.length) {
      const id = progress.playerIds[progress.cursor]!
      progress.cursor += 1
      progress.failed += 1
      progress.retries.push({ id, attempts: 1, retryAt: Date.now() + PLAYER_RETRY_MS })
      if (progress.cursor >= progress.playerIds.length) progress.phase = 'retry'
    } else if (progress.phase === 'retry') {
      const due = progress.retries.find((retry) => retry.retryAt <= now)
      if (due) {
        if (due.attempts >= 3) {
          progress.retries = progress.retries.filter((retry) => retry.id !== due.id)
          progress.failed += 1
        } else {
          due.attempts += 1
          due.retryAt = Date.now() + PLAYER_RETRY_MS * 2 ** (due.attempts - 1)
        }
      }
    } else {
      progress.pauseUntil = Date.now() + PLAYER_RETRY_MS
    }
    await saveProgress(db, progress, lock, Date.now())
    return publicStatus(progress)
  } finally {
    /* The outer scheduled runner owns and releases the shared lease. */
  }
  return publicStatus(progress)
}

export function playerRefreshPublicStatus(progress: PlayerRefreshProgress | null) {
  return progress ? publicStatus(progress) : null
}

export type { PlayerRefreshProgress }
