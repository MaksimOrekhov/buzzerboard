import { mkdir, readFile, writeFile, rename, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { parseEnv } from 'node:util'

const [seasonArg, directory, profileFlag, profileId] = process.argv.slice(2)
const season = Number(seasonArg)
if (!/^20\d{2}$/.test(seasonArg ?? '') || !directory)
  throw new Error('Usage: node scripts/bbs-players-collect.mjs 2026 /private/tmp/bbs-players-2026')
const { BBS_API_KEY: key } = parseEnv(await readFile('.dev.vars', 'utf8'))
if (!key) throw new Error('Missing local BBS_API_KEY')
await mkdir(directory, { recursive: true, mode: 0o700 })
const lock = join(directory, '.collect-lock')
await mkdir(lock)
let requests = 0
let lastRequest = 0
async function request(path) {
  if (++requests > 850) throw new Error('Local run budget reached; resume later')
  await setTimeout(Math.max(0, 1050 - (Date.now() - lastRequest)))
  lastRequest = Date.now()
  const response = await fetch('https://api.bigballsdata.com' + path, {
    headers: { Authorization: 'Bearer ' + key },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok)
    throw new Error(
      `BBS HTTP ${response.status}; Retry-After: ${response.headers.get('retry-after') ?? 'see provider reset'}`,
    )
  const remaining = Number(response.headers.get('x-ratelimit-remaining') ?? 0)
  if (!Number.isFinite(remaining) || remaining < 25)
    throw new Error('Provider quota headroom reached; resume after reset')
  const json = await response.json()
  if (json.error) throw new Error('BBS reported an error')
  return json
}
async function cached(file, path) {
  const dest = join(directory, file + '.json')
  try {
    return JSON.parse(await readFile(dest, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const json = await request(path)
  await writeFile(dest + '.partial', JSON.stringify(json), { mode: 0o600 })
  await rename(dest + '.partial', dest)
  return json
}
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
try {
  const me = await request('/v1/user/me')
  if (
    me.data?.plan !== 'free' ||
    me.data?.limits?.per_minute < 100 ||
    me.data?.limits?.per_day < 1000
  )
    throw new Error('Unexpected quota; review limits before collecting')
  const unique = new Map()
  let total
  for (let offset = 0; offset < (total ?? 1); offset += 200) {
    const page = await cached(
      `directory-${season}-${offset}`,
      `/v1/stored/players?league=nba&season=${season}&limit=200&offset=${offset}`,
    )
    total ??= page.pagination?.total
    if (
      !Number.isInteger(total) ||
      total < 1 ||
      total > 1500 ||
      total !== page.pagination?.total ||
      page.data?.length !== Math.min(200, total - offset) ||
      page.meta?.filters_applied?.league_scope?.mode !== 'requested_season'
    )
      throw new Error(
        'Directory pagination or season changed; restart with a new snapshot directory',
      )
    for (const row of page.data) {
      if (uuid.test(row.id) && row.team?.league?.toUpperCase() === 'NBA') unique.set(row.id, row)
    }
  }
  console.log(`Directory: ${unique.size} unique NBA UUIDs / ${total} provider rows`)
  if (profileFlag !== undefined) {
    if (profileFlag !== '--profile' || !unique.has(profileId))
      throw new Error('Expected --profile and an exact BBS UUID from the season directory')
    await cached(`profile-${season}-${profileId}`, `/v1/players/${profileId}/profile`)
    await cached(
      `log-${season}-${profileId}`,
      `/v1/players/${profileId}/gamelog?season=${season}&limit=15`,
    )
    console.log(`Profile and log saved; ${requests} GETs this run`)
    process.exitCode = 0
  } else {
    const leaders = await cached(
      `leaders-${season}`,
      `/v1/nba/leaders?period=season&season=${season}&limit=50&min_games=1`,
    )
    const stars = (leaders.data?.leaders ?? [])
      .map((row) => row.player?.id)
      .filter((id) => unique.has(id))
    const queue = [...new Set([...stars, ...unique.keys()])]
    const enriched = new Set()
    let done = 0
    for (const id of queue) {
      const average = await cached(
        `average-${season}-${id}`,
        `/v1/nba/players/${id}/season-averages?season=${season}`,
      )
      if (enriched.size < 8 && average.data?.some((row) => row.games_played > 0)) {
        const team = unique.get(id)?.team?.id
        if (![...enriched].some((member) => unique.get(member)?.team?.id === team) || done < 3) {
          await cached(`profile-${season}-${id}`, `/v1/players/${id}/profile`)
          await cached(`log-${season}-${id}`, `/v1/players/${id}/gamelog?season=${season}&limit=15`)
          enriched.add(id)
        }
      }
      if (++done % 40 === 0 || done === queue.length)
        console.log(
          `Checked ${done}/${queue.length}; ${requests} GETs this run; ${enriched.size} enriched`,
        )
    }
  }
} finally {
  await rmdir(lock)
}
