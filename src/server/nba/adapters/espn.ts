import type {
  Game,
  NbaProviderId,
  NbaSnapshot,
  ScoreByPeriod,
  StandingsRow,
  Team,
} from '@/entities/nba/model'
import type { NbaProviderAdapter, NormalizationContext } from '@/server/nba/adapters/adapter'
import { NbaAdapterError, invalidResponseError } from '@/server/nba/adapters/errors'
import {
  createGameId,
  createTeam,
  isRecord,
  normalizeConference,
  normalizeGameStatus,
  nbaGameDateFromUtc,
  parseSeasonEndYear,
  parseUtcTimestamp,
  readIdentifier,
  readNonNegativeNumber,
  readNumber,
  readString,
  unwrapProviderPayload,
} from '@/server/nba/adapters/normalizers/primitives'
import { createSnapshot, statValue } from '@/server/nba/adapters/normalizers/shared'

const provider: NbaProviderId = 'espn'

function teamFromEspn(value: unknown): Team | null {
  if (!isRecord(value)) return null
  return createTeam(provider, value.id, value.abbreviation, value.displayName)
}

function scoreValue(value: unknown): number | null {
  return readNonNegativeNumber(value)
}

function normalizePeriodScores(
  homeValue: unknown,
  awayValue: unknown,
): readonly ScoreByPeriod[] | null {
  const readLinescores = (value: unknown) => {
    if (!Array.isArray(value)) return []
    return value.flatMap((line) => {
      if (!isRecord(line)) return []
      const period = readNumber(line.period)
      if (period === null || !Number.isInteger(period) || period < 1) return []
      return [{ period, value: scoreValue(line.value) }]
    })
  }

  const homeLines = readLinescores(homeValue)
  const awayLines = readLinescores(awayValue)
  if (homeLines.length === 0 && awayLines.length === 0) return null

  const periods = new Set([...homeLines, ...awayLines].map(({ period }) => period))
  return [...periods]
    .sort((left, right) => left - right)
    .map((period) => ({
      period,
      home: homeLines.find((line) => line.period === period)?.value ?? null,
      away: awayLines.find((line) => line.period === period)?.value ?? null,
    }))
}

function normalizeEspnGame(value: unknown): Game | null {
  if (!isRecord(value)) return null
  const competition =
    Array.isArray(value.competitions) && isRecord(value.competitions[0])
      ? value.competitions[0]
      : null
  if (!competition || !Array.isArray(competition.competitors)) return null

  const competitors = competition.competitors.filter(isRecord)
  const home = competitors.find((item) => item.homeAway === 'home')
  const away = competitors.find((item) => item.homeAway === 'away')
  if (!home || !away) return null

  const homeTeam = teamFromEspn(home.team)
  const awayTeam = teamFromEspn(away.team)
  const providerId = readIdentifier(value.id)
  const startsAt = parseUtcTimestamp(value.date)
  const nbaGameDate = startsAt ? nbaGameDateFromUtc(startsAt) : null
  if (!homeTeam || !awayTeam || !providerId || !nbaGameDate) return null

  const status = isRecord(value.status) ? value.status : {}
  const statusType = isRecord(status.type) ? status.type : {}
  const venue = isRecord(competition.venue) ? readString(competition.venue.fullName) : null

  return {
    id: createGameId(provider, providerId),
    provider,
    providerId,
    seasonEndYear: parseSeasonEndYear(value.season),
    nbaGameDate,
    startsAt,
    status: normalizeGameStatus(statusType.name, statusType.state, statusType.description),
    homeTeam,
    awayTeam,
    score: { home: scoreValue(home.score), away: scoreValue(away.score) },
    scoreByPeriod: normalizePeriodScores(home.linescores, away.linescores),
    venue,
  }
}

function normalizeEspnStandingsRow(
  value: unknown,
  conferenceValue: unknown,
  seasonValue: unknown,
  providerOrder: number,
): StandingsRow | null {
  if (!isRecord(value)) return null
  const team = teamFromEspn(value.team)
  if (!team) return null

  const stats = value.stats
  const conference = normalizeConference(conferenceValue)
  return {
    team,
    seasonEndYear: parseSeasonEndYear(seasonValue),
    conference,
    record: {
      wins: statValue(stats, 'wins'),
      losses: statValue(stats, 'losses'),
      conferenceWins: statValue(stats, 'conferenceWins', 'confWins'),
      conferenceLosses: statValue(stats, 'conferenceLosses', 'confLosses'),
      homeWins: statValue(stats, 'homeWins'),
      homeLosses: statValue(stats, 'homeLosses'),
      awayWins: statValue(stats, 'awayWins', 'roadWins'),
      awayLosses: statValue(stats, 'awayLosses', 'roadLosses'),
      lastTenWins: statValue(stats, 'lastTenWins', 'last10Wins'),
      pointsFor: statValue(stats, 'pointsFor', 'avgPointsFor'),
      pointsAgainst: statValue(stats, 'pointsAgainst', 'avgPointsAgainst'),
      averageMargin: statValue(stats, 'averageMargin', 'pointDifferential', 'differential'),
    },
    winPercentage: statValue(stats, 'winPercent', 'winPercentage'),
    officialRank: null,
    playoffSeed: null,
    providerOrder,
  }
}

function requireRoot(payload: unknown) {
  const root = unwrapProviderPayload(payload)
  if (!root || 'error' in root) throw new NbaAdapterError(invalidResponseError(provider))
  return root
}

function normalizeGames(
  payload: unknown,
  context: NormalizationContext,
): NbaSnapshot<readonly Game[]> {
  const root = requireRoot(payload)
  if (!Array.isArray(root.events)) throw new NbaAdapterError(invalidResponseError(provider))
  let rejectedRecords = 0
  const data: Game[] = []
  for (const event of root.events) {
    const game = normalizeEspnGame(event)
    if (game) data.push(game)
    else rejectedRecords += 1
  }
  return createSnapshot(provider, root, context, data, rejectedRecords)
}

function normalizeStandings(
  payload: unknown,
  context: NormalizationContext,
): NbaSnapshot<readonly StandingsRow[]> {
  const root = requireRoot(payload)
  if (!Array.isArray(root.children)) throw new NbaAdapterError(invalidResponseError(provider))

  const season = isRecord(root.season) ? root.season.year : root.season
  let providerOrder = 0
  let rejectedRecords = 0
  const data: StandingsRow[] = []

  for (const group of root.children) {
    if (!isRecord(group) || !isRecord(group.standings) || !Array.isArray(group.standings.entries)) {
      rejectedRecords += 1
      continue
    }
    for (const entry of group.standings.entries) {
      const row = normalizeEspnStandingsRow(entry, group.name, season, providerOrder + 1)
      providerOrder += 1
      if (row) data.push(row)
      else rejectedRecords += 1
    }
  }

  return createSnapshot(provider, root, context, data, rejectedRecords)
}

export const espnAdapter: NbaProviderAdapter = {
  provider,
  capabilities: {
    games: { normalize: normalizeGames },
    standings: { normalize: normalizeStandings },
  },
}
