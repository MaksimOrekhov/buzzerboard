import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { isStoredPlayers, timestamp } from '../src/entities/nba/playerSnapshotGuards.ts'
import {
  isGameBoxScoreForGame,
  isGameRecord,
  isTeamRecord,
} from '../src/shared/api/nba/gameDetailsGuards.ts'

const apiBase = 'https://api.cloudflare.com/client/v4'
const allowedTeams = new Set([
  'ATL',
  'BKN',
  'BOS',
  'CHA',
  'CHI',
  'CLE',
  'DAL',
  'DEN',
  'DET',
  'GSW',
  'HOU',
  'IND',
  'LAC',
  'LAL',
  'MEM',
  'MIA',
  'MIL',
  'MIN',
  'NOP',
  'NYK',
  'OKC',
  'ORL',
  'PHI',
  'PHX',
  'POR',
  'SAC',
  'SAS',
  'TOR',
  'UTA',
  'WAS',
])
const args = process.argv.slice(2)
const [mode, ...options] = args

function option(name) {
  const index = options.indexOf(name)
  return index < 0 ? undefined : options[index + 1]
}

function requiredOption(name) {
  const value = option(name)
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function jsonFile(path, value) {
  return writeFile(path, `${JSON.stringify(value)}\n`, { mode: 0o600 })
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMillis(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function isNullableNumber(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isNullableCount(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 0)
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isCanonicalTeamId(value) {
  return (
    typeof value === 'string' &&
    /^nba:team:[A-Z]{3}$/.test(value) &&
    allowedTeams.has(value.slice(9))
  )
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function safeJson(value, maxBytes, description) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maxBytes)
    throw new Error(`${description} exceeds the safe size limit.`)
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${description} is not valid JSON.`)
  }
}

function validateTeamSeasonData(value, teamId, seasonEndYear, providerTeamId) {
  if (!isRecord(value) || !isTeamRecord(value.team) || !isRecord(value.stats)) return false
  if (
    value.team.id !== teamId ||
    value.team.providerId !== providerTeamId ||
    value.seasonEndYear !== seasonEndYear ||
    !isNullableCount(value.wins) ||
    !isNullableCount(value.losses) ||
    !isNullableNumber(value.winPercentage) ||
    !isNullableNumber(value.overallRank) ||
    !isNullableNumber(value.conferenceRank) ||
    !isNullableNumber(value.gamesBack) ||
    !isNullableNumber(value.stats.gamesPlayed) ||
    !isNullableNumber(value.stats.pointsPerGame) ||
    !isNullableNumber(value.stats.fieldGoalPercentage) ||
    !isNullableNumber(value.stats.threePointPercentage) ||
    !isNullableNumber(value.stats.reboundsPerGame) ||
    !isNullableNumber(value.stats.assistsPerGame) ||
    !isNullableNumber(value.stats.turnoversPerGame) ||
    (value.streak !== null && typeof value.streak !== 'string') ||
    !validateRecordSplit(value.home) ||
    !validateRecordSplit(value.away) ||
    (value.lastTen !== null &&
      (!Array.isArray(value.lastTen) ||
        value.lastTen.length > 10 ||
        !value.lastTen.every(validateRecentGame))) ||
    !Array.isArray(value.leaders) ||
    value.leaders.length > 30 ||
    !value.leaders.every(validateLeader) ||
    (value.nextGame !== null && !validateUpcomingGame(value.nextGame))
  )
    return false
  return true
}

function validateRecordSplit(value) {
  return (
    value === null ||
    (isRecord(value) &&
      isNullableCount(value.wins) &&
      isNullableCount(value.losses) &&
      isNullableCount(value.ties))
  )
}

function validateRecentGame(value) {
  return (
    isRecord(value) &&
    (value.gameId === null ||
      (typeof value.gameId === 'string' && /^bbs:game:[\w-]{1,100}$/.test(value.gameId))) &&
    isCalendarDate(value.nbaGameDate) &&
    typeof value.opponentCode === 'string' &&
    allowedTeams.has(value.opponentCode) &&
    (value.result === 'W' || value.result === 'L') &&
    isNullableCount(value.pointsFor) &&
    isNullableCount(value.pointsAgainst) &&
    (value.venue === null || value.venue === 'home' || value.venue === 'away')
  )
}

function validateLeader(value) {
  return (
    isRecord(value) &&
    typeof value.playerId === 'string' &&
    /^bbs:player:[0-9a-f-]{36}$/i.test(value.playerId) &&
    typeof value.displayName === 'string' &&
    value.displayName.trim().length > 0 &&
    typeof value.statLabel === 'string' &&
    value.statLabel.trim().length > 0 &&
    isNullableNumber(value.statValue)
  )
}

function validateUpcomingGame(value) {
  return (
    isRecord(value) &&
    (value.gameId === null ||
      (typeof value.gameId === 'string' && /^bbs:game:[\w-]{1,100}$/.test(value.gameId))) &&
    (value.nbaGameDate === undefined ||
      value.nbaGameDate === null ||
      isCalendarDate(value.nbaGameDate)) &&
    (value.startsAt === null || timestamp(value.startsAt)) &&
    (value.isHome === null || typeof value.isHome === 'boolean') &&
    (value.opponentCode === null || allowedTeams.has(value.opponentCode))
  )
}

function validateTeamDirectoryData(value) {
  if (!Array.isArray(value) || value.length !== 30) return false
  const teamIds = new Set()
  const providerIds = new Set()
  return (
    value.every((entry) => {
      if (!isRecord(entry) || !isCanonicalTeamId(entry.teamId)) return false
      if (typeof entry.providerTeamId !== 'string' || !entry.providerTeamId.trim()) return false
      if (teamIds.has(entry.teamId) || providerIds.has(entry.providerTeamId)) return false
      teamIds.add(entry.teamId)
      providerIds.add(entry.providerTeamId)
      return true
    }) && teamIds.size === 30
  )
}

function validateCacheRow(row, now) {
  if (!isRecord(row)) throw new Error('Cache row has an invalid shape.')
  const { cacheKey, capability, recordJson, expiresAtMs, staleUntilMs, updatedAtMs } = row
  if (
    typeof cacheKey !== 'string' ||
    !cacheKey.startsWith('bbs:nba:') ||
    !['games', 'boxScore', 'teamSeason', 'teamDirectory'].includes(capability) ||
    !isMillis(expiresAtMs) ||
    !isMillis(staleUntilMs) ||
    !isMillis(updatedAtMs) ||
    staleUntilMs < expiresAtMs
  )
    throw new Error('Cache row identity or SQL metadata is invalid.')
  const record = safeJson(recordJson, 1_900_000, 'Cache row')
  if (
    !isRecord(record) ||
    record.provider !== 'bbs' ||
    record.cacheKey !== cacheKey ||
    record.capability !== capability ||
    !timestamp(record.fetchedAt) ||
    (record.providerUpdatedAt !== null && !timestamp(record.providerUpdatedAt)) ||
    !Number.isSafeInteger(record.rejectedRecords) ||
    record.rejectedRecords < 0 ||
    record.expiresAt !== expiresAtMs ||
    record.staleUntil !== staleUntilMs ||
    updatedAtMs < Date.parse(record.fetchedAt) ||
    updatedAtMs - Date.parse(record.fetchedAt) > 5 * 60_000 ||
    !isMillis(record.expiresAt) ||
    !isMillis(record.staleUntil) ||
    (record.retryAt !== null && !isMillis(record.retryAt)) ||
    (record.refreshError !== null && !isRecord(record.refreshError)) ||
    record.expiresAt <= updatedAtMs ||
    record.staleUntil < record.expiresAt ||
    updatedAtMs > now + 5 * 60_000
  )
    throw new Error(`Cache row validation failed for ${cacheKey}.`)

  if (capability === 'games') {
    const match = /^bbs:nba:games:date=(\d{4}-\d{2}-\d{2})$/.exec(cacheKey)
    if (
      !match ||
      !isCalendarDate(match[1]) ||
      !Array.isArray(record.data) ||
      new Set(record.data.map((game) => (isRecord(game) ? game.id : null))).size !==
        record.data.length ||
      !record.data.every(
        (game) => isGameRecord(game) && game.provider === 'bbs' && game.nbaGameDate === match[1],
      )
    )
      throw new Error(`Games payload validation failed for ${cacheKey}.`)
  } else if (capability === 'boxScore') {
    const match = /^bbs:nba:game-details:id=(.+)$/.exec(cacheKey)
    const gameId = match ? safeDecode(match[1]) : null
    const game = isRecord(record.data) ? record.data.game : null
    if (
      !gameId ||
      !/^bbs:game:[\w-]{1,100}$/.test(gameId) ||
      record.gameId !== gameId ||
      !isGameRecord(game) ||
      game.id !== gameId ||
      game.provider !== 'bbs' ||
      !isGameBoxScoreForGame(record.data, game)
    )
      throw new Error(`Box-score payload validation failed for ${cacheKey}.`)
  } else if (capability === 'teamSeason') {
    const match = /^bbs:nba:team-season:team=([^:]+):season=(20\d{2})$/.exec(cacheKey)
    const teamId = match ? safeDecode(match[1]) : null
    const year = match ? Number(match[2]) : null
    if (
      !match ||
      !isCanonicalTeamId(teamId) ||
      !Number.isSafeInteger(year) ||
      record.teamId !== teamId ||
      record.seasonEndYear !== year ||
      typeof record.providerTeamId !== 'string' ||
      !record.providerTeamId.trim() ||
      !validateTeamSeasonData(record.data, teamId, year, record.providerTeamId)
    )
      throw new Error(`Team-season payload validation failed for ${cacheKey}.`)
  } else if (capability === 'teamDirectory') {
    const match = /^bbs:nba:team-directory:season=(20\d{2})$/.exec(cacheKey)
    const year = match ? Number(match[1]) : null
    if (!match || record.seasonEndYear !== year || !validateTeamDirectoryData(record.data))
      throw new Error(`Team-directory payload validation failed for ${cacheKey}.`)
  }

  const expired = staleUntilMs < now
  if (!expired && now - updatedAtMs > 30 * 24 * 60 * 60_000)
    throw new Error(`Cache row is older than the allowed seed age: ${cacheKey}.`)
  return { record, expired }
}

export function validateSeedSnapshot(snapshot, now = Date.now()) {
  if (
    !isRecord(snapshot) ||
    snapshot.formatVersion !== 2 ||
    snapshot.source !== 'local-d1-bbs-normalized-cache' ||
    !timestamp(snapshot.exportedAt) ||
    Date.parse(snapshot.exportedAt) > now + 5 * 60_000 ||
    now - Date.parse(snapshot.exportedAt) > 30 * 24 * 60 * 60_000 ||
    !Array.isArray(snapshot.cacheRows) ||
    snapshot.cacheRows.length > 100 ||
    !Array.isArray(snapshot.playerSnapshots) ||
    snapshot.playerSnapshots.length !== 1
  )
    throw new Error('Seed envelope is incompatible or outside the allowed age/size limits.')

  const seen = new Set()
  const validatedRows = snapshot.cacheRows.map((row) => {
    const validated = validateCacheRow(row, now)
    if (seen.has(row.cacheKey)) throw new Error('Seed contains duplicate cache keys.')
    seen.add(row.cacheKey)
    return { row, expired: validated.expired }
  })

  const players = snapshot.playerSnapshots[0]
  if (
    !isRecord(players) ||
    players.seasonEndYear !== 2027 ||
    !timestamp(players.fetchedAt) ||
    now - Date.parse(players.fetchedAt) > 30 * 24 * 60 * 60_000 ||
    Date.parse(players.fetchedAt) > now + 5 * 60_000 ||
    !isStoredPlayers(players.payload, players.seasonEndYear) ||
    Buffer.byteLength(JSON.stringify(players.payload), 'utf8') > 1_900_000
  )
    throw new Error('Player snapshot failed freshness, size, or schema validation.')

  const activeRows = validatedRows.filter(({ expired }) => !expired).map(({ row }) => row)
  return {
    cacheRows: activeRows,
    playerSnapshots: [players],
    expiredCacheRows: validatedRows.length - activeRows.length,
  }
}

export async function uploadSeed(
  snapshot,
  { accountId, databaseId, token, fetcher = fetch, now = Date.now() },
) {
  if (
    !/^[a-f0-9]{32}$/i.test(accountId ?? '') ||
    !/^[a-f0-9-]{36}$/i.test(databaseId ?? '') ||
    !token
  )
    throw new Error('Remote D1 target or credential is missing/invalid.')

  // Complete validation and freshness filtering before the first network write.
  const validated = validateSeedSnapshot(snapshot, now)
  const queries = validated.cacheRows.map((row) => ({
    sql: `INSERT INTO nba_cache (cache_key, capability, provider, record_json, expires_at_ms, stale_until_ms, updated_at_ms)
      VALUES (?, ?, 'bbs', ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET capability=excluded.capability, provider=excluded.provider,
        record_json=excluded.record_json, expires_at_ms=excluded.expires_at_ms,
        stale_until_ms=excluded.stale_until_ms, updated_at_ms=excluded.updated_at_ms
      WHERE excluded.provider=nba_cache.provider AND excluded.capability=nba_cache.capability
        AND excluded.updated_at_ms > nba_cache.updated_at_ms`,
    params: [
      row.cacheKey,
      row.capability,
      row.recordJson,
      String(row.expiresAtMs),
      String(row.staleUntilMs),
      String(row.updatedAtMs),
    ],
  }))
  for (const row of validated.playerSnapshots) {
    queries.push({
      sql: `INSERT INTO nba_player_snapshot (season_end_year, fetched_at, payload) VALUES (?, ?, ?)
        ON CONFLICT(season_end_year) DO UPDATE SET fetched_at=excluded.fetched_at, payload=excluded.payload
        WHERE excluded.fetched_at > nba_player_snapshot.fetched_at`,
      params: [String(row.seasonEndYear), row.fetchedAt, JSON.stringify(row.payload)],
    })
  }

  const url = `${apiBase}/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`
  let writesCompleted = 0
  for (const query of queries) {
    let response
    try {
      response = await fetcher(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(query),
      })
    } catch {
      throw new Error(`Remote D1 seed stopped safely after ${writesCompleted} writes.`)
    }
    const result = await response.json().catch(() => null)
    if (
      !response.ok ||
      result?.success !== true ||
      !Array.isArray(result.result) ||
      result.result.some((entry) => entry?.success !== true)
    )
      throw new Error(
        `Remote D1 seed stopped safely after ${writesCompleted} writes (HTTP ${response.status}).`,
      )
    writesCompleted += 1
  }
  return {
    importedCacheRows: validated.cacheRows.length,
    importedPlayerSnapshots: validated.playerSnapshots.length,
    expiredCacheRows: validated.expiredCacheRows,
    writesCompleted,
  }
}

async function exportSnapshot() {
  const dbPath = resolve(requiredOption('--db'))
  const outPath = resolve(requiredOption('--out'))
  const now = Date.now()
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const rows = db
      .prepare(
        `SELECT cache_key, capability, record_json, expires_at_ms, stale_until_ms, updated_at_ms
         FROM nba_cache
         WHERE provider = 'bbs'
         ORDER BY capability, cache_key`,
      )
      .all()
      .map((row) => ({
        cacheKey: row.cache_key,
        capability: row.capability,
        recordJson: row.record_json,
        expiresAtMs: row.expires_at_ms,
        staleUntilMs: row.stale_until_ms,
        updatedAtMs: row.updated_at_ms,
      }))
    const players = db
      .prepare(
        'SELECT season_end_year, fetched_at, payload FROM nba_player_snapshot ORDER BY season_end_year',
      )
      .all()
      .map((row) => {
        let payload
        try {
          payload = JSON.parse(row.payload)
        } catch {
          throw new Error('Player snapshot JSON is malformed.')
        }
        return { seasonEndYear: row.season_end_year, fetchedAt: row.fetched_at, payload }
      })

    const snapshot = {
      formatVersion: 2,
      exportedAt: new Date(now).toISOString(),
      source: 'local-d1-bbs-normalized-cache',
      cacheRows: rows,
      playerSnapshots: players,
    }
    validateSeedSnapshot(snapshot, now)
    await mkdir(dirname(outPath), { recursive: true, mode: 0o700 })
    await jsonFile(outPath, snapshot)
    await chmod(outPath, 0o600)
    const expiredCount = rows.filter((row) => row.staleUntilMs < now).length
    console.log(
      `Exported ${rows.length - expiredCount} usable BBS cache rows, skipped ${expiredCount} expired rows, and included ${players.length} validated player snapshots.`,
    )
  } finally {
    db.close()
  }
}

async function cli() {
  if (mode === 'upload') {
    if (!options.includes('--access-verified'))
      throw new Error('Refusing remote import until Worker Access is enabled and verified.')
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID
    let token = process.env.CLOUDFLARE_API_TOKEN
    if (!token) {
      const xdg = process.env.XDG_CONFIG_HOME
      const tokenPath = xdg
        ? join(xdg, '.wrangler', 'config', 'default.toml')
        : join(homedir(), 'Library', 'Preferences', '.wrangler', 'config', 'default.toml')
      const config = await readFile(tokenPath, 'utf8').catch(() => '')
      token = /^oauth_token\s*=\s*"([^"]+)"\s*$/m.exec(config)?.[1]
    }
    if (!token)
      throw new Error('Set CLOUDFLARE_API_TOKEN or authenticate Wrangler with `wrangler login`.')
    const snapshot = safeJson(
      await readFile(resolve(requiredOption('--file')), 'utf8'),
      10_000_000,
      'Seed file',
    )
    const result = await uploadSeed(snapshot, { accountId, databaseId, token })
    console.log(
      `Seed complete: ${result.importedCacheRows} current BBS cache rows, ${result.expiredCacheRows} expired rows skipped, ${result.importedPlayerSnapshots} player snapshots.`,
    )
  } else if (mode === 'export') await exportSnapshot()
  else
    throw new Error(
      'Usage: node --experimental-strip-types scripts/pro169-cloudflare-seed.mjs export --db <local.sqlite> --out <private-file> | upload --file <private-file> --access-verified',
    )
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Cloudflare seed failed safely.')
    process.exitCode = 1
  })
}
