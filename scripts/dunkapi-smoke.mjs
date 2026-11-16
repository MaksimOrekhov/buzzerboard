const baseUrl = 'https://mcp.dunkapi.com/v1'
const arguments_ = process.argv.slice(2).filter((argument) => argument !== '--')
const execute = arguments_.includes('--execute')
const verifyIdentifiersMode = arguments_.includes('--verify-identifiers')
const creditCeiling = verifyIdentifiersMode ? 9 : 18
const confirmationArgument = arguments_.find((argument) =>
  argument.startsWith('--confirm-credit-spend='),
)
const confirmedCreditCeiling = confirmationArgument
  ? Number(confirmationArgument.slice('--confirm-credit-spend='.length))
  : null
const unexpectedArgs = arguments_.filter(
  (argument) =>
    argument !== '--execute' &&
    argument !== '--verify-identifiers' &&
    argument !== confirmationArgument,
)

if (unexpectedArgs.length > 0) {
  console.error(
    'Usage: node scripts/dunkapi-smoke.mjs [--verify-identifiers] [--execute --confirm-credit-spend=<18|9>]',
  )
  process.exit(2)
}

const requests = [
  {
    endpoint: 'list_games',
    credits: 2,
    body: { league: 'nba', season: 2027, date: '2026-11-01', limit: 30 },
  },
  {
    endpoint: 'list_games',
    credits: 2,
    body: { league: 'nba', season: 2027, date: '2026-11-15', limit: 30 },
  },
  { endpoint: 'get_schedule', credits: 2, body: { league: 'nba', days: 7 } },
  { endpoint: 'get_standings', credits: 2, body: { league: 'nba', season: 2027 } },
]

if (!execute) {
  console.log('Dry run only; no network calls made.')
  if (verifyIdentifiersMode) {
    console.log('Planned: list_games, get_standings, get_game')
    console.log('Maximum supplemental cost: 9 credits.')
  } else {
    console.log(`Planned: ${requests.map(({ endpoint }) => endpoint).join(', ')}`)
    console.log(
      `Maximum base cost: ${requests.reduce((total, request) => total + request.credits, 0)} credits.`,
    )
    console.log('One get_game and one get_player_games request may add up to 10 more credits.')
    console.log('Maximum total for this run: 18 credits.')
  }
  console.log('Each later execution spends credits again; this script does not track prior usage.')
  console.log(
    `Network calls require --execute --confirm-credit-spend=${creditCeiling} and DUNKAPI_API_KEY.`,
  )
  process.exit(0)
}

if (confirmedCreditCeiling !== creditCeiling) {
  console.error(
    `No API request was sent. Confirm this run's ${creditCeiling}-credit ceiling with --confirm-credit-spend=${creditCeiling}.`,
  )
  process.exit(1)
}

console.log(
  `Confirmed up to ${creditCeiling} credits for this run. Running again will spend credits again; prior usage is not tracked.`,
)

const apiKey = process.env.DUNKAPI_API_KEY

if (!apiKey) {
  console.error('DUNKAPI_API_KEY is not set. No API request was sent.')
  process.exit(1)
}

let reservedCredits = 0
const httpResults = []

async function post(endpoint, body, credits) {
  if (reservedCredits + credits > creditCeiling) {
    throw new Error(`Credit ceiling reached before ${endpoint}; no request sent.`)
  }

  reservedCredits += credits

  let response
  const startedAt = Date.now()

  try {
    response = await fetch(`${baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error(
      `${endpoint} request failed; stopped without retry. Up to ${reservedCredits} credits reserved.`,
    )
  }

  const httpResult = { endpoint, status: response.status, durationMs: 0 }
  httpResults.push(httpResult)

  let payload

  try {
    payload = await response.json()
  } catch {
    throw new Error(
      `${endpoint} returned a non-JSON response (HTTP ${response.status}); stopped without retry.`,
    )
  }

  if (!response.ok) {
    httpResult.durationMs = Date.now() - startedAt
    throw new Error(
      `${endpoint} returned HTTP ${response.status}; response body suppressed; stopped without retry.`,
    )
  }

  if (payload && typeof payload === 'object' && 'error' in payload) {
    throw new Error(
      `${endpoint} returned a provider error; response body suppressed; stopped without retry.`,
    )
  }

  const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload

  if (!data || typeof data !== 'object') {
    throw new Error(`${endpoint} returned an unexpected response shape; stopped without retry.`)
  }

  httpResult.durationMs = Date.now() - startedAt
  return data
}

function gamesSummary(games) {
  const statusCounts = Object.groupBy(games, (game) => game.status)
  const timeComparisons = games
    .filter((game) => typeof game.date === 'string' && typeof game.starts_at === 'string')
    .map((game) => {
      const instant = new Date(game.starts_at)
      const utcHour = instant.getUTCHours()
      const nbaEasternDate = dateKeyInTimeZone(instant, 'America/New_York')
      const nicosiaDate = dateKeyInTimeZone(instant, 'Europe/Nicosia')

      return {
        nbaDate: game.date,
        easternDate: nbaEasternDate,
        nicosiaDate,
        startsAtUtc: game.starts_at,
        nearUtcMidnight: utcHour >= 22 || utcHour < 2,
      }
    })
  const completeScores = games.filter(
    (game) => Number.isFinite(game.home?.score) && Number.isFinite(game.away?.score),
  ).length
  const scheduledWithoutScores = games.filter(
    (game) => game.status === 'scheduled' && game.home?.score == null && game.away?.score == null,
  ).length

  return {
    count: games.length,
    statuses: Object.fromEntries(
      Object.entries(statusCounts).map(([status, entries]) => [
        status ?? 'unknown',
        entries.length,
      ]),
    ),
    completeScores,
    scheduledWithoutScores,
    nbaDateMatchesEastern: timeComparisons.every(
      ({ nbaDate, easternDate }) => nbaDate === easternDate,
    ),
    timestampCount: timeComparisons.length,
    nearUtcMidnightCount: timeComparisons.filter(({ nearUtcMidnight }) => nearUtcMidnight).length,
    timezoneSamples: timeComparisons
      .filter(
        ({ nearUtcMidnight, nbaDate, nicosiaDate }) => nearUtcMidnight || nbaDate !== nicosiaDate,
      )
      .slice(0, 3),
  }
}

function dateKeyInTimeZone(instant, timeZone) {
  if (Number.isNaN(instant.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const dateParts = Object.fromEntries(parts.map(({ type, value }) => [type, value]))

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`
}

function summarizeStandings(standings) {
  const conferences = Object.groupBy(standings, (team) => team.conference ?? 'unknown')
  const teamIds = standings.map((team) => team.team_id).filter(Boolean)

  return {
    count: standings.length,
    conferenceCounts: Object.fromEntries(
      Object.entries(conferences).map(([conference, teams]) => [conference, teams.length]),
    ),
    uniqueTeamIds: new Set(teamIds).size,
    requiredFieldsPresent: standings.every(
      (team) => team.team_id && team.abbrev && team.display_name && team.conference,
    ),
  }
}

function findFreshness(data) {
  const candidates = [data.updated_at, data.refreshed_at, data.last_updated, data.as_of]
  return candidates.find((value) => typeof value === 'string') ?? null
}

async function verifyIdentifierConsistency() {
  const gameList = await post(
    'list_games',
    { league: 'nba', season: 2027, date: '2026-11-15', limit: 30 },
    2,
  )
  const standingsResponse = await post('get_standings', { league: 'nba', season: 2027 }, 2)
  const finalGame = (Array.isArray(gameList.games) ? gameList.games : []).find(
    (game) => game.status === 'final' && game.game_id,
  )
  const standings = Array.isArray(standingsResponse.standings) ? standingsResponse.standings : []
  const standingsIds = new Set(standings.map((team) => String(team.team_id)))
  const standingMetricFields = [
    'wins',
    'losses',
    'conf_wins',
    'conf_losses',
    'home_wins',
    'home_losses',
    'away_wins',
    'away_losses',
    'points_for',
    'points_against',
    'avg_margin',
    'last10_wins',
    'win_pct',
  ]
  const report = {
    endpoint: 'identifier_consistency',
    dateGameCount: Array.isArray(gameList.games) ? gameList.games.length : 0,
    standingsCount: standings.length,
    uniqueStandingTeamIds: standingsIds.size,
    standingsStatsPresentOnEveryTeam: standings.every((team) =>
      standingMetricFields.every((field) => field in team),
    ),
    rankLikeFields: standings[0]
      ? Object.keys(standings[0]).filter((field) => /rank|seed/i.test(field))
      : [],
  }

  if (!finalGame) {
    report.skipped = 'No final game ID in the date response.'
  } else {
    const details = await post('get_game', { league: 'nba', game_id: String(finalGame.game_id) }, 5)
    const game = details.game ?? details
    const teamStats = Array.isArray(details.team_stats) ? details.team_stats : []
    const players = Array.isArray(details.players) ? details.players : []
    const homeStats = teamStats.find((team) => team.home === true)
    const awayStats = teamStats.find((team) => team.home === false)
    const gameTeamIds = [String(game.home?.team_id), String(game.away?.team_id)]

    Object.assign(report, {
      gameIdMatches: String(game.game_id) === String(finalGame.game_id),
      gameTeamIdsPresent: gameTeamIds.every((teamId) => teamId !== 'undefined'),
      gameTeamIdsExistInStandings: gameTeamIds.every((teamId) => standingsIds.has(teamId)),
      boxscoreHasMatchingHomeTeamId: String(homeStats?.team_id) === gameTeamIds[0],
      boxscoreHasMatchingAwayTeamId: String(awayStats?.team_id) === gameTeamIds[1],
      boxscoreTeamIdsUnique: new Set(teamStats.map((team) => String(team.team_id))).size === 2,
      teamStatsHaveCoreMetrics: teamStats.every((team) =>
        ['team_id', 'home', 'pts', 'fgm', 'fga', 'reb', 'ast'].every((field) => field in team),
      ),
      playerLinesCount: players.length,
      playerLinesHaveCoreStats: players.every((player) =>
        ['player_id', 'team_id', 'pts', 'reb', 'ast'].every((field) => field in player),
      ),
      playerLinesHaveGameTeamIds: players.every((player) =>
        gameTeamIds.includes(String(player.team_id)),
      ),
      homeScoreMatchesTeamStats: homeStats?.pts === game.home?.score,
      awayScoreMatchesTeamStats: awayStats?.pts === game.away?.score,
    })
  }

  console.log(JSON.stringify({ reservedCredits, creditCeiling, httpResults, report }, null, 2))
}

async function main() {
  const report = []
  const gamesByDate = []

  for (const request of requests) {
    const data = await post(request.endpoint, request.body, request.credits)

    if (request.endpoint === 'list_games') {
      const games = Array.isArray(data.games) ? data.games : []
      gamesByDate.push(...games)
      report.push({
        endpoint: request.endpoint,
        date: request.body.date,
        creditsReserved: request.credits,
        ...gamesSummary(games),
        providerCount: data.count ?? null,
        countMatchesResponseSize: data.count === games.length,
        nextOffset: data.next_offset ?? null,
        freshness: findFreshness(data),
      })
    } else if (request.endpoint === 'get_schedule') {
      const games = Array.isArray(data.games) ? data.games : []
      gamesByDate.push(...games)
      report.push({
        endpoint: request.endpoint,
        creditsReserved: request.credits,
        ...gamesSummary(games),
        freshness: findFreshness(data),
      })
    } else {
      const standings = Array.isArray(data.standings) ? data.standings : []
      report.push({
        endpoint: request.endpoint,
        creditsReserved: request.credits,
        ...summarizeStandings(standings),
        providerCount: data.count ?? null,
        freshness: findFreshness(data),
      })
    }
  }

  const finalGame = gamesByDate.find(
    (game) => game.status === 'final' && game.game_id && game.home?.score != null,
  )

  if (finalGame) {
    const details = await post('get_game', { league: 'nba', game_id: String(finalGame.game_id) }, 5)
    const game = details.game ?? details
    const teamStats = Array.isArray(details.team_stats) ? details.team_stats : []
    const players = Array.isArray(details.players) ? details.players : []
    const homeStats = teamStats.find((team) => team.home === true)
    const awayStats = teamStats.find((team) => team.home === false)
    const firstPlayer = players.find((player) => player.player_id)

    report.push({
      endpoint: 'get_game',
      creditsReserved: 5,
      gameIdMatches: String(game.game_id) === String(finalGame.game_id),
      hasUtcTimestamp: typeof game.starts_at === 'string' && game.starts_at.endsWith('Z'),
      teamStatsCount: teamStats.length,
      playerLinesCount: players.length,
      homeScoreMatchesTeamStats: homeStats?.pts === game.home?.score,
      awayScoreMatchesTeamStats: awayStats?.pts === game.away?.score,
      playerLineHasCoreStats: Boolean(
        firstPlayer &&
        ['player_id', 'team_id', 'pts', 'reb', 'ast'].every((key) => key in firstPlayer),
      ),
      freshness: findFreshness(details),
    })

    if (firstPlayer) {
      const playerGames = await post(
        'get_player_games',
        { league: 'nba', player_id: String(firstPlayer.player_id), season: 2027, limit: 3 },
        5,
      )
      const games = Array.isArray(playerGames.games) ? playerGames.games : []

      report.push({
        endpoint: 'get_player_games',
        creditsReserved: 5,
        count: games.length,
        hasPlayerId: Boolean(playerGames.player_id),
        firstLineHasCoreStats: Boolean(
          games[0] && ['game_id', 'date', 'pts', 'reb', 'ast'].every((key) => key in games[0]),
        ),
        freshness: findFreshness(playerGames),
      })
    }
  } else {
    report.push({
      endpoint: 'get_game',
      skipped: 'No final game ID in the bounded date/schedule responses.',
    })
    report.push({ endpoint: 'get_player_games', skipped: 'Requires a player ID from get_game.' })
  }

  console.log(JSON.stringify({ reservedCredits, creditCeiling, httpResults, report }, null, 2))
}

const run = verifyIdentifiersMode ? verifyIdentifierConsistency : main

run().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Smoke check failed; response details suppressed.',
  )
  console.error(
    `Stopped without retries; up to ${reservedCredits} credits reserved (ceiling ${creditCeiling}).`,
  )
  process.exitCode = 1
})
