import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const baseUrl = 'https://api.bigballsdata.com'
const season = 2026
const expectedTeams = 30
const reserve = 25
const minimumDelayMs = 700
const conservativeDelayMs = 6_100
const maxRequests = expectedTeams + 3
const execute = process.argv.includes('--execute')
const unexpectedArguments = process.argv.slice(2).filter((value) => value !== '--execute')

if (unexpectedArguments.length) {
  console.error('Usage: node scripts/bbs-team-season-audit.mjs [--execute]')
  process.exit(2)
}

function readLocalKey() {
  if (process.env.BBS_API_KEY) return process.env.BBS_API_KEY
  try {
    const line = readFileSync('.dev.vars', 'utf8')
      .split(/\r?\n/)
      .find((value) => /^\s*BBS_API_KEY\s*=/.test(value))
    if (!line) return null
    const value = line.slice(line.indexOf('=') + 1).trim()
    return value.replace(/^(['"])(.*)\1$/, '$2') || null
  } catch {
    return null
  }
}

function rowsFrom(value, keys = []) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  for (const key of keys) if (Array.isArray(value[key])) return value[key]
  return []
}

function dataFrom(payload) {
  return payload && typeof payload === 'object' ? (payload.data ?? payload) : null
}

function text(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function standingRows(payload) {
  const data = dataFrom(payload)
  const groups = rowsFrom(data, ['standings'])
  if (groups.length) return groups.flatMap((group) => rowsFrom(group, ['rows', 'standings']))
  return rowsFrom(data, ['rows', 'standings'])
}

function teamIdentity(row) {
  const nested = row?.team && typeof row.team === 'object' ? row.team : {}
  return {
    ids: [row?.team_id, row?.team_uuid, row?.id, nested.id, nested.team_id]
      .map(text)
      .filter(Boolean),
    abbreviation: text(row?.abbreviation ?? row?.abbr ?? nested.abbreviation ?? nested.abbr),
    name: text(row?.team_name ?? row?.name ?? nested.name ?? nested.display_name),
  }
}

function directoryIdentity(row) {
  return {
    ids: [row?.id, row?.team_id, row?.team_uuid].map(text).filter(Boolean),
    uuid: text(row?.id ?? row?.team_uuid ?? row?.uuid),
    abbreviation: text(row?.abbreviation ?? row?.abbr ?? row?.short_name),
    name: text(row?.display_name ?? row?.team_name ?? row?.name),
  }
}

function summarize(data) {
  const root = data && typeof data === 'object' ? data : {}
  const record = (value) => value && typeof value === 'object' && !Array.isArray(value)
  const recordLine = record(root.record) ? root.record : {}
  const stats = record(root.season_stats)
    ? root.season_stats
    : record(root.stats)
      ? root.stats
      : record(root.team_stats)
        ? root.team_stats
        : {}
  const standings = record(root.standings) ? root.standings : {}
  const splits = record(root.home_away_splits) ? root.home_away_splits : {}
  const home = record(splits.home) ? splits.home : {}
  const away = record(splits.away) ? splits.away : {}
  const playerRows = rowsFrom(root.top_players, ['players', 'rows'])
  const recent = rowsFrom(root.last_10, ['games', 'rows'])
  const lastTenIds = recent.map((row) => text(row?.match_id ?? row?.id)).filter(Boolean)
  const safeValues = (value) =>
    Object.fromEntries(
      Object.entries(value).filter(
        ([, item]) => item === null || ['string', 'number', 'boolean'].includes(typeof item),
      ),
    )
  return {
    season: root.season ?? null,
    teamAbbreviation: root.team_meta?.abbreviation ?? root.team_meta?.abbr ?? null,
    topLevelFields: Object.keys(root),
    nestedFields: Object.fromEntries(
      Object.entries(root)
        .filter(([, value]) => record(value))
        .map(([key, value]) => [key, Object.keys(value)]),
    ),
    recordType:
      root.record === null ? 'null' : Array.isArray(root.record) ? 'array' : typeof root.record,
    recordValues: safeValues(recordLine),
    standingsValues: safeValues(standings),
    seasonStatsValues: safeValues(stats),
    homeSplitValues: safeValues(home),
    awaySplitValues: safeValues(away),
    conference: root.conference ?? root.team_meta?.conference ?? standings.conference ?? null,
    division: standings.division ?? root.division ?? null,
    streak: standings.streak ?? null,
    lastTenCount: recent.length,
    lastTenWins: recent.filter((row) => row?.result === 'W').length,
    lastTenLosses: recent.filter((row) => row?.result === 'L').length,
    lastTenUniqueIds: new Set(lastTenIds).size,
    basicStatsFields: Object.keys(stats),
    recentGamesCount: recent.length,
    topPlayersCount: playerRows.length,
    topPlayersFields: Object.keys(playerRows[0] ?? {}),
    advancedStatFields: Object.keys(stats).filter((field) =>
      /^(?:pace|per|pie|bpm|vorp|ws(?:_per_48|48)?|ortg|drtg|off(?:ensive)?_rating|def(?:ensive)?_rating|net_rating|poss(?:essions)?|true_shooting_pct|ts_pct|effective_fg_pct|efg_pct|usage_rate|usage_pct|usg_pct|orb_pct|drb_pct|trb_pct|ast_pct|stl_pct|blk_pct|tov_pct|turnover_rate|assist_rate|block_rate|steal_rate|four_factors|advanced_[a-z0-9_]+)$/i.test(
        field,
      ),
    ),
  }
}

if (!execute) {
  console.log('Dry run only; no BBS requests made.')
  console.log(
    `Plan: standings + team directory + ${expectedTeams} team-season GETs for season=${season}.`,
  )
  console.log(`Maximum ${maxRequests} requests; at least ${reserve} daily requests stay unused.`)
  console.log(
    `Sequential requests are paced to the reported minute limit (minimum ${minimumDelayMs}ms). No retries or DunkAPI calls.`,
  )
  process.exit(0)
}

const apiKey = readLocalKey()
if (!apiKey) {
  console.error('BBS_API_KEY is missing. No BBS request was sent.')
  process.exit(1)
}

let sent = 0
let previousAt = 0
let remaining = null
let requestDelayMs = conservativeDelayMs
const records = []
const outputDirectory = join('artifacts', 'pro-189', 'real')
mkdirSync(outputDirectory, { recursive: true })
const outputPath = join(
  outputDirectory,
  `bbs-team-season-${new Date().toISOString().replaceAll(':', '-')}.json`,
)

function persistPartial(audit) {
  writeFileSync(outputPath, JSON.stringify(audit, null, 2), { mode: 0o600 })
}

function displayPath(path) {
  return path.replace(/^\/v1\/teams\/[^/]+\/season(?=\?)/, '/v1/teams/:teamId/season')
}

async function get(path) {
  const safePath = displayPath(path)
  if (sent >= maxRequests) throw new Error(`Safety ceiling reached before ${safePath}.`)
  if (remaining !== null && remaining <= reserve) {
    throw new Error(
      `Only ${remaining} request(s) remain in the limiting quota window; preserving ${reserve} and stopping before ${safePath}.`,
    )
  }
  const delay = requestDelayMs - (Date.now() - previousAt)
  if (previousAt && delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  let response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new Error(`Network failure for ${safePath}; stopped without retry.`)
  }
  previousAt = Date.now()
  sent += 1
  const quota = {
    remaining: response.headers.get('x-ratelimit-remaining'),
    dayLimit: response.headers.get('x-ratelimit-limit-day'),
    minuteLimit: response.headers.get('x-ratelimit-limit-minute'),
    reset: response.headers.get('x-ratelimit-reset'),
    retryAfter: response.headers.get('retry-after'),
  }
  remaining = quota.remaining === null ? null : Number(quota.remaining)
  const minuteLimit = Number(quota.minuteLimit)
  if (Number.isFinite(minuteLimit) && minuteLimit > 0) {
    requestDelayMs = Math.max(minimumDelayMs, Math.ceil(60_000 / minuteLimit) + 100)
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error(`${safePath} returned non-JSON HTTP ${response.status}; stopped without retry.`)
  }
  const failed = !response.ok || (payload && typeof payload === 'object' && payload.error)
  records.push({ path, status: response.status, quota, payload })
  console.log(
    `${String(sent).padStart(2, '0')} GET ${safePath} HTTP ${response.status}` +
      `${quota.remaining === null ? '' : ` · remaining ${quota.remaining}/${quota.dayLimit ?? '?'}`}`,
  )
  if (failed) {
    const terminal =
      [401, 403, 429].includes(response.status) ||
      /quota|rate|auth/i.test(text(payload?.error?.code))
    if (terminal)
      throw new Error(`${safePath} returned HTTP ${response.status}; stopped without retry.`)
  }
  persistPartial({
    capturedAt: new Date().toISOString(),
    seasonStartYear: season,
    domainSeasonEndYear: season + 1,
    requestCount: sent,
    quota,
    records,
  })
  return { payload, status: response.status }
}

try {
  const me = await get('/v1/user/me')
  const user = dataFrom(me.payload) ?? {}
  const limits = user.limits ?? {}
  console.log(
    `Plan: ${user.plan ?? 'unknown'}; reported daily limit: ${limits.day ?? limits.daily ?? user.daily_limit ?? 'response headers'}.`,
  )

  const standingsResult = await get('/v1/standings?league=nba&season=2026')
  const directoryResult = await get('/v1/teams?sport=basketball&league=nba&limit=100')
  const standings = standingRows(standingsResult.payload)
  const directory = rowsFrom(dataFrom(directoryResult.payload), ['teams'])
  const directoryById = new Map()
  for (const row of directory) {
    const identity = directoryIdentity(row)
    for (const id of identity.ids) directoryById.set(id, row)
  }

  const teams = standings.map((standing) => {
    const identity = teamIdentity(standing)
    const match = identity.ids.map((id) => directoryById.get(id)).find(Boolean)
    const team = match ? directoryIdentity(match) : null
    const uuid =
      team?.uuid || identity.ids.find((id) => /^[\da-f]{8}-[\da-f-]{27}$/i.test(id)) || ''
    return {
      uuid,
      standingId: identity.ids[0] ?? '',
      abbreviation: identity.abbreviation || team?.abbreviation || '',
      name: identity.name || team?.name || '',
      standing,
      directory: match ?? null,
    }
  })
  const uniqueUuids = new Set(teams.map(({ uuid }) => uuid).filter(Boolean))
  const uniqueStandingsIds = new Set(teams.map(({ standingId }) => standingId).filter(Boolean))
  console.log(
    `Standings: ${standings.length} rows · ${uniqueStandingsIds.size} unique IDs; team directory: ${directory.length} rows.`,
  )
  if (
    standings.length !== expectedTeams ||
    uniqueStandingsIds.size !== expectedTeams ||
    uniqueUuids.size !== expectedTeams
  ) {
    throw new Error(
      `Expected ${expectedTeams} unique standings rows with UUID crosswalks; found ${standings.length}/${uniqueStandingsIds.size}/${uniqueUuids.size}.`,
    )
  }

  const seasonResults = []
  for (let index = 0; index < teams.length; index += 1) {
    const team = teams[index]
    const result = await get(`/v1/teams/${encodeURIComponent(team.uuid)}/season?season=${season}`)
    const payloadData = dataFrom(result.payload)
    seasonResults.push({
      ...team,
      status: result.status,
      teamSeason: payloadData,
      summary: summarize(payloadData),
    })
    const summary = seasonResults.at(-1).summary
    console.log(
      `Team season ${String(index + 1).padStart(2, '0')}/30 ${summary.teamAbbreviation ?? team.abbreviation ?? 'unknown'}: HTTP ${result.status} · season=${summary.season ?? 'missing'} · fields=${summary.topLevelFields.length} · record=${summary.recordType} · splits=${Object.keys(summary.homeSplitValues).length}/${Object.keys(summary.awaySplitValues).length} · last10=${summary.lastTenCount} (${summary.lastTenWins}-${summary.lastTenLosses}, ${summary.lastTenUniqueIds} unique IDs) · top players=${summary.topPlayersCount} · stats=${summary.basicStatsFields.join(',')}`,
    )
  }

  const audit = {
    capturedAt: new Date().toISOString(),
    seasonStartYear: season,
    domainSeasonEndYear: season + 1,
    requestCount: sent,
    quota: records.at(-1)?.quota ?? null,
    standings: standingsResult.payload,
    directory: directoryResult.payload,
    teams: seasonResults,
  }
  persistPartial(audit)
  const successful = seasonResults.filter(({ status }) => status === 200).length
  const errors = seasonResults.filter(({ status }) => status !== 200)
  console.log(
    `\nAudit complete: ${successful}/30 team-season HTTP 200; requests=${sent}; output=${outputPath} (ignored local file).`,
  )
  if (errors.length)
    console.log(
      `Non-200 teams: ${errors.map(({ abbreviation, status }) => `${abbreviation || 'unknown'}:${status}`).join(', ')}.`,
    )
} catch (error) {
  console.error(`Stopped after ${sent} BBS GET(s): ${error.message}`)
  process.exitCode = 1
}
