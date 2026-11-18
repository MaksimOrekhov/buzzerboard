import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createServer } from 'vite'

const dbPath = process.argv[2]
if (!dbPath) {
  throw new Error(
    'Usage: node --experimental-strip-types scripts/pro198-player-profile.mjs <local-d1.sqlite>',
  )
}

const localDb = new DatabaseSync(dbPath, { readOnly: true })
const row = localDb
  .prepare('SELECT fetched_at, payload FROM nba_player_snapshot WHERE season_end_year = ?')
  .get(2027)
localDb.close()
assert.ok(row?.payload, 'local D1 does not contain the 2027 player snapshot')
const snapshot = JSON.parse(row.payload)
assert.ok(snapshot.players.length > 0, 'player snapshot is empty')
const playerId =
  Object.keys(snapshot.gameRefs).find(
    (id) => snapshot.gameRefs[id].length > 0 && (snapshot.details[id]?.games?.length ?? 0) > 0,
  ) ??
  Object.keys(snapshot.gameRefs).find((id) => snapshot.gameRefs[id].length > 0) ??
  snapshot.players[0].id
const db = {
  prepare: () => ({
    bind: () => ({ first: async () => row }),
  }),
}
const repository = { getCache: async () => null }
const server = await createServer({
  configFile: './vite.config.ts',
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false },
})

try {
  const { createNbaWorker } = await server.ssrLoadModule('/src/server/worker.ts')
  const worker = createNbaWorker({
    now: () => Date.parse('2026-11-18T12:00:00Z'),
    repository,
  })
  const env = { NBA_DB: db, BBS_PLAYERS_ENABLED: 'true' }
  const routes = {
    catalog: 'https://local.invalid/api/players',
    profile: `https://local.invalid/api/players/${encodeURIComponent(playerId)}`,
  }

  for (const [name, url] of Object.entries(routes)) {
    const request = () => worker.fetch(new Request(url), env)
    for (let i = 0; i < 12; i++) assert.equal((await request()).status, 200)

    const runs = []
    for (let run = 0; run < 5; run++) {
      const cpuStart = process.cpuUsage()
      const wallStart = performance.now()
      for (let i = 0; i < 100; i++) assert.equal((await request()).status, 200)
      const wallMs = performance.now() - wallStart
      const cpu = process.cpuUsage(cpuStart)
      runs.push({
        cpuMsPerRequest: (cpu.user + cpu.system) / 100_000,
        wallMsPerRequest: wallMs / 100,
      })
    }
    runs.sort((a, b) => a.cpuMsPerRequest - b.cpuMsPerRequest)
    console.log(JSON.stringify({ route: name, requests: 500, medianRun: runs[2] }))
  }
  console.log(
    JSON.stringify({
      players: snapshot.players.length,
      snapshotBytes: Buffer.byteLength(row.payload),
      profileSavedGameRefs: snapshot.gameRefs[playerId]?.length ?? 0,
      profileSavedLogs: snapshot.details[playerId]?.games?.length ?? 0,
    }),
  )
} finally {
  await server.close()
}
