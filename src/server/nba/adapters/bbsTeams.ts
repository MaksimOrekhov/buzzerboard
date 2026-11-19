import type {
  Conference,
  GameId,
  NbaTeamReference,
  PlayerId,
  ProviderRecordId,
  SeasonEndYear,
  TeamRecordSplit,
  TeamId,
  TeamProviderReference,
  StandingsRow,
  TeamSeasonLeader,
  TeamSeasonProfile,
  TeamRecentGame,
  UtcTimestamp,
} from '@/entities/nba/model'
import { findNbaTeam, NBA_TEAMS } from '@/entities/nba/teamCatalog'
import { NbaAdapterError, invalidResponseError } from './errors'
import {
  createTeam,
  isRecord,
  parseNbaGameDate,
  parseUtcTimestamp,
  readIdentifier,
  readNonNegativeNumber,
  readNumber,
  readString,
  unwrapProviderPayload,
} from './normalizers/primitives'

const provider = 'bbs' as const

function rootOf(payload: unknown): Record<string, unknown> {
  const root = unwrapProviderPayload(payload)
  if (!root || ('error' in root && root.error !== null && root.error !== undefined))
    throw new NbaAdapterError(invalidResponseError(provider))
  return root
}

function sourceId(value: unknown): ProviderRecordId | null {
  return readIdentifier(value)
}

function canonicalOpponent(value: unknown): string | null {
  const abbreviation = readString(value)
  if (!abbreviation) return null
  const team = createTeam(provider, abbreviation, abbreviation, null)
  return team?.id.startsWith('nba:team:') ? (team.abbreviation ?? null) : null
}

function percentage(value: unknown): number | null {
  const raw = readNonNegativeNumber(value)
  if (raw === null) return null
  const normalized = raw > 1 ? raw / 100 : raw
  return normalized <= 1 ? normalized : null
}

function split(value: unknown): TeamRecordSplit | null {
  if (!isRecord(value)) return null
  const wins = readNonNegativeNumber(value.wins)
  const losses = readNonNegativeNumber(value.losses)
  const ties = readNonNegativeNumber(value.ties)
  if (wins === null && losses === null && ties === null) return null
  if (
    (wins !== null && (!Number.isInteger(wins) || wins > 82)) ||
    (losses !== null && (!Number.isInteger(losses) || losses > 82)) ||
    (ties !== null && (!Number.isInteger(ties) || ties !== 0))
  )
    return null
  return { wins, losses, ties }
}

function recordLine(value: unknown): { wins: number; losses: number } | null {
  const text = readString(value)
  if (!text) return null
  const match = /^(\d+)-(\d+)$/.exec(text)
  if (!match) return null
  return { wins: Number(match[1]), losses: Number(match[2]) }
}

function recentGames(value: unknown, expectedCount: number): readonly TeamRecentGame[] | null {
  if (!Array.isArray(value) || value.length !== expectedCount) return null
  const seen = new Set<string>()
  const result: TeamRecentGame[] = []
  for (const candidate of value) {
    if (!isRecord(candidate)) return null
    const id = sourceId(candidate.match_id ?? candidate.id)
    const date = parseNbaGameDate(candidate.game_date ?? candidate.date)
    const opponentCode = canonicalOpponent(candidate.opponent)
    const outcome = candidate.result
    const pointsFor = readNonNegativeNumber(candidate.score_for)
    const pointsAgainst = readNonNegativeNumber(candidate.score_against)
    const venue = candidate.venue === 'home' || candidate.venue === 'away' ? candidate.venue : null
    if (
      !id ||
      seen.has(id) ||
      !date ||
      !opponentCode ||
      (outcome !== 'W' && outcome !== 'L') ||
      pointsFor === null ||
      pointsAgainst === null ||
      (outcome === 'W' ? pointsFor <= pointsAgainst : pointsFor >= pointsAgainst)
    )
      return null
    seen.add(id)
    result.push({
      gameId: `bbs:game:${id}` as GameId,
      nbaGameDate: date,
      opponentCode,
      result: outcome,
      pointsFor,
      pointsAgainst,
      venue,
    })
  }
  return result
}

function leaders(value: unknown): readonly TeamSeasonLeader[] {
  if (!Array.isArray(value)) return []
  const result: TeamSeasonLeader[] = []
  for (const candidate of value) {
    if (!isRecord(candidate)) continue
    const id = sourceId(candidate.player_id ?? candidate.id)
    const displayName = readString(candidate.name ?? candidate.display_name)
    const statLabel = readString(candidate.stat_label)
    if (!id || !displayName || !statLabel) continue
    result.push({
      playerId: `bbs:player:${id}` as PlayerId,
      displayName,
      statLabel,
      statValue: readNumber(candidate.stat_value),
    })
  }
  return result
}

function nextGame(value: unknown): TeamSeasonProfile['nextGame'] {
  if (!isRecord(value)) return null
  const id = sourceId(value.match_id ?? value.id)
  if (!id) return null
  return {
    gameId: `bbs:game:${id}` as GameId,
    nbaGameDate: null,
    startsAt: parseUtcTimestamp(value.kickoff_utc),
    isHome: typeof value.is_home === 'boolean' ? value.is_home : null,
    opponentCode: canonicalOpponent(value.opponent),
  }
}

export interface BbsTeamSeasonSnapshot {
  data: TeamSeasonProfile
  providerTeamId: ProviderRecordId
  providerUpdatedAt: UtcTimestamp | null
  rejectedRecords: number
}

function rowsFrom(value: unknown, keys: readonly string[]): unknown[] {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) return []
  for (const key of keys) if (Array.isArray(value[key])) return value[key] as unknown[]
  return []
}

function identityIds(value: Record<string, unknown>): ProviderRecordId[] {
  const team = isRecord(value.team) ? value.team : {}
  return [value.team_id, value.team_uuid, value.id, team.id, team.team_id]
    .map((candidate) => sourceId(candidate))
    .filter((candidate): candidate is ProviderRecordId => candidate !== null)
}

function directoryIds(value: Record<string, unknown>): string[] {
  return [value.id, value.team_id, value.team_uuid, value.uuid, value.archive_team_id]
    .map((candidate) => sourceId(candidate))
    .filter((candidate): candidate is ProviderRecordId => candidate !== null)
}

function standingsRows(payload: unknown, seasonEndYear: SeasonEndYear) {
  const root = rootOf(payload)
  const groups = rowsFrom(root.standings, ['rows', 'standings'])
  const startYear = Number(seasonEndYear) - 1
  const expectedSeason = `${startYear}-${String(seasonEndYear).slice(-2)}`
  for (const source of [root, ...groups]) {
    if (!isRecord(source)) continue
    const season = source.season
    if (
      season != null &&
      season !== startYear &&
      season !== String(startYear) &&
      season !== expectedSeason
    )
      throw new NbaAdapterError(invalidResponseError(provider))
  }
  const rows = groups.length
    ? groups.flatMap((group) =>
        rowsFrom(group, ['rows', 'standings']).map((row) => ({ row, group })),
      )
    : rowsFrom(root, ['rows', 'standings']).map((row) => ({ row, group: null }))
  if (rows.length !== NBA_TEAMS.length) throw new NbaAdapterError(invalidResponseError(provider))
  return rows
}

function matchesTeamAbbreviation(value: Record<string, unknown>, teamId: TeamId): boolean {
  return [value.abbreviation, value.abbr].every(
    (abbreviation) =>
      abbreviation == null || createTeam(provider, null, abbreviation, null)?.id === teamId,
  )
}

export function normalizeBbsTeamDirectory(
  standingsPayload: unknown,
  directoryPayload: unknown,
  seasonEndYear: SeasonEndYear,
): readonly TeamProviderReference[] {
  const standingRows = standingsRows(standingsPayload, seasonEndYear)
  const directoryRoot = rootOf(directoryPayload)
  const directoryRows = Array.isArray(directoryRoot.data)
    ? directoryRoot.data
    : rowsFrom(directoryRoot, ['teams'])
  if (directoryRows.length < NBA_TEAMS.length)
    throw new NbaAdapterError(invalidResponseError(provider))

  const directoryById = new Map<string, Record<string, unknown>>()
  for (const row of directoryRows) {
    if (!isRecord(row)) continue
    for (const id of directoryIds(row)) {
      const existing = directoryById.get(id)
      if (existing && existing !== row) throw new NbaAdapterError(invalidResponseError(provider))
      directoryById.set(id, row)
    }
  }

  const references: TeamProviderReference[] = []
  const standingIds = new Set<string>()
  const providerIds = new Set<string>()
  const canonicalTeams = new Set<string>()
  for (const { row: value } of standingRows) {
    if (!isRecord(value)) throw new NbaAdapterError(invalidResponseError(provider))
    const ids = identityIds(value)
    const primaryId = ids[0]
    const candidates = new Set(ids.map((id) => directoryById.get(id)).filter(Boolean))
    const [directory] = candidates
    if (!primaryId || !directory || candidates.size !== 1)
      throw new NbaAdapterError(invalidResponseError(provider))
    const providerTeamId = sourceId(directory.id ?? directory.team_uuid ?? directory.uuid)
    const abbreviation = readString(
      directory.abbreviation ?? directory.abbr ?? directory.short_name,
    )
    const team = createTeam(
      provider,
      providerTeamId,
      abbreviation,
      directory.name ?? directory.display_name ?? directory.team_name,
    )
    if (
      !providerTeamId ||
      !team ||
      !matchesTeamAbbreviation(value, team.id) ||
      canonicalTeams.has(team.id) ||
      providerIds.has(providerTeamId) ||
      standingIds.has(primaryId)
    ) {
      throw new NbaAdapterError(invalidResponseError(provider))
    }
    standingIds.add(primaryId)
    providerIds.add(providerTeamId)
    canonicalTeams.add(team.id)
    references.push({
      teamId: team.id,
      providerTeamId,
      ...(primaryId !== providerTeamId ? { standingsTeamId: primaryId } : {}),
    })
  }

  const expectedCodes = new Set(NBA_TEAMS.map((team) => team.code))
  const actualCodes = new Set([...canonicalTeams].map((id) => id.slice('nba:team:'.length)))
  if (
    references.length !== 30 ||
    canonicalTeams.size !== 30 ||
    actualCodes.size !== expectedCodes.size ||
    [...expectedCodes].some((code) => !actualCodes.has(code))
  ) {
    throw new NbaAdapterError(invalidResponseError(provider))
  }

  return references
}

/** Normalize the same BBS standings payload used by the team directory endpoint. */
export function normalizeBbsStandings(
  payload: unknown,
  seasonEndYear: SeasonEndYear,
  references?: readonly TeamProviderReference[],
): readonly StandingsRow[] {
  const groupedRows = standingsRows(payload, seasonEndYear)
  const byStandingsId = new Map<string, NbaTeamReference>()
  if (references) {
    const canonicalIds = new Set<TeamId>()
    const directoryIds = new Set<string>()
    for (const reference of references) {
      const canonical = findNbaTeam(reference.teamId.slice('nba:team:'.length))
      const standingsId = reference.standingsTeamId ?? reference.providerTeamId
      if (
        canonical?.team.id !== reference.teamId ||
        !sourceId(standingsId) ||
        !sourceId(reference.providerTeamId) ||
        byStandingsId.has(standingsId) ||
        directoryIds.has(reference.providerTeamId) ||
        canonicalIds.has(reference.teamId)
      )
        throw new NbaAdapterError(invalidResponseError(provider))
      byStandingsId.set(standingsId, canonical)
      directoryIds.add(reference.providerTeamId)
      canonicalIds.add(reference.teamId)
    }
    if (byStandingsId.size !== NBA_TEAMS.length)
      throw new NbaAdapterError(invalidResponseError(provider))
  }

  const seen = new Set<string>()
  const seenProviderIds = new Set<string>()
  const conferenceCounts = { east: 0, west: 0 }
  let totalWins = 0
  let totalLosses = 0
  const rows: StandingsRow[] = groupedRows.map(({ row: candidate, group }, index) => {
    if (!isRecord(candidate)) throw new NbaAdapterError(invalidResponseError(provider))
    const abbreviation = readString(candidate.abbreviation ?? candidate.abbr)
    const providerId = identityIds(candidate)[0]
    const reportedTeam = abbreviation ? createTeam(provider, null, abbreviation, null) : null
    const canonical = references
      ? byStandingsId.get(providerId ?? '')
      : reportedTeam?.abbreviation && findNbaTeam(reportedTeam.abbreviation)
    if (
      !canonical ||
      !providerId ||
      !matchesTeamAbbreviation(candidate, canonical.team.id) ||
      seen.has(canonical.code) ||
      seenProviderIds.has(providerId)
    )
      throw new NbaAdapterError(invalidResponseError(provider))
    seen.add(canonical.code)
    seenProviderIds.add(providerId)

    const conferenceText = readString(
      candidate.conference ?? (isRecord(group) ? (group.conference ?? group.name) : null),
    )?.toLowerCase()
    const reportedConference: Conference | null = conferenceText?.includes('east')
      ? 'east'
      : conferenceText?.includes('west')
        ? 'west'
        : null
    if (reportedConference && reportedConference !== canonical.conference)
      throw new NbaAdapterError(invalidResponseError(provider))
    const conference = canonical.conference
    conferenceCounts[conference] += 1
    const parsedRecord = recordLine(candidate.record ?? candidate.wins_losses)
    const wins = readNonNegativeNumber(candidate.wins) ?? parsedRecord?.wins ?? null
    const losses = readNonNegativeNumber(candidate.losses) ?? parsedRecord?.losses ?? null
    if (
      wins === null ||
      losses === null ||
      !Number.isInteger(wins) ||
      !Number.isInteger(losses) ||
      wins + losses > 82
    )
      throw new NbaAdapterError(invalidResponseError(provider))
    totalWins += wins
    totalLosses += losses
    const total = wins + losses
    const rawRank = readNonNegativeNumber(candidate.conference_rank)
    const playoffSeed = readNonNegativeNumber(candidate.playoff_seed)
    if (
      (rawRank !== null && (!Number.isInteger(rawRank) || rawRank < 1 || rawRank > 15)) ||
      (playoffSeed !== null &&
        (!Number.isInteger(playoffSeed) || playoffSeed < 1 || playoffSeed > 15))
    )
      throw new NbaAdapterError(invalidResponseError(provider))
    return {
      team: { ...canonical.team, providerId },
      seasonEndYear,
      conference,
      record: {
        wins,
        losses,
        conferenceWins: readNonNegativeNumber(candidate.conference_wins),
        conferenceLosses: readNonNegativeNumber(candidate.conference_losses),
        homeWins: null,
        homeLosses: null,
        awayWins: null,
        awayLosses: null,
        lastTenWins: null,
        pointsFor: null,
        pointsAgainst: null,
        averageMargin: null,
      },
      winPercentage: total ? wins / total : null,
      officialRank: rawRank,
      playoffSeed,
      providerOrder: index + 1,
    }
  })
  if (
    seen.size !== 30 ||
    seenProviderIds.size !== 30 ||
    conferenceCounts.east !== 15 ||
    conferenceCounts.west !== 15 ||
    totalWins !== totalLosses
  )
    throw new NbaAdapterError(invalidResponseError(provider))
  return rows
}

export function normalizeBbsTeamSeason(
  payload: unknown,
  expectedTeam: NbaTeamReference,
  seasonEndYear: SeasonEndYear,
): BbsTeamSeasonSnapshot {
  const root = rootOf(payload)
  const teamMeta = root.team_meta
  const providerTeamId = isRecord(teamMeta) ? sourceId(teamMeta.id) : null
  const abbreviation = isRecord(teamMeta)
    ? readString(teamMeta.abbreviation ?? teamMeta.abbr)
    : null
  const team = isRecord(teamMeta)
    ? createTeam(provider, teamMeta.id, abbreviation, teamMeta.name ?? teamMeta.display_name)
    : null
  const expectedStartYear = Number(seasonEndYear) - 1
  const season = readString(root.season)
  const expectedSeason = `${expectedStartYear}-${String(seasonEndYear).slice(-2)}`
  const overall = recordLine(root.record)
  const standings = isRecord(root.standings) ? root.standings : {}
  const stats = isRecord(root.season_stats) ? root.season_stats : {}
  const splitRows = isRecord(root.home_away_splits) ? root.home_away_splits : {}
  if (
    !team ||
    team.id !== expectedTeam.team.id ||
    !providerTeamId ||
    !overall ||
    (season !== expectedSeason && season !== String(expectedStartYear))
  ) {
    throw new NbaAdapterError(invalidResponseError(provider))
  }

  const gamesPlayed = readNonNegativeNumber(stats.games_played)
  const recordGamesPlayed = overall.wins + overall.losses
  const rawRecent = root.last_10
  const lastTen = recentGames(rawRecent, 10)
  const rawLeaders = root.top_players
  const normalizedLeaders = leaders(rawLeaders)
  let rejectedRecords = 0
  if (rawRecent !== undefined && rawRecent !== null && lastTen === null) rejectedRecords += 1
  if (Array.isArray(rawLeaders)) rejectedRecords += rawLeaders.length - normalizedLeaders.length

  return {
    data: {
      team: { ...team, providerId: providerTeamId },
      seasonEndYear,
      wins: overall.wins,
      losses: overall.losses,
      winPercentage: recordGamesPlayed > 0 ? overall.wins / recordGamesPlayed : null,
      overallRank: readNonNegativeNumber(standings.overall_rank),
      conferenceRank: readNonNegativeNumber(standings.conference_rank),
      gamesBack: readNonNegativeNumber(standings.games_back),
      streak: readString(standings.streak),
      home: split(splitRows.home),
      away: split(splitRows.away),
      stats: {
        gamesPlayed: gamesPlayed === recordGamesPlayed ? gamesPlayed : null,
        pointsPerGame: readNonNegativeNumber(stats.ppg),
        fieldGoalPercentage: percentage(stats.fg_pct),
        threePointPercentage: percentage(stats.three_pt_pct),
        reboundsPerGame: readNonNegativeNumber(stats.reb_pg),
        assistsPerGame: readNonNegativeNumber(stats.ast_pg),
        turnoversPerGame: readNonNegativeNumber(stats.tov_pg),
      },
      lastTen,
      leaders: normalizedLeaders,
      nextGame: nextGame(root.next_game),
    },
    providerTeamId,
    providerUpdatedAt: parseUtcTimestamp(root.as_of),
    rejectedRecords,
  }
}
