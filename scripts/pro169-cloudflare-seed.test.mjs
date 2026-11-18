import assert from 'node:assert/strict'
import { test } from 'node:test'
import { uploadSeed, validateSeedSnapshot } from './pro169-cloudflare-seed.mjs'

const now = Date.parse('2026-11-18T09:00:00.000Z')
const accountId = 'a'.repeat(32)
const databaseId = '12345678-1234-4234-8234-123456789abc'
const token = 'synthetic-token'

function playerSnapshot() {
  const fetchedAt = new Date(now - 60_000).toISOString()
  return {
    seasonEndYear: 2027,
    fetchedAt,
    payload: {
      version: 2,
      players: [
        {
          id: 'bbs:player:00000000-0000-4000-8000-000000000001',
          name: 'Synthetic Player',
          team: null,
          position: null,
          number: null,
          height: null,
          weight: null,
          stats: null,
        },
      ],
      details: {},
      gameRefs: {},
      directoryAt: fetchedAt,
      averageAt: {},
      coverage: {
        providerRows: 1,
        total: 1,
        checked: 0,
        averages: 0,
        enriched: 0,
        boxLinks: 0,
      },
    },
  }
}

function gamesRow({ fetchedAtMs = now - 60_000, expired = false } = {}) {
  const expiresAtMs = expired ? now - 30_000 : now + 60_000
  const staleUntilMs = expired ? now - 1 : now + 24 * 60 * 60_000
  const cacheKey = 'bbs:nba:games:date=2026-11-18'
  const record = {
    cacheKey,
    capability: 'games',
    provider: 'bbs',
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    providerUpdatedAt: null,
    rejectedRecords: 0,
    expiresAt: expiresAtMs,
    staleUntil: staleUntilMs,
    retryAt: null,
    refreshError: null,
    data: [],
  }
  return {
    cacheKey,
    capability: 'games',
    recordJson: JSON.stringify(record),
    expiresAtMs,
    staleUntilMs,
    updatedAtMs: fetchedAtMs,
  }
}

function snapshot(cacheRows = [gamesRow()]) {
  return {
    formatVersion: 2,
    exportedAt: new Date(now).toISOString(),
    source: 'local-d1-bbs-normalized-cache',
    cacheRows,
    playerSnapshots: [playerSnapshot()],
  }
}

function successResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, result: [{ success: true }] }),
  }
}

test('validates a seed before any remote writes and uses monotonic provider-safe upserts', async () => {
  const calls = []
  const result = await uploadSeed(snapshot(), {
    accountId,
    databaseId,
    token,
    now,
    fetcher: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) })
      return successResponse()
    },
  })

  assert.equal(result.importedCacheRows, 1)
  assert.equal(result.importedPlayerSnapshots, 1)
  assert.equal(calls.length, 2)
  assert.ok(
    calls.every(({ url }) => url.startsWith('https://api.cloudflare.com/client/v4/accounts/')),
  )
  assert.match(calls[0].body.sql, /excluded\.provider=nba_cache\.provider/)
  assert.match(calls[0].body.sql, /excluded\.updated_at_ms > nba_cache\.updated_at_ms/)
  assert.match(calls[1].body.sql, /excluded\.fetched_at > nba_player_snapshot\.fetched_at/)
})

test('rejects malformed, cross-provider and duplicate cache rows before any remote writes', async () => {
  for (const mutate of [
    (row) => ({
      ...row,
      recordJson: row.recordJson.replace('"provider":"bbs"', '"provider":"dunkapi"'),
    }),
    (row) => ({ ...row, updatedAtMs: row.updatedAtMs - 1 }),
  ]) {
    const calls = []
    await assert.rejects(
      uploadSeed(snapshot([mutate(gamesRow())]), {
        accountId,
        databaseId,
        token,
        now,
        fetcher: async () => calls.push('unexpected write'),
      }),
    )
    assert.deepEqual(calls, [])
  }

  const duplicate = gamesRow()
  await assert.rejects(
    uploadSeed(snapshot([duplicate, duplicate]), {
      accountId,
      databaseId,
      token,
      now,
      fetcher: async () => assert.fail('Invalid seed must not write remotely'),
    }),
    /duplicate cache keys/,
  )
})

test('rejects an invalid player snapshot before writes', async () => {
  const value = snapshot()
  value.playerSnapshots[0].payload.players[0].id =
    'dunkapi:player:00000000-0000-4000-8000-000000000001'
  let calls = 0
  await assert.rejects(
    uploadSeed(value, {
      accountId,
      databaseId,
      token,
      now,
      fetcher: async () => calls++,
    }),
  )
  assert.equal(calls, 0)
})

test('skips expired rows and reports them without changing remote cache', async () => {
  const value = snapshot([gamesRow({ expired: true })])
  const checked = validateSeedSnapshot(value, now)
  assert.equal(checked.cacheRows.length, 0)
  assert.equal(checked.expiredCacheRows, 1)

  const calls = []
  const result = await uploadSeed(value, {
    accountId,
    databaseId,
    token,
    now,
    fetcher: async (_url, init) => {
      calls.push(JSON.parse(init.body))
      return successResponse()
    },
  })
  assert.equal(result.expiredCacheRows, 1)
  assert.equal(calls.length, 1)
  assert.match(calls[0].sql, /nba_player_snapshot/)
})

test('stops on remote failure without logging credentials or payloads', async () => {
  let calls = 0
  await assert.rejects(
    uploadSeed(snapshot(), {
      accountId,
      databaseId,
      token,
      now,
      fetcher: async () => {
        calls += 1
        return { ok: false, status: 403, json: async () => ({ success: false }) }
      },
    }),
    /stopped safely after 0 writes \(HTTP 403\)/,
  )
  assert.equal(calls, 1)
})
