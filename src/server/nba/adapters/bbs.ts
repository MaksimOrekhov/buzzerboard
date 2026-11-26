import type {
  Game,
  GameBoxScore,
  NbaSnapshot,
  PlayerBoxScore,
  ScoreByPeriod,
  SeasonEndYear,
  ShootingLine,
  TeamBoxScore,
} from '@/entities/nba/model'
import type { NbaProviderAdapter, NormalizationContext } from '@/server/nba/adapters/adapter'
import { NbaAdapterError, invalidResponseError } from '@/server/nba/adapters/errors'
import {
  createGameId,
  createPlayer,
  createTeam,
  isRecord,
  nbaGameDateFromUtc,
  normalizeGameStatus,
  parseNbaGameDate,
  parseUtcTimestamp,
  readIdentifier,
  readNonNegativeNumber,
  readNumber,
  readString,
  unwrapProviderPayload,
} from '@/server/nba/adapters/normalizers/primitives'
import { createSnapshot } from '@/server/nba/adapters/normalizers/shared'

const provider = 'bbs' as const

function rootOf(value: unknown): Record<string, unknown> {
  const root = unwrapProviderPayload(value)
  if (!root || ('error' in root && root.error !== null && root.error !== undefined))
    throw new NbaAdapterError(invalidResponseError(provider))
  return root
}

function rowsFrom(root: Record<string, unknown>, keys: string[]): unknown[] | null {
  for (const key of keys) if (Array.isArray(root[key])) return root[key] as unknown[]
  return null
}

function gameScore(value: Record<string, unknown>, side: 'home' | 'away'): number | null {
  const sideObject = isRecord(value[side]) ? value[side] : null
  const scores = isRecord(value.score) ? value.score : null
  return readNonNegativeNumber(sideObject?.score ?? scores?.[side])
}

function gameTeam(value: Record<string, unknown>, side: 'home' | 'away') {
  const data = isRecord(value[side]) ? value[side] : null
  const id = data?.team_id ?? data?.id ?? value[`${side}_team_id`]
  const abbreviation =
    data?.abbreviation ??
    data?.abbr ??
    data?.short_name ??
    data?.name ??
    value[`${side}_team_abbreviation`]
  const name = data?.name ?? data?.display_name ?? data?.team_name ?? value[`${side}_team_name`]
  const team = createTeam(provider, id, abbreviation, name)
  // The provider's directory contains historical and non-NBA entities. Only
  // accept rows that map to one of the 30 canonical current NBA franchises.
  return team?.id.startsWith('nba:team:') ? team : null
}

function startTime(value: Record<string, unknown>) {
  return parseUtcTimestamp(value.kickoff_utc ?? value.starts_at ?? value.start_time)
}

function bbsSeasonEndYear(value: unknown): SeasonEndYear | null {
  const year =
    readNumber(value) ?? (typeof value === 'string' ? readNumber(value.slice(0, 4)) : null)
  if (year === null || !Number.isInteger(year)) return null
  const endYear = year + 1
  return endYear >= 1946 && endYear <= 2200 ? (endYear as SeasonEndYear) : null
}

function periodScores(value: unknown): readonly ScoreByPeriod[] | null {
  if (Array.isArray(value)) {
    const result = value.flatMap((entry, index) => {
      if (isRecord(entry)) {
        const period = readNumber(entry.period ?? entry.number) ?? index + 1
        if (!Number.isInteger(period) || period < 1) return []
        return [
          {
            period,
            home: readNonNegativeNumber(entry.home),
            away: readNonNegativeNumber(entry.away),
          },
        ]
      }
      return []
    })
    return result.length ? result.sort((a, b) => a.period - b.period) : null
  }
  if (!isRecord(value)) return null
  const home = Array.isArray(value.home) ? value.home : []
  const away = Array.isArray(value.away) ? value.away : []
  const count = Math.max(home.length, away.length)
  if (!count) return null
  return Array.from({ length: count }, (_, index) => ({
    period: index + 1,
    home: readNonNegativeNumber(home[index]),
    away: readNonNegativeNumber(away[index]),
  }))
}

export function normalizeBbsGame(value: unknown): Game | null {
  if (!isRecord(value)) return null
  const providerId = readIdentifier(value.id ?? value.match_id ?? value.match_uuid)
  const homeTeam = gameTeam(value, 'home')
  const awayTeam = gameTeam(value, 'away')
  const startsAt = startTime(value)
  const explicitDate = parseNbaGameDate(value.game_date ?? value.date)
  const utcDate = startsAt ? nbaGameDateFromUtc(startsAt) : null
  const nbaGameDate = explicitDate ?? utcDate
  if (explicitDate && utcDate && explicitDate !== utcDate) return null
  if (!providerId || !homeTeam || !awayTeam || !nbaGameDate) return null
  const homeScore = gameScore(value, 'home')
  const awayScore = gameScore(value, 'away')
  return {
    id: createGameId(provider, providerId),
    provider,
    providerId,
    seasonEndYear: bbsSeasonEndYear(value.season ?? value.season_year),
    nbaGameDate,
    startsAt,
    status: /finish|complete|final/i.test(
      `${String(value.status ?? '')} ${String(value.state ?? '')}`,
    )
      ? 'final'
      : normalizeGameStatus(value.status, value.state),
    homeTeam,
    awayTeam,
    score: { home: homeScore, away: awayScore },
    scoreByPeriod: periodScores(value.linescore ?? value.periods ?? value.period_scores),
    venue: readString(value.venue),
  }
}

export function normalizeBbsGames(
  payload: unknown,
  context: NormalizationContext,
): NbaSnapshot<readonly Game[]> {
  const root = rootOf(payload)
  const rows = Array.isArray(root.data)
    ? root.data
    : rowsFrom(root, ['matches', 'games', 'results'])
  if (!rows) throw new NbaAdapterError(invalidResponseError(provider))
  let rejectedRecords = 0
  const data: Game[] = []
  const seenIds = new Set<string>()
  for (const row of rows) {
    const game = normalizeBbsGame(row)
    if (!game || seenIds.has(game.id)) rejectedRecords += 1
    else {
      seenIds.add(game.id)
      data.push(game)
    }
  }
  return createSnapshot(provider, root, context, data, rejectedRecords)
}

function shootingLine(row: Record<string, unknown>, prefix: string): ShootingLine {
  const aliases: Record<string, { made: string[]; attempted: string[]; percentage: string[] }> = {
    fg: {
      made: ['fgm', 'fg_made', 'field_goals_made'],
      attempted: ['fga', 'fg_attempted', 'field_goals_attempted'],
      percentage: ['fg_pct', 'fg_percentage', 'field_goal_pct', 'field_goal_percentage'],
    },
    fg3: {
      made: ['fg3m', 'fg3_made', 'three_pointers_made'],
      attempted: ['fg3a', 'fg3_attempted', 'three_pointers_attempted'],
      percentage: ['fg3_pct', 'fg3_percentage', 'three_point_pct', 'three_point_percentage'],
    },
    ft: {
      made: ['ftm', 'ft_made', 'free_throws_made'],
      attempted: ['fta', 'ft_attempted', 'free_throws_attempted'],
      percentage: ['ft_pct', 'ft_percentage', 'free_throw_pct', 'free_throw_percentage'],
    },
  }
  const firstValue = (keys: string[]) =>
    keys.map((key) => row[key]).find((value) => value !== undefined)
  const fields = aliases[prefix]!
  const made = readNonNegativeNumber(firstValue(fields.made))
  const attempted = readNonNegativeNumber(firstValue(fields.attempted))
  const rawPct = readNonNegativeNumber(firstValue(fields.percentage))
  const percentage = rawPct === null ? null : rawPct > 1 ? rawPct / 100 : rawPct
  return { made, attempted, percentage }
}

function stats(row: Record<string, unknown>) {
  return {
    points: readNonNegativeNumber(row.pts ?? row.points),
    fieldGoals: shootingLine(row, 'fg'),
    threePointers: shootingLine(row, 'fg3'),
    freeThrows: shootingLine(row, 'ft'),
    rebounds: readNonNegativeNumber(row.reb ?? row.rebounds),
    offensiveRebounds: readNonNegativeNumber(
      row.oreb ?? row.offensive_rebounds ?? row.offensiveRebounds,
    ),
    defensiveRebounds: readNonNegativeNumber(
      row.dreb ?? row.defensive_rebounds ?? row.defensiveRebounds,
    ),
    assists: readNonNegativeNumber(row.ast ?? row.assists),
    steals: readNonNegativeNumber(row.stl ?? row.steals),
    blocks: readNonNegativeNumber(row.blk ?? row.blocks),
    turnovers: readNonNegativeNumber(row.tov ?? row.turnover ?? row.turnovers),
    fouls: readNonNegativeNumber(row.pf ?? row.fouls),
    plusMinus: readNumber(row.plus_minus ?? row.plusMinus),
  }
}

/** The unified list can provide team totals even when its archive game ID is a UUID alias. */
export function normalizeBbsInlineTeams(
  value: unknown,
  game: Game,
): [TeamBoxScore, TeamBoxScore] | null {
  if (
    !isRecord(value) ||
    !isRecord(value.archive_stats) ||
    game.status !== 'final' ||
    !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(game.providerId) ||
    readIdentifier(value.id) !== game.providerId ||
    readIdentifier(value.match_id) !== game.providerId ||
    readIdentifier(value.archive_game_id) !== game.providerId ||
    !isRecord(value.home) ||
    !isRecord(value.away)
  )
    return null

  const home = value.home
  const away = value.away
  const homeCode = readString(home.short_name)
  const awayCode = readString(away.short_name)
  if (
    !homeCode ||
    !awayCode ||
    readIdentifier(home.id) !== game.homeTeam.providerId ||
    readIdentifier(away.id) !== game.awayTeam.providerId
  )
    return null

  const archive = value.archive_stats
  const normalizeSide = (side: 'home' | 'away', matchup: string): TeamBoxScore | null => {
    const row = archive[side]
    if (!isRecord(row) || row.matchup !== matchup) return null
    const team = side === 'home' ? game.homeTeam : game.awayTeam
    const archiveTeamId = readIdentifier((side === 'home' ? home : away).archive_team_id)
    for (const value of [row.team_id, row.teamId]) {
      if (value == null) continue
      const reportedId = readIdentifier(value)
      if (!reportedId || (reportedId !== team.providerId && reportedId !== archiveTeamId))
        return null
    }
    const { fgm, fga, fg3m, fg3a, ftm, fta } = row
    if (
      typeof fgm !== 'number' ||
      typeof fga !== 'number' ||
      typeof fg3m !== 'number' ||
      typeof fg3a !== 'number' ||
      typeof ftm !== 'number' ||
      typeof fta !== 'number' ||
      ![fgm, fga, fg3m, fg3a, ftm, fta].every((n) => Number.isSafeInteger(n) && n >= 0) ||
      fg3m > fgm ||
      fgm > fga ||
      fg3m > fg3a ||
      fg3a > fga ||
      ftm > fta ||
      fgm - fg3m > fga - fg3a
    )
      return null
    const points = 2 * fgm + fg3m + ftm
    if (
      !Number.isSafeInteger(points) ||
      points !== game.score[side] ||
      [row.pts, row.points].some(
        (score) => score != null && readNonNegativeNumber(score) !== points,
      )
    )
      return null
    return { team, ...stats({ ...row, pts: points }) }
  }

  const homeBox = normalizeSide('home', homeCode + ' vs. ' + awayCode)
  const awayBox = normalizeSide('away', awayCode + ' @ ' + homeCode)
  return homeBox && awayBox ? [homeBox, awayBox] : null
}

function teamBox(
  row: unknown,
  game: Game,
  side: 'home' | 'away',
  archiveTeamId: string,
): TeamBoxScore | null {
  if (!isRecord(row)) return null
  const team = side === 'home' ? game.homeTeam : game.awayTeam
  const reportedId = row.team_id ?? row.teamId ?? (isRecord(row.team) ? row.team.id : null)
  if (reportedId === null || String(reportedId) !== archiveTeamId) return null
  return { team, ...stats(row) }
}

function playerRows(root: Record<string, unknown>, side: 'home' | 'away'): unknown[] | null {
  const rows = root[side]
  return Array.isArray(rows) ? rows : null
}

function playerBox(
  row: unknown,
  game: Game,
  side: 'home' | 'away',
  availability: Record<string, unknown> | null,
  archiveTeamId: string,
): PlayerBoxScore | null {
  if (!isRecord(row)) return null
  const team = side === 'home' ? game.homeTeam : game.awayTeam
  const player = createPlayer(
    provider,
    row.player_id ?? row.playerId ?? row.id,
    row.player_name ?? row.name,
    team.id,
  )
  if (!player) return null
  const rawMinutes = row.minutes ?? row.min_played ?? row.min ?? availability?.minutes_played
  const secondsPlayed = readNonNegativeNumber(row.seconds_played ?? availability?.seconds_played)
  const minutes =
    secondsPlayed !== null
      ? `${Math.floor(secondsPlayed / 60)}:${String(Math.floor(secondsPlayed % 60)).padStart(2, '0')}`
      : typeof rawMinutes === 'number' && Number.isFinite(rawMinutes)
        ? String(rawMinutes)
        : readString(rawMinutes)
  const explicitlyDidNotPlay =
    row.dnp === true || row.did_not_play === true || availability?.played === false
  const explicitlyPlayed =
    availability?.played === true ||
    row.dnp === false ||
    row.did_not_play === false ||
    (typeof rawMinutes === 'number' && rawMinutes > 0) ||
    (typeof rawMinutes === 'string' && /[1-9]/.test(rawMinutes))
  if (
    (row.team_id !== undefined &&
      String(row.team_id) !== String(team.providerId) &&
      String(row.team_id) !== archiveTeamId) ||
    (row.teamId !== undefined &&
      String(row.teamId) !== String(team.providerId) &&
      String(row.teamId) !== archiveTeamId)
  )
    return null
  return {
    player,
    starter:
      typeof row.starter === 'boolean'
        ? row.starter
        : typeof availability?.starter === 'boolean'
          ? availability.starter
          : null,
    didNotPlay: explicitlyDidNotPlay ? true : explicitlyPlayed ? false : null,
    minutes,
    ...stats(row),
  }
}

function ensureIdentity(
  root: Record<string, unknown>,
  game: Game,
  archiveGameId: string | null,
  requireIdentity = true,
) {
  const expectedIds = new Set([game.providerId, archiveGameId])
  const identityValues = [
    root.id,
    root.match_id,
    root.match_uuid,
    root.archive_game_id,
    root.game_id,
  ].filter((value) => value !== undefined && value !== null)
  const identityIds = identityValues.map(readIdentifier)
  const rawDate = root.game_date ?? root.date
  const date = rawDate === undefined || rawDate === null ? null : parseNbaGameDate(rawDate)
  // These endpoints are addressed with different IDs. BBS may include either
  // or both IDs in its response envelope, so validate every reported value
  // against the list snapshot's exact UUID/archive-ID crosswalk.
  return (
    identityIds.every((reportedId) => reportedId !== null && expectedIds.has(reportedId)) &&
    (!requireIdentity || identityIds.length > 0) &&
    (rawDate === undefined || rawDate === null || (date !== null && date === game.nbaGameDate))
  )
}

export function normalizeBbsGameBox(
  teamPayload: unknown,
  playerPayload: unknown,
  availabilityPayload: unknown | null,
  game: Game,
  archiveGameId: string | null,
  archiveTeamIds: { home: string; away: string },
  inlineTeams?: readonly [TeamBoxScore, TeamBoxScore],
): GameBoxScore {
  const teamRoot = inlineTeams ? null : rootOf(teamPayload)
  const playerRoot = rootOf(playerPayload)
  let availabilityRoot: Record<string, unknown> | null = null
  if (availabilityPayload !== null) {
    try {
      const optionalAvailability = rootOf(availabilityPayload)
      if (
        ensureIdentity(optionalAvailability, game, archiveGameId) &&
        Array.isArray(optionalAvailability.home) &&
        Array.isArray(optionalAvailability.away)
      )
        availabilityRoot = optionalAvailability
    } catch {
      // Optional participation enrichment must never invalidate core box-score data.
    }
  }
  if (
    (teamRoot !== null && !ensureIdentity(teamRoot, game, archiveGameId)) ||
    // BBS's player /box envelope has only home/away arrays. The caller binds
    // this payload to game.providerId in the request path before normalizing.
    !ensureIdentity(playerRoot, game, archiveGameId, false)
  ) {
    throw new NbaAdapterError(invalidResponseError(provider))
  }
  const teams = inlineTeams ?? [
    teamBox(teamRoot?.home ?? teamRoot?.home_team, game, 'home', archiveTeamIds.home),
    teamBox(teamRoot?.away ?? teamRoot?.away_team, game, 'away', archiveTeamIds.away),
  ]
  const homePlayers = playerRows(playerRoot, 'home')
  const awayPlayers = playerRows(playerRoot, 'away')
  const homeAvailability = availabilityRoot ? playerRows(availabilityRoot, 'home') : []
  const awayAvailability = availabilityRoot ? playerRows(availabilityRoot, 'away') : []
  if (
    !teams[0] ||
    !teams[1] ||
    !homePlayers ||
    !awayPlayers ||
    !homeAvailability ||
    !awayAvailability
  ) {
    throw new NbaAdapterError(invalidResponseError(provider))
  }
  if (
    game.score.home === null ||
    game.score.away === null ||
    teams[0].team.id !== game.homeTeam.id ||
    teams[0].team.providerId !== game.homeTeam.providerId ||
    teams[1].team.id !== game.awayTeam.id ||
    teams[1].team.providerId !== game.awayTeam.providerId ||
    teams[0].points === null ||
    teams[1].points === null ||
    game.score.home !== teams[0].points ||
    game.score.away !== teams[1].points
  )
    throw new NbaAdapterError(invalidResponseError(provider))
  const seen = new Set<string>()
  const players: (PlayerBoxScore | null)[] = []
  for (const [side, statsRows, availabilityRows] of [
    ['home', homePlayers, homeAvailability],
    ['away', awayPlayers, awayAvailability],
  ] as const) {
    const availabilityById = new Map<string, Record<string, unknown>>()
    for (const row of availabilityRows) {
      if (!isRecord(row)) continue
      const id = readIdentifier(row.player_id ?? row.playerId ?? row.id)
      if (id) availabilityById.set(id, row)
    }
    for (const row of statsRows) {
      const id = isRecord(row) ? readIdentifier(row.player_id ?? row.playerId ?? row.id) : null
      players.push(
        playerBox(
          row,
          game,
          side,
          id ? (availabilityById.get(id) ?? null) : null,
          archiveTeamIds[side],
        ),
      )
    }
    for (const row of availabilityRows) {
      if (!isRecord(row) || row.played !== false) continue
      const id = readIdentifier(row.player_id ?? row.playerId ?? row.id)
      if (
        !id ||
        statsRows.some(
          (statRow) =>
            isRecord(statRow) &&
            readIdentifier(statRow.player_id ?? statRow.playerId ?? statRow.id) === id,
        )
      )
        continue
      players.push(playerBox({ ...row, dnp: true }, game, side, row, archiveTeamIds[side]))
    }
  }
  const playerTotals = { home: 0, away: 0 }
  for (const player of players) {
    if (!player || seen.has(player.player.id))
      throw new NbaAdapterError(invalidResponseError(provider))
    seen.add(player.player.id)
    if (player.didNotPlay !== true) {
      if (player.points === null) throw new NbaAdapterError(invalidResponseError(provider))
      const side = player.player.teamId === game.homeTeam.id ? 'home' : 'away'
      playerTotals[side] += player.points
    }
  }
  if (
    playerTotals.home !== teams[0].points ||
    playerTotals.away !== teams[1].points ||
    !teams[0].team.providerId ||
    !teams[1].team.providerId
  ) {
    throw new NbaAdapterError(invalidResponseError(provider))
  }
  return {
    game,
    teams: [teams[0], teams[1]],
    players: players as PlayerBoxScore[],
  }
}

export const bbsAdapter: NbaProviderAdapter = {
  provider,
  capabilities: { games: { normalize: normalizeBbsGames } },
}
