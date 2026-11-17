import { readFileSync } from 'node:fs'

const baseUrl = 'https://api.bigballsdata.com'
const maxAllowedRequests = 60
const minimumDailyQuotaReserve = 25
const requestDelayMs = 700
const execute = process.argv.includes('--execute')
const maxArgument = process.argv.find((argument) => argument.startsWith('--max-requests='))
const requestCeiling = maxArgument ? Number(maxArgument.split('=')[1]) : 40
const unexpectedArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== '--execute' && argument !== maxArgument)

if (
  unexpectedArguments.length > 0 ||
  !Number.isInteger(requestCeiling) ||
  requestCeiling < 1 ||
  requestCeiling > maxAllowedRequests
) {
  console.error(
    `Usage: node scripts/bbs-smoke.mjs [--execute] [--max-requests=1..${maxAllowedRequests}]`,
  )
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

function dateRange(start, count) {
  const date = new Date(`${start}T12:00:00.000Z`)
  return Array.from({ length: count }, (_, index) => {
    const next = new Date(date)
    next.setUTCDate(date.getUTCDate() + index)
    return next.toISOString().slice(0, 10)
  })
}

const gameDays = ['2026-11-15', '2026-11-16', ...dateRange('2026-11-18', 7)]
const requestEstimate = 1 + gameDays.length + 1 + 1 + 3 + 6 + 3 + 9 + 2 + 2 + 1

if (!execute) {
  console.log('Dry run only; no network calls made.')
  console.log(`Planned ceiling: ${requestCeiling}; hard maximum: ${maxAllowedRequests}.`)
  console.log(`Estimated calls with all dynamic samples: ${requestEstimate}.`)
  console.log('Plan: key/plan status, NBA date lists, 7-day schedule, standings, teams/rosters,')
  console.log(
    '3 player lookups/logs/averages, PTS/REB/AST leaders, and 3 game detail/box/team-stat samples.',
  )
  console.log(
    'GET-only; stops at the first error; no retries and no response bodies are logged or saved.',
  )
  console.log('Network calls require --execute and an ignored .dev.vars BBS_API_KEY.')
  process.exit(0)
}

const apiKey = readLocalKey()
if (!apiKey) {
  console.error('BBS_API_KEY is missing. No API request was sent.')
  process.exit(1)
}

let sent = 0
let previousRequestAt = 0
let lastDailyRemaining = null
const results = []

async function get(path) {
  if (sent >= requestCeiling || sent >= maxAllowedRequests) {
    throw new Error(`Request ceiling reached before ${path}; stopped without sending it.`)
  }
  if (lastDailyRemaining !== null && lastDailyRemaining <= minimumDailyQuotaReserve) {
    throw new Error(
      `Only ${lastDailyRemaining} daily request(s) remain; preserving ${minimumDailyQuotaReserve} and stopping before ${path}.`,
    )
  }

  const waitFor = requestDelayMs - (Date.now() - previousRequestAt)
  if (previousRequestAt && waitFor > 0) await new Promise((resolve) => setTimeout(resolve, waitFor))

  const requestNumber = ++sent
  const startedAt = Date.now()
  let response

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    previousRequestAt = Date.now()
    throw new Error(`${path} network failure; stopped after ${sent} request(s), no retry.`)
  }

  previousRequestAt = Date.now()
  const durationMs = Date.now() - startedAt
  const quota = {
    remaining: response.headers.get('x-ratelimit-remaining'),
    dayLimit: response.headers.get('x-ratelimit-limit-day'),
    minuteLimit: response.headers.get('x-ratelimit-limit-minute'),
    retryAfter: response.headers.get('retry-after'),
  }
  lastDailyRemaining = quota.remaining === null ? null : Number(quota.remaining)

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error(`${path} returned non-JSON HTTP ${response.status}; stopped without retry.`)
  }

  if (!response.ok || (payload && typeof payload === 'object' && payload.error)) {
    const retry = quota.retryAfter ? ` Retry-After=${quota.retryAfter}s.` : ''
    results.push({ path, status: response.status, durationMs, quota })
    throw new Error(
      `${path} returned HTTP ${response.status}; response body suppressed.${retry} Stopped without retry.`,
    )
  }

  const result = { path, status: response.status, durationMs, quota, payload }
  results.push(result)
  console.log(
    `${String(requestNumber).padStart(2, '0')} GET ${path} ${response.status} ${durationMs}ms` +
      `${quota.remaining === null ? '' : ` quota=${quota.remaining}/${quota.dayLimit ?? '?'}/day`}`,
  )
  return result
}

function dataOf(result) {
  return result?.payload?.data ?? null
}

function recordArray(value, keys = []) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  for (const key of keys) {
    if (Array.isArray(value[key])) return value[key]
  }
  return []
}

function asText(value) {
  return typeof value === 'string' ? value : ''
}

function teamName(team) {
  return asText(team?.abbreviation ?? team?.abbr ?? team?.short_name ?? team?.name)
}

function scoreValue(match, side) {
  const direct = match?.[side]?.score
  const score = match?.score?.[side]
  const raw = direct ?? score
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw)
        ? Number(raw)
        : null
  return value !== null && Number.isFinite(value) ? value : null
}

function summarizeMatchDay(date, result) {
  const data = dataOf(result)
  const games = recordArray(data, ['matches', 'games'])
  const statusCounts = Object.fromEntries(
    Object.entries(Object.groupBy(games, (game) => game.status ?? 'unknown')).map(
      ([status, rows]) => [status, rows.length],
    ),
  )
  const scored = games.filter(
    (game) => scoreValue(game, 'home') !== null && scoreValue(game, 'away') !== null,
  )
  const periods = games.filter((game) => {
    const value = game.linescore ?? game.periods ?? game.period_scores
    return Array.isArray(value) || Boolean(value && typeof value === 'object')
  })
  const timestamps = games
    .map((game) => game.kickoff_utc ?? game.starts_at ?? game.start_time)
    .filter((value) => typeof value === 'string')

  return {
    date,
    count: games.length,
    statuses: statusCounts,
    completeScores: scored.length,
    periodLines: periods.length,
    uniqueIds: new Set(games.map((game) => game.id).filter(Boolean)).size,
    timestamps: timestamps.length,
    nbaDatesMatchET: games.every((game) => {
      const value = game.kickoff_utc ?? game.starts_at ?? game.start_time
      if (typeof value !== 'string' || !game.game_date) return true
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
          .formatToParts(new Date(value))
          .map(({ type, value }) => [type, value]),
      )
      return `${parts.year}-${parts.month}-${parts.day}` === game.game_date
    }),
    sampleGames: games.map((game) => ({
      id: game.id,
      archiveGameId: game.archive_game_id ?? null,
      date: game.game_date ?? game.date ?? date,
      status: game.status ?? 'unknown',
      home: teamName(game.home),
      away: teamName(game.away),
      homeScore: scoreValue(game, 'home'),
      awayScore: scoreValue(game, 'away'),
      kickoffUtc: game.kickoff_utc ?? game.starts_at ?? game.start_time ?? null,
      lineScorePeriods: Array.isArray(game.linescore)
        ? game.linescore.length
        : Array.isArray(game.linescore?.home)
          ? game.linescore.home.length
          : null,
    })),
    meta: data?.meta ?? result.payload?.meta ?? null,
    pagination: data?.pagination ?? result.payload?.pagination ?? null,
  }
}

function summarizeStandingRows(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) =>
      recordArray(entry, ['rows', 'standings']).length
        ? recordArray(entry, ['rows', 'standings'])
        : [entry],
    )
  }
  return recordArray(value, ['rows', 'standings'])
}

function summarizePlayerStats(rows) {
  const fields = {
    minutes: ['minutes', 'min_played', 'min'],
    secondsPlayed: ['seconds_played'],
    points: ['points', 'pts'],
    rebounds: ['rebounds', 'reb'],
    assists: ['assists', 'ast'],
    steals: ['steals', 'stl'],
    blocks: ['blocks', 'blk'],
    turnovers: ['turnovers', 'turnover', 'tov'],
    fouls: ['fouls', 'pf'],
    plusMinus: ['plus_minus'],
    fieldGoalsMade: ['field_goals_made', 'fgm'],
    fieldGoalsAttempted: ['field_goals_attempted', 'fga'],
    fieldGoalPct: ['field_goal_pct', 'fg_pct'],
    threePointersMade: ['three_pointers_made', 'fg3m'],
    threePointersAttempted: ['three_pointers_attempted', 'fg3a'],
    threePointPct: ['three_point_pct', 'fg3_pct'],
    freeThrowsMade: ['free_throws_made', 'ftm'],
    freeThrowsAttempted: ['free_throws_attempted', 'fta'],
    freeThrowPct: ['free_throw_pct', 'ft_pct'],
  }
  return Object.fromEntries(
    Object.entries(fields).map(([name, aliases]) => [
      name,
      rows.filter((row) =>
        aliases.some((field) => row?.[field] !== null && row?.[field] !== undefined),
      ).length,
    ]),
  )
}

async function main() {
  const userResult = await get('/v1/user/me')
  const user = dataOf(userResult) ?? {}
  const limits = user.limits ?? {}
  console.log(
    `Key plan: ${user.plan ?? 'unknown'}; sport selection: ${user.selected_sport ?? user.sport ?? user.active_sport ?? 'not disclosed'}; ` +
      `reported daily limit: ${limits.day ?? limits.daily ?? limits.requests_per_day ?? user.daily_limit ?? 'see response headers'}.`,
  )

  const byDate = new Map()
  for (const date of gameDays) {
    const path = `/v1/matches?league=nba&date=${date}&tz=America%2FNew_York&limit=100`
    const result = await get(path)
    byDate.set(date, { result, summary: summarizeMatchDay(date, result) })
  }

  const standingsResult = await get('/v1/standings?league=nba&season=2026')
  const standingGroups = recordArray(dataOf(standingsResult), ['standings'])
  const standings = summarizeStandingRows(dataOf(standingsResult))
  const conferenceCounts = Object.fromEntries(
    Object.entries(
      Object.groupBy(standings, (row) => row.conference ?? row.conference_name ?? 'unknown'),
    ).map(([conference, rows]) => [conference, rows.length]),
  )
  const standingFields = [
    'team_id',
    'team_name',
    'wins',
    'losses',
    'win_pct',
    'gb',
    'home',
    'away',
    'conference',
    'conference_rank',
    'streak',
    'rank',
    'points_for',
    'points_against',
  ]
  console.log(
    `Standings: groups=${standingGroups.length}; rows=${standings.length}; unique teams=${new Set(standings.map((row) => row.team_id ?? row.team?.id).filter(Boolean)).size}; ` +
      `conferences=${JSON.stringify(conferenceCounts)}; fields=${JSON.stringify(Object.fromEntries(standingFields.map((field) => [field, standings.filter((row) => row[field] !== undefined && row[field] !== null).length])))}.`,
  )

  const teamsResult = await get('/v1/teams?sport=basketball&league=nba&limit=100')
  const teams = recordArray(dataOf(teamsResult), ['teams'])
  const teamIds = teams.map((team) => team.id).filter(Boolean)
  console.log(
    `Teams: rows=${teams.length}; unique IDs=${new Set(teamIds).size}; logos=${teams.filter((team) => team.logo_url).length}; ` +
      `league labels=${new Set(teams.map((team) => team.league).filter(Boolean)).size}.`,
  )

  const playerNames = ['Nikola Jokic', 'Shai Gilgeous-Alexander', 'Jayson Tatum']
  const players = []
  for (const name of playerNames) {
    const result = await get(
      `/v1/players?sport=basketball&name=${encodeURIComponent(name)}&limit=10`,
    )
    const rows = recordArray(dataOf(result), ['players'])
    const exact = rows.find(
      (player) =>
        asText(player.full_name ?? player.display_name).toLowerCase() === name.toLowerCase(),
    )
    const selected = exact ?? rows[0]
    console.log(
      `Player lookup ${name}: rows=${rows.length}; selected=${selected?.display_name ?? selected?.full_name ?? selected?.name ?? 'none'}; ` +
        `team ID=${(selected?.current_team_id ?? selected?.team_id) ? 'present' : 'missing'}; pagination=${JSON.stringify(result.payload?.pagination ?? dataOf(result)?.pagination ?? null)}.`,
    )
    if (selected?.id) players.push({ requestedName: name, ...selected })
  }

  for (const player of players) {
    const averages = await get(
      `/v1/nba/players/${encodeURIComponent(player.id)}/season-averages?season=2026&limit=50`,
    )
    const averageRows = recordArray(dataOf(averages), ['averages', 'stats', 'rows'])
    console.log(
      `Season averages ${player.display_name ?? player.full_name ?? player.name}: rows=${averageRows.length}; seasons=${JSON.stringify([...new Set(averageRows.map((row) => row.season).filter(Boolean))])}; sampleFields=${JSON.stringify(Object.keys(averageRows[0] ?? {}))}.`,
    )

    const log = await get(
      `/v1/players/${encodeURIComponent(player.id)}/gamelog?season=2026&limit=10`,
    )
    const logRows = recordArray(dataOf(log), ['games', 'rows', 'gamelog'])
    console.log(
      `Game log ${player.display_name ?? player.full_name ?? player.name}: rows=${logRows.length}; stats=${JSON.stringify(summarizePlayerStats(logRows))}; dates=${JSON.stringify(logRows.slice(0, 3).map((row) => row.date ?? row.game_date))}.`,
    )
  }

  const leaders = {}
  for (const stat of ['pts', 'reb', 'ast']) {
    const result = await get(
      `/v1/nba/leaders?season=2026&stat=${stat}&period=season&season_type=regular&limit=10`,
    )
    leaders[stat] = recordArray(dataOf(result), ['leaders', 'rows'])
    console.log(
      `Leaders ${stat}: rows=${leaders[stat].length}; unique players=${new Set(leaders[stat].map((row) => row.player_id ?? row.player?.id ?? row.id).filter(Boolean)).size}; fields=${JSON.stringify(Object.keys(leaders[stat][0] ?? {}))}.`,
    )
  }

  const samplePool = [
    ...(byDate.get('2026-11-15')?.summary.sampleGames ?? []),
    ...(byDate.get('2026-11-16')?.summary.sampleGames ?? []),
  ].filter((game) => game.id && game.status !== 'scheduled')
  const selectedGames = []
  for (const preferredDate of ['2026-11-15', '2026-11-15', '2026-11-16']) {
    const next = samplePool.find(
      (game) => game.date === preferredDate && !selectedGames.some((item) => item.id === game.id),
    )
    if (next) selectedGames.push(next)
  }
  for (const game of samplePool) {
    if (selectedGames.length >= 3) break
    if (!selectedGames.some((item) => item.id === game.id)) selectedGames.push(game)
  }

  const sampledTeams = new Map()
  for (const game of selectedGames) {
    const [detail, box] = await Promise.all([
      get(`/v1/matches/${encodeURIComponent(game.id)}`),
      get(`/v1/nba/games/${encodeURIComponent(game.id)}/box`),
    ])
    const nbaGame = game.archiveGameId
      ? await get(`/v1/nba/games/${encodeURIComponent(game.archiveGameId)}`)
      : null
    const details = dataOf(detail)
    const boxData = dataOf(box) ?? {}
    const homeRows = recordArray(boxData, ['home'])
    const awayRows = recordArray(boxData, ['away'])
    const allRows = [...homeRows, ...awayRows]
    const boxPoints = (rows) =>
      rows.reduce((sum, row) => sum + (Number.isFinite(row.points) ? row.points : 0), 0)
    const nbaGameData = dataOf(nbaGame) ?? {}
    console.log(
      `Game ${game.date} ${game.away} @ ${game.home}: status=${details?.status ?? game.status}; ` +
        `score=${scoreValue(details, 'away') ?? game.awayScore}-${scoreValue(details, 'home') ?? game.homeScore}; ` +
        `lineScorePeriods=${Array.isArray(details?.linescore?.home) ? details.linescore.home.length : Array.isArray(details?.linescore) ? details.linescore.length : Array.isArray(nbaGameData?.linescore?.home) ? nbaGameData.linescore.home.length : (game.lineScorePeriods ?? 0)}; ` +
        `box=${homeRows.length}+${awayRows.length}; points=${boxPoints(awayRows)}-${boxPoints(homeRows)}; ` +
        `playersWithId=${allRows.filter((row) => row.player_id).length}; starters=${allRows.filter((row) => row.starter === true).length}; ` +
        `DNP/no-minutes=${allRows.filter((row) => row.minutes === null || row.minutes === undefined || row.minutes === '0').length}; ` +
        `statFields=${JSON.stringify(summarizePlayerStats(allRows))}; ` +
        `teamStatsKeys=${JSON.stringify(Object.keys(nbaGameData.home ?? {}))}; ` +
        `teamScoreMatches=${scoreValue(details, 'home') === null || nbaGameData.home?.pts === undefined ? 'unverified' : scoreValue(details, 'home') === nbaGameData.home.pts}; ` +
        `boxMeta=${JSON.stringify(box.payload?.meta ?? {})}.`,
    )

    for (const side of ['home', 'away']) {
      const teamId = details?.[side]?.id ?? details?.[`${side}_team`]?.id
      if (teamId && !sampledTeams.has(teamId))
        sampledTeams.set(teamId, details?.[side]?.name ?? teamName(details?.[side]))
    }
  }

  for (const [teamId, team] of [...sampledTeams.entries()].slice(0, 2)) {
    const roster = await get(
      `/v1/players?sport=basketball&teamId=${encodeURIComponent(teamId)}&limit=100`,
    )
    const rosterRows = recordArray(dataOf(roster), ['players'])
    console.log(
      `Roster ${team || teamId}: rows=${rosterRows.length}; unique IDs=${new Set(rosterRows.map((row) => row.id).filter(Boolean)).size}; ` +
        `team matches=${rosterRows.filter((row) => row.current_team_id === teamId || row.team_id === teamId).length}; pagination=${JSON.stringify(roster.payload?.pagination ?? dataOf(roster)?.pagination ?? null)}.`,
    )
  }

  for (const [teamId, team] of [...sampledTeams.entries()].slice(0, 2)) {
    if (!teamId) continue
    const result = await get(`/v1/teams/${encodeURIComponent(teamId)}/season?season=2026`)
    const data = dataOf(result) ?? {}
    console.log(
      `Team season ${team ?? teamId}: season=${data.season ?? 'null'}; ` +
        `fields=${JSON.stringify(Object.keys(data))}; ` +
        `standingsFields=${JSON.stringify(Object.keys(data.standings ?? {}))}; ` +
        `last10=${recordArray(data.last_10, ['games']).length}; topPlayers=${recordArray(data.top_players, ['players']).length}.`,
    )
  }

  const repeat = await get('/v1/matches?league=nba&date=2026-11-15&tz=America%2FNew_York&limit=100')
  const originalIds = (byDate.get('2026-11-15')?.summary.sampleGames ?? [])
    .map((game) => game.id)
    .sort()
  const repeatedIds = recordArray(dataOf(repeat), ['matches', 'games'])
    .map((game) => game.id)
    .sort()
  console.log(
    `Repeat stability 2026-11-15: same IDs=${JSON.stringify(originalIds) === JSON.stringify(repeatedIds)}; rows=${repeatedIds.length}.`,
  )

  console.log('\n=== Summary ===')
  console.log(
    JSON.stringify(
      {
        requests: sent,
        requestCeiling,
        quota: results.at(-1)?.quota,
        dateSamples: [...byDate.values()].map(({ summary }) => ({
          date: summary.date,
          count: summary.count,
          statuses: summary.statuses,
          completeScores: summary.completeScores,
          periodLines: summary.periodLines,
          uniqueIds: summary.uniqueIds,
          timestamps: summary.timestamps,
          nbaDatesMatchET: summary.nbaDatesMatchET,
          pagination: summary.pagination,
        })),
        selectedGameCount: selectedGames.length,
        playerCount: players.length,
        teamCount: teams.length,
        standingsRowCount: standings.length,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(`Stopped after ${sent} GET request(s): ${error.message}`)
  process.exitCode = 1
})
