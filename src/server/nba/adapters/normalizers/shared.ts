import type { Game, NbaProviderId, NbaSnapshot, StandingsRow } from '@/entities/nba/model'
import { NbaAdapterError, invalidResponseError } from '@/server/nba/adapters/errors'
import {
  createGameId,
  createTeam,
  isRecord,
  nbaGameDateFromUtc,
  normalizeGameStatus,
  normalizeConference,
  parseNbaGameDate,
  parseSeasonEndYear,
  parseUtcTimestamp,
  readIdentifier,
  readNonNegativeNumber,
  readNumber,
  readString,
  timestampField,
  unwrapProviderPayload,
} from '@/server/nba/adapters/normalizers/primitives'
import type { NormalizationContext } from '@/server/nba/adapters/adapter'

export function requireProviderRoot(payload: unknown, provider: NbaProviderId) {
  const root = unwrapProviderPayload(payload)
  if (!root || 'error' in root) throw new NbaAdapterError(invalidResponseError(provider))
  return root
}

export function requireArray(
  root: Record<string, unknown>,
  key: string,
  provider: NbaProviderId,
): unknown[] {
  if (!Array.isArray(root[key])) throw new NbaAdapterError(invalidResponseError(provider))
  return root[key]
}

export function createSnapshot<T>(
  provider: NbaProviderId,
  root: Record<string, unknown>,
  context: NormalizationContext,
  data: T,
  rejectedRecords: number,
): NbaSnapshot<T> {
  const fetchedAt = parseUtcTimestamp(context.fetchedAt)
  if (!fetchedAt || typeof context.stale !== 'boolean') {
    throw new NbaAdapterError(invalidResponseError(provider))
  }

  return {
    data,
    meta: {
      provider,
      fetchedAt,
      providerUpdatedAt: timestampField(
        root,
        'updated_at',
        'refreshed_at',
        'last_updated',
        'as_of',
      ),
      stale: context.stale,
      rejectedRecords,
    },
  }
}

export function normalizeDunkGame(value: unknown, provider: NbaProviderId): Game | null {
  if (!isRecord(value)) return null
  const home = isRecord(value.home) ? value.home : null
  const away = isRecord(value.away) ? value.away : null
  if (!home || !away) return null

  const homeTeam = createTeam(provider, home.team_id, home.abbrev, home.name)
  const awayTeam = createTeam(provider, away.team_id, away.abbrev, away.name)
  const providerId = readIdentifier(value.game_id)
  const startsAt = parseUtcTimestamp(value.starts_at)
  const nbaGameDate =
    parseNbaGameDate(value.date) ?? (startsAt ? nbaGameDateFromUtc(startsAt) : null)
  if (!homeTeam || !awayTeam || !providerId || !nbaGameDate) return null

  return {
    id: createGameId(provider, providerId),
    provider,
    providerId,
    seasonEndYear: parseSeasonEndYear(value.season),
    nbaGameDate,
    startsAt,
    status: normalizeGameStatus(value.status),
    homeTeam,
    awayTeam,
    score: {
      home: readNonNegativeNumber(home.score),
      away: readNonNegativeNumber(away.score),
    },
    // DunkAPI documents the number of periods, but not per-period scores on list_games.
    scoreByPeriod: null,
    venue: readString(value.venue),
  }
}

export function normalizeDunkStandingsRow(
  value: unknown,
  index: number,
  seasonEndYear: unknown,
  provider: NbaProviderId,
): StandingsRow | null {
  if (!isRecord(value)) return null
  const team = createTeam(provider, value.team_id, value.abbrev, value.display_name)
  if (!team) return null

  return {
    team,
    seasonEndYear: parseSeasonEndYear(value.season) ?? parseSeasonEndYear(seasonEndYear),
    conference: normalizeConference(value.conference),
    record: {
      wins: readNonNegativeNumber(value.wins),
      losses: readNonNegativeNumber(value.losses),
      conferenceWins: readNonNegativeNumber(value.conf_wins),
      conferenceLosses: readNonNegativeNumber(value.conf_losses),
      homeWins: readNonNegativeNumber(value.home_wins),
      homeLosses: readNonNegativeNumber(value.home_losses),
      awayWins: readNonNegativeNumber(value.away_wins),
      awayLosses: readNonNegativeNumber(value.away_losses),
      lastTenWins: readNonNegativeNumber(value.last10_wins),
      pointsFor: readNonNegativeNumber(value.points_for),
      pointsAgainst: readNonNegativeNumber(value.points_against),
      averageMargin: readNumber(value.avg_margin),
    },
    winPercentage: readNonNegativeNumber(value.win_pct),
    officialRank: null,
    playoffSeed: null,
    providerOrder: index + 1,
  }
}

export function collectGames(
  provider: NbaProviderId,
  root: Record<string, unknown>,
  context: NormalizationContext,
): NbaSnapshot<readonly Game[]> {
  if (!Array.isArray(root.games)) throw new NbaAdapterError(invalidResponseError(provider))
  let rejectedRecords = 0
  const data: Game[] = []

  for (const value of root.games) {
    const game = normalizeDunkGame(value, provider)
    if (game) data.push(game)
    else rejectedRecords += 1
  }

  return createSnapshot(provider, root, context, data, rejectedRecords)
}

export function collectDunkStandings(
  provider: NbaProviderId,
  root: Record<string, unknown>,
  context: NormalizationContext,
): NbaSnapshot<readonly StandingsRow[]> {
  if (!Array.isArray(root.standings)) throw new NbaAdapterError(invalidResponseError(provider))
  let rejectedRecords = 0
  const data: StandingsRow[] = []

  root.standings.forEach((value, index) => {
    const row = normalizeDunkStandingsRow(value, index, root.season, provider)
    if (row) data.push(row)
    else rejectedRecords += 1
  })

  return createSnapshot(provider, root, context, data, rejectedRecords)
}

export function statValue(stats: unknown, ...names: string[]): number | null {
  if (!Array.isArray(stats)) return null
  const normalizedNames = new Set(names.map((name) => name.toLowerCase().replaceAll(/[^a-z]/g, '')))

  for (const stat of stats) {
    if (!isRecord(stat)) continue
    const name = readString(stat.name ?? stat.abbreviation)
    if (!name || !normalizedNames.has(name.toLowerCase().replaceAll(/[^a-z]/g, ''))) continue
    const value = readNumber(stat.value)
    if (value !== null) return value
  }
  return null
}
