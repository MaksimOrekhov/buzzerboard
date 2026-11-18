import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { dirname, resolve } from 'node:path'
import { isStoredPlayers, timestamp } from '../src/entities/nba/playerSnapshotGuards.ts'

const apiBase = 'https://api.cloudflare.com/client/v4'
const args = process.argv.slice(2)
const [mode, ...options] = args
const option = (name) => options[options.indexOf(name) + 1]

function requiredOption(name) {
  const value = option(name)
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function jsonFile(path, value) {
  return writeFile(path, `${JSON.stringify(value)}\n`, { mode: 0o600 })
}

function validateBbsCacheRow(row) {
  let record
  try {
    record = JSON.parse(row.record_json)
  } catch {
    throw new Error(`Invalid cached JSON for ${row.cache_key}`)
  }
  if (
    record.provider !== 'bbs' ||
    record.cacheKey !== row.cache_key ||
    record.capability !== row.capability ||
    !timestamp(record.fetchedAt) ||
    !Number.isSafeInteger(record.expiresAt) ||
    !Number.isSafeInteger(record.staleUntil) ||
    !record.data
  )
    throw new Error(`Cache identity or shape check failed for ${row.cache_key}`)
  return record
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
         WHERE provider = 'bbs' AND stale_until_ms >= ?
         ORDER BY capability, cache_key`,
      )
      .all(now)
      .map((row) => ({ ...row, record: validateBbsCacheRow(row) }))
    const player = db
      .prepare(
        'SELECT season_end_year, fetched_at, payload FROM nba_player_snapshot ORDER BY season_end_year',
      )
      .all()
      .map((row) => {
        let payload
        try {
          payload = JSON.parse(row.payload)
        } catch {
          throw new Error(`Invalid player snapshot JSON for season ${row.season_end_year}`)
        }
        if (
          row.season_end_year !== 2027 ||
          !timestamp(row.fetched_at) ||
          now - Date.parse(row.fetched_at) > 30 * 24 * 60 * 60_000 ||
          !isStoredPlayers(payload, row.season_end_year)
        )
          throw new Error(
            `Player snapshot is invalid or older than 30 days for season ${row.season_end_year}`,
          )
        return { seasonEndYear: row.season_end_year, fetchedAt: row.fetched_at, payload }
      })

    const snapshot = {
      formatVersion: 1,
      exportedAt: new Date(now).toISOString(),
      source: 'local-d1-bbs-normalized-cache',
      cacheRows: rows.map(
        ({ cache_key, capability, record_json, expires_at_ms, stale_until_ms, updated_at_ms }) => ({
          cacheKey: cache_key,
          capability,
          recordJson: record_json,
          expiresAtMs: expires_at_ms,
          staleUntilMs: stale_until_ms,
          updatedAtMs: updated_at_ms,
        }),
      ),
      playerSnapshots: player,
    }
    await mkdir(dirname(outPath), { recursive: true, mode: 0o700 })
    await jsonFile(outPath, snapshot)
    await chmod(outPath, 0o600)
    console.log(
      `Exported ${snapshot.cacheRows.length} current BBS cache rows and ${player.length} player snapshots; no non-BBS rows or provider ledger copied.`,
    )
  } finally {
    db.close()
  }
}

async function uploadSnapshot() {
  if (!options.includes('--access-verified'))
    throw new Error('Refusing remote import until Worker Access is enabled and verified.')
  const token = process.env.CLOUDFLARE_API_TOKEN
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID
  if (!token || !accountId || !databaseId)
    throw new Error(
      'Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_D1_DATABASE_ID.',
    )
  const snapshot = JSON.parse(await readFile(resolve(requiredOption('--file')), 'utf8'))
  if (
    snapshot.formatVersion !== 1 ||
    snapshot.source !== 'local-d1-bbs-normalized-cache' ||
    !Array.isArray(snapshot.cacheRows) ||
    !Array.isArray(snapshot.playerSnapshots)
  )
    throw new Error('Unsupported or unsafe seed file.')

  const queries = snapshot.cacheRows.map((row) => ({
    sql: `INSERT INTO nba_cache (cache_key, capability, provider, record_json, expires_at_ms, stale_until_ms, updated_at_ms)
      VALUES (?, ?, 'bbs', ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET capability=excluded.capability, provider=excluded.provider,
        record_json=excluded.record_json, expires_at_ms=excluded.expires_at_ms,
        stale_until_ms=excluded.stale_until_ms, updated_at_ms=excluded.updated_at_ms
      WHERE excluded.provider='bbs' AND excluded.updated_at_ms >= nba_cache.updated_at_ms`,
    params: [
      row.cacheKey,
      row.capability,
      row.recordJson,
      String(row.expiresAtMs),
      String(row.staleUntilMs),
      String(row.updatedAtMs),
    ],
  }))
  for (const row of snapshot.playerSnapshots) {
    if (
      row.seasonEndYear !== 2027 ||
      !timestamp(row.fetchedAt) ||
      !isStoredPlayers(row.payload, row.seasonEndYear)
    )
      throw new Error('Player snapshot failed identity or schema validation.')
    queries.push({
      sql: `INSERT INTO nba_player_snapshot (season_end_year, fetched_at, payload) VALUES (?, ?, ?)
        ON CONFLICT(season_end_year) DO UPDATE SET fetched_at=excluded.fetched_at, payload=excluded.payload
        WHERE excluded.fetched_at >= nba_player_snapshot.fetched_at`,
      params: [String(row.seasonEndYear), row.fetchedAt, JSON.stringify(row.payload)],
    })
  }

  const url = `${apiBase}/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`
  for (const query of queries) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(query),
    })
    const result = await response.json().catch(() => null)
    if (
      !response.ok ||
      result?.success !== true ||
      result?.result?.some((entry) => entry.success !== true)
    )
      throw new Error(
        `Remote D1 seed stopped safely (HTTP ${response.status}); no provider refresh was attempted.`,
      )
  }
  console.log(
    `Imported ${snapshot.cacheRows.length} BBS cache rows and ${snapshot.playerSnapshots.length} player snapshots.`,
  )
}

try {
  if (mode === 'export') await exportSnapshot()
  else if (mode === 'upload') await uploadSnapshot()
  else
    throw new Error(
      'Usage: node --experimental-strip-types scripts/pro169-cloudflare-seed.mjs export --db <local.sqlite> --out <private-file> | upload --file <private-file> --access-verified',
    )
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Cloudflare seed failed safely.')
  process.exitCode = 1
}
