import type {
  Game,
  NbaApiError,
  NbaApiErrorCode,
  NbaProviderId,
  SeasonEndYear,
  TeamSeasonProfile,
} from '@/entities/nba/model'
import { NBA_TEAMS, findNbaTeam } from '@/entities/nba/teamCatalog'
import type {
  GamesResponse,
  GameDetailsResponse,
  NbaApiErrorResponse,
  NbaApiSnapshot,
  NbaRevalidationResponse,
  NbaRevalidationTarget,
  StandingsResponse,
  TeamsResponse,
  TeamSeasonResponse,
} from '@/shared/api/nba/contracts'
import { createNbaApiError } from '@/server/nba/adapters/errors'
import { parseNbaGameDate, parseSeasonEndYear } from '@/server/nba/adapters/normalizers/primitives'
import { isGameBoxScoreForGame, isGameRecord } from '@/shared/api/nba/gameDetailsGuards'
import { D1NbaRepository } from '@/server/nba/runtime/d1Repository'
import {
  gameDetailsCacheKey,
  gamesCacheKey,
  scheduleCacheKey,
  standingsCacheKey,
  teamSeasonCacheKey,
} from '@/server/nba/runtime/cacheKeys'
import {
  refreshNbaResource,
  runScheduledRefresh,
  getProviderForTarget,
  nbaSeasonEndYearForDate,
} from '@/server/nba/runtime/refresh'
import type {
  GamesCacheRecord,
  NbaCacheRecord,
  NbaRefreshTarget,
  NbaRepository,
  TeamSeasonCacheRecord,
  WorkerDependencies,
  WorkerEnvironment,
  WorkerExecutionContext,
  ScheduledController,
} from '@/server/nba/runtime/types'
import {
  findCachedGame,
  parseBoxScoreTarget,
  parseSourceGameId,
  refreshGameBoxScore,
} from '@/server/nba/runtime/gameDetails'
import { parseBbsBoxTarget, refreshBbsGameBoxScore } from '@/server/nba/runtime/bbsRefresh'
import { getDefaultNbaGameDate } from '@/shared/utils/nbaDate'
import { readPlayerSnapshot } from '@/server/nba/runtime/playerSnapshots'
import { bbsPlayerId, playerSeason } from '@/entities/nba/players'

const PRIVATE_HEADERS = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
}

function suppressLiveStatus(games: readonly Game[]): readonly Game[] {
  return games.map((game) =>
    game.status === 'live' ? { ...game, status: 'unknown' as const } : game,
  )
}

function createError(
  code: NbaApiErrorCode,
  provider: NbaProviderId | null = null,
  retryable = false,
): NbaApiError {
  return createNbaApiError(code, provider, retryable)
}

function jsonResponse<T>(body: T, status = 200, extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(PRIVATE_HEADERS)
  headers.set('content-type', 'application/json; charset=utf-8')
  new Headers(extraHeaders).forEach((value, key) => headers.set(key, value))
  return new Response(JSON.stringify(body), { status, headers })
}

function errorResponse(
  error: NbaApiError,
  requestId: string,
  status: number,
  retryAfterSeconds?: number,
): Response {
  const body: NbaApiErrorResponse = { error, requestId }
  const headers: Record<string, string> = {}
  if (retryAfterSeconds !== undefined) headers['retry-after'] = String(retryAfterSeconds)
  return jsonResponse(body, status, headers)
}

function responseStatusForError(error: NbaApiError): number {
  switch (error.code) {
    case 'unauthorized':
    case 'authentication':
      return 401
    case 'invalid_request':
      return 400
    case 'not_found':
      return 404
    case 'cache_miss':
      return 503
    case 'quota_exceeded':
    case 'rate_limited':
      return 429
    case 'refresh_in_progress':
      return 409
    case 'not_configured':
    case 'storage_unavailable':
    case 'timeout':
    case 'upstream_unavailable':
    case 'invalid_response':
      return 503
    case 'forbidden':
      return 403
    case 'unknown':
      return 500
  }
}

function apiSnapshot<T>(
  record: NbaCacheRecord,
  data: T,
  now: number,
  refreshError: NbaApiError | null = record.refreshError,
): NbaApiSnapshot<T> {
  return {
    data,
    meta: {
      source: record.provider,
      fetchedAt: record.fetchedAt,
      providerUpdatedAt: record.providerUpdatedAt,
      isStale: now >= record.expiresAt,
      rejectedRecords: record.rejectedRecords,
      refreshError,
    },
  }
}

async function usableCache(
  repository: NbaRepository,
  cacheKey: string,
  now: number,
): Promise<NbaCacheRecord | null> {
  const record = await repository.getCache(cacheKey)
  if (!record) return null
  if (now >= record.staleUntil) {
    await repository.deleteCache(cacheKey)
    return null
  }
  return record
}

async function getGames(
  url: URL,
  env: WorkerEnvironment,
  repository: NbaRepository,
  now: number,
  requestId: string,
): Promise<Response> {
  const date = parseNbaGameDate(url.searchParams.get('date'))
  if (!date || !nbaSeasonEndYearForDate(date)) {
    return errorResponse(createError('invalid_request'), requestId, 400)
  }

  const target: NbaRefreshTarget = { type: 'games', date }
  const provider = getProviderForTarget(target, env)
  if (!provider) return errorResponse(createError('not_configured'), requestId, 503)

  const exact = await usableCache(repository, gamesCacheKey(provider, date), now)
  if (exact?.capability === 'games' && now < exact.expiresAt) {
    return gamesResponse(exact, suppressLiveStatus(exact.data), now)
  }

  const schedule = await usableCache(repository, scheduleCacheKey(provider), now)
  const exactGames: GamesCacheRecord | null = exact?.capability === 'games' ? exact : null
  const scheduleSnapshot: GamesCacheRecord | null =
    schedule?.capability === 'schedule' &&
    schedule.coverage.from <= date &&
    date <= schedule.coverage.through
      ? schedule
      : null
  const scheduledGames = scheduleSnapshot
    ? scheduleSnapshot.data.filter((game) => game.nbaGameDate === date)
    : []
  if (!exactGames && scheduledGames.length === 0) {
    const error = createError('cache_miss', provider, true)
    return errorResponse(error, requestId, 503)
  }

  const merged = new Map<string, (typeof scheduledGames)[number]>()
  for (const game of suppressLiveStatus(scheduledGames)) merged.set(game.id, game)
  for (const game of suppressLiveStatus(exactGames?.data ?? [])) merged.set(game.id, game)
  const sourceRecords = [exactGames, scheduleSnapshot].filter(
    (record): record is GamesCacheRecord => record !== null,
  )
  const newest = sourceRecords.reduce((current, record) =>
    record.fetchedAt > current.fetchedAt ? record : current,
  )
  const refreshError = sourceRecords.find((record) => record.refreshError)?.refreshError ?? null
  const data = [...merged.values()]
  const response: GamesResponse = {
    data,
    meta: {
      source: provider,
      fetchedAt: newest.fetchedAt,
      providerUpdatedAt: newest.providerUpdatedAt,
      isStale: sourceRecords.some((record) => now >= record.expiresAt),
      rejectedRecords: sourceRecords.reduce((total, record) => total + record.rejectedRecords, 0),
      refreshError,
    },
  }
  return jsonResponse(
    response,
    200,
    response.meta.isStale ? { warning: '110 - "Response is stale"' } : {},
  )
}

function gamesResponse(
  record: GamesCacheRecord,
  data: GamesResponse['data'],
  now: number,
): Response {
  const response = apiSnapshot(record, data, now) satisfies GamesResponse
  return jsonResponse(
    response,
    200,
    response.meta.isStale ? { warning: '110 - "Response is stale"' } : {},
  )
}

async function getStandings(
  url: URL,
  env: WorkerEnvironment,
  repository: NbaRepository,
  now: number,
  requestId: string,
): Promise<Response> {
  const rawYear = url.searchParams.get('seasonEndYear')
  const seasonEndYear = parseSeasonEndYear(rawYear)
  if (!seasonEndYear || String(seasonEndYear) !== rawYear) {
    return errorResponse(createError('invalid_request'), requestId, 400)
  }

  const target: NbaRefreshTarget = { type: 'standings', seasonEndYear }
  const provider = getProviderForTarget(target, env)
  if (!provider) return errorResponse(createError('not_configured'), requestId, 503)
  const record = await usableCache(repository, standingsCacheKey(provider, seasonEndYear), now)
  if (!record || record.capability !== 'standings') {
    return errorResponse(createError('cache_miss', provider, true), requestId, 503)
  }
  const response: StandingsResponse = apiSnapshot(record, record.data, now)
  return jsonResponse(
    response,
    200,
    response.meta.isStale ? { warning: '110 - "Response is stale"' } : {},
  )
}

function readTeamSeasonEndYear(url: URL): SeasonEndYear | null {
  const rawYear = url.searchParams.get('seasonEndYear')
  const seasonEndYear = parseSeasonEndYear(rawYear)
  return seasonEndYear && String(seasonEndYear) === rawYear ? seasonEndYear : null
}

async function getTeams(
  url: URL,
  repository: NbaRepository,
  now: number,
  requestId: string,
): Promise<Response> {
  const seasonEndYear = readTeamSeasonEndYear(url)
  if (!seasonEndYear) return errorResponse(createError('invalid_request'), requestId, 400)

  const cacheRows = await Promise.all(
    NBA_TEAMS.map(async (reference) => {
      const record = await usableCache(
        repository,
        teamSeasonCacheKey('bbs', reference.team.id, seasonEndYear),
        now,
      )
      return record?.capability === 'teamSeason' && record.data.team.id === reference.team.id
        ? record
        : null
    }),
  )
  const records = cacheRows.filter((record): record is TeamSeasonCacheRecord => record !== null)
  const data: TeamsResponse['data'] = NBA_TEAMS.map((reference, index) => {
    const record = cacheRows[index]
    const profile = record?.data
    return {
      ...reference,
      season: profile
        ? {
            wins: profile.wins,
            losses: profile.losses,
            winPercentage: profile.winPercentage,
            overallRank: profile.overallRank,
            gamesBack: profile.gamesBack,
            stats: profile.stats,
            isStale: now >= record.expiresAt,
          }
        : null,
    }
  })
  const latest = records.reduce<TeamSeasonCacheRecord | null>(
    (current, record) => (!current || record.fetchedAt > current.fetchedAt ? record : current),
    null,
  )
  const response: TeamsResponse = {
    data,
    coverage: { available: records.length, total: NBA_TEAMS.length },
    meta: latest
      ? {
          source: 'bbs',
          fetchedAt: latest.fetchedAt,
          providerUpdatedAt: latest.providerUpdatedAt,
          isStale: records.some((record) => now >= record.expiresAt),
          rejectedRecords: records.reduce((count, record) => count + record.rejectedRecords, 0),
          refreshError: records.find((record) => record.refreshError)?.refreshError ?? null,
        }
      : null,
  }
  return jsonResponse(response, 200)
}

function recentGameMatchesCache(
  profile: TeamSeasonProfile,
  row: NonNullable<TeamSeasonProfile['lastTen']>[number],
  record: GamesCacheRecord,
): boolean {
  return record.data.some((game) => {
    if (
      game.provider !== 'bbs' ||
      game.id !== row.gameId ||
      game.nbaGameDate !== row.nbaGameDate ||
      game.status !== 'final'
    )
      return false
    const isHome = game.homeTeam.id === profile.team.id
    const isAway = game.awayTeam.id === profile.team.id
    if (!isHome && !isAway) return false
    const teamPoints = isHome ? game.score.home : game.score.away
    const opponentPoints = isHome ? game.score.away : game.score.home
    const opponentCode = isHome ? game.awayTeam.abbreviation : game.homeTeam.abbreviation
    return (
      teamPoints === row.pointsFor &&
      opponentPoints === row.pointsAgainst &&
      opponentCode === row.opponentCode &&
      (isHome ? 'home' : 'away') === row.venue
    )
  })
}

async function findUpcomingTeamGame(
  profile: TeamSeasonProfile,
  repository: NbaRepository,
  now: number,
): Promise<TeamSeasonProfile['nextGame']> {
  const next = profile.nextGame
  if (!next?.gameId) return null

  const today = getDefaultNbaGameDate(new Date(now))
  const firstDay = Date.parse(`${today}T00:00:00Z`)
  const kickoff = next.startsAt === null ? null : Date.parse(next.startsAt)
  if (kickoff !== null && (!Number.isFinite(kickoff) || kickoff <= now)) return null
  const kickoffDate = kickoff === null ? null : getDefaultNbaGameDate(new Date(kickoff))
  const dates = Array.from({ length: 8 }, (_, offset) =>
    parseNbaGameDate(new Date(firstDay + offset * 86_400_000).toISOString().slice(0, 10)),
  )
    .filter((date) => date !== null)
    .filter((date) => !kickoffDate || date === kickoffDate)

  const matches = await Promise.all(
    dates.map(async (date) => {
      if (nbaSeasonEndYearForDate(date) !== profile.seasonEndYear) return null
      const record = await repository.getCache(gamesCacheKey('bbs', date))
      if (
        record?.capability !== 'games' ||
        record.provider !== 'bbs' ||
        now >= record.expiresAt ||
        now >= record.staleUntil
      )
        return null
      for (const game of record.data) {
        const starts = game.startsAt === null ? NaN : Date.parse(game.startsAt)
        if (
          game.provider !== 'bbs' ||
          game.id !== next.gameId ||
          game.nbaGameDate !== date ||
          game.seasonEndYear !== profile.seasonEndYear ||
          game.status !== 'scheduled' ||
          !Number.isFinite(starts) ||
          starts <= now ||
          getDefaultNbaGameDate(new Date(starts)) !== date
        )
          continue
        const isHome = game.homeTeam.id === profile.team.id
        const isAway = game.awayTeam.id === profile.team.id
        if (isHome === isAway || (next.isHome !== null && next.isHome !== isHome)) continue
        const opponent = isHome ? game.awayTeam : game.homeTeam
        const opponentCode = opponent.abbreviation
        if (
          !opponentCode ||
          findNbaTeam(opponentCode)?.team.id !== opponent.id ||
          (next.opponentCode !== null && next.opponentCode !== opponentCode)
        )
          continue
        return { gameId: game.id, nbaGameDate: date, startsAt: game.startsAt, isHome, opponentCode }
      }
      return null
    }),
  )
  const confirmed = matches.filter((match) => match !== null)
  if (confirmed.length !== 1) return null
  return confirmed[0] ?? null
}

async function getTeamSeason(
  url: URL,
  rawTeamCode: string,
  repository: NbaRepository,
  now: number,
  requestId: string,
): Promise<Response> {
  let teamCode: string
  try {
    teamCode = decodeURIComponent(rawTeamCode)
  } catch {
    return errorResponse(createError('invalid_request'), requestId, 400)
  }
  const reference = findNbaTeam(teamCode)
  const seasonEndYear = readTeamSeasonEndYear(url)
  if (!reference || !seasonEndYear)
    return errorResponse(createError('invalid_request'), requestId, 400)

  const cache = await usableCache(
    repository,
    teamSeasonCacheKey('bbs', reference.team.id, seasonEndYear),
    now,
  )
  if (cache?.capability !== 'teamSeason')
    return errorResponse(createError('cache_miss', 'bbs', true), requestId, 503)

  const cachedProfile = cache.data
  const [recentRecords, nextGame] = await Promise.all([
    Promise.all(
      [...new Set(cachedProfile.lastTen?.map((game) => game.nbaGameDate) ?? [])].map((date) =>
        usableCache(repository, gamesCacheKey('bbs', date), now),
      ),
    ),
    findUpcomingTeamGame(cachedProfile, repository, now),
  ])
  const gameRecords = recentRecords.filter(
    (record): record is GamesCacheRecord =>
      record !== null && (record.capability === 'games' || record.capability === 'schedule'),
  )
  const profile: TeamSeasonProfile = {
    ...cachedProfile,
    team: { ...reference.team, displayName: cachedProfile.team.displayName ?? reference.name },
    lastTen:
      cachedProfile.lastTen?.map((row) => ({
        ...row,
        gameId: gameRecords.some((record) => recentGameMatchesCache(cachedProfile, row, record))
          ? row.gameId
          : null,
      })) ?? null,
    nextGame,
  }
  const snapshot: TeamSeasonResponse = apiSnapshot(cache, profile, now)
  return jsonResponse(
    snapshot,
    200,
    snapshot.meta.isStale ? { warning: '110 - "Response is stale"' } : {},
  )
}

async function getGameDetails(
  url: URL,
  rawGameId: string,
  repository: NbaRepository,
  now: number,
  requestId: string,
): Promise<Response> {
  let gameId: string
  try {
    gameId = decodeURIComponent(rawGameId)
  } catch {
    return errorResponse(createError('invalid_request'), requestId, 400)
  }
  const source = parseSourceGameId(gameId)
  const date = parseNbaGameDate(url.searchParams.get('date'))
  if (!source || !date) return errorResponse(createError('invalid_request'), requestId, 400)

  const detailsRecord = await usableCache(
    repository,
    gameDetailsCacheKey(source.provider, source.id),
    now,
  )
  const boxRecord = detailsRecord?.capability === 'boxScore' ? detailsRecord : null
  const [exactRecord, scheduleRecord] = await Promise.all([
    repository.getCache(gamesCacheKey(source.provider, date)),
    repository.getCache(scheduleCacheKey(source.provider)),
  ])
  const exactGameRecord =
    exactRecord?.capability === 'games' && now < exactRecord.staleUntil ? exactRecord : null
  const scheduledGameRecord =
    scheduleRecord?.capability === 'schedule' &&
    now < scheduleRecord.staleUntil &&
    date >= scheduleRecord.coverage.from &&
    date <= scheduleRecord.coverage.through
      ? scheduleRecord
      : null
  const exactGame =
    exactGameRecord?.data.find((game) => game.id === source.id && game.nbaGameDate === date) ?? null
  const scheduledGame =
    scheduledGameRecord?.data.find((game) => game.id === source.id && game.nbaGameDate === date) ??
    null
  const gameRecord = exactGame ? exactGameRecord : scheduledGame ? scheduledGameRecord : null
  const cachedGame = exactGame ?? scheduledGame
  const storedBoxScore = boxRecord?.data
  const storedBoxGame =
    storedBoxScore && isGameRecord(storedBoxScore.game) ? storedBoxScore.game : null
  const baseGame = cachedGame ?? (storedBoxGame?.nbaGameDate === date ? storedBoxGame : null)
  if (!baseGame)
    return errorResponse(createError('cache_miss', source.provider, true), requestId, 503)

  const dataRecord = gameRecord ?? boxRecord
  if (!dataRecord)
    return errorResponse(createError('cache_miss', source.provider, true), requestId, 503)

  const boxScoreIsCompatible = Boolean(
    storedBoxScore && isGameBoxScoreForGame(storedBoxScore, baseGame),
  )
  const boxScoreAvailability = boxScoreIsCompatible
    ? 'available'
    : storedBoxScore
      ? 'snapshot_mismatch'
      : 'unavailable'
  const fetchedAt = dataRecord.fetchedAt
  const providerUpdatedAt = dataRecord.providerUpdatedAt
  const response: GameDetailsResponse = {
    data: { game: baseGame, boxScore: boxScoreIsCompatible ? (storedBoxScore ?? null) : null },
    boxScoreAvailability,
    meta: {
      source: dataRecord.provider,
      fetchedAt,
      providerUpdatedAt,
      isStale: now >= dataRecord.expiresAt,
      rejectedRecords: dataRecord.rejectedRecords,
      refreshError: dataRecord.refreshError,
    },
    boxScoreMeta:
      boxRecord && boxScoreAvailability !== 'snapshot_mismatch'
        ? {
            source: boxRecord.provider,
            fetchedAt: boxRecord.fetchedAt,
            providerUpdatedAt: boxRecord.providerUpdatedAt,
            isStale: now >= boxRecord.expiresAt,
            rejectedRecords: boxRecord.rejectedRecords,
            refreshError: boxRecord.refreshError,
          }
        : null,
  }
  return jsonResponse(
    response,
    200,
    response.meta.isStale ? { warning: '110 - "Response is stale"' } : {},
  )
}

async function readBoxScoreRefreshDate(request: Request, gameId: string) {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (
    contentLength > 2_048 ||
    !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')
  )
    return null
  try {
    const body: unknown = await request.json()
    const target =
      body && typeof body === 'object' && !Array.isArray(body)
        ? { ...(body as Record<string, unknown>), type: 'boxScore', gameId }
        : null
    return parseBoxScoreTarget(target) ?? parseBbsBoxTarget(target)
  } catch {
    return null
  }
}

async function postGameDetailsRefresh(
  request: Request,
  rawGameId: string,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
  requestId: string,
): Promise<Response> {
  const expectedToken = env.MANUAL_REFRESH_TOKEN
  const authorization = request.headers.get('authorization') ?? ''
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!expectedToken) return errorResponse(createError('not_configured'), requestId, 503)
  if (!bearer || !constantTimeEqual(bearer, expectedToken))
    return errorResponse(createError('unauthorized'), requestId, 401)

  let gameId: string
  try {
    gameId = decodeURIComponent(rawGameId)
  } catch {
    return errorResponse(createError('invalid_request'), requestId, 400)
  }
  const target = await readBoxScoreRefreshDate(request, gameId)
  if (!target || target.gameId !== gameId)
    return errorResponse(createError('invalid_request'), requestId, 400)
  const game = await findCachedGame(repository, target.date, target.gameId, now)
  if (!game) {
    return errorResponse(
      createError('cache_miss', parseSourceGameId(target.gameId)?.provider ?? null, true),
      requestId,
      503,
    )
  }

  const result =
    game.provider === 'bbs'
      ? await refreshBbsGameBoxScore(
          target as { type: 'boxScore'; date: typeof target.date; gameId: typeof target.gameId },
          game,
          env,
          repository,
          fetcher,
          now,
        )
      : await refreshGameBoxScore(target, game, env, repository, fetcher, now)
  const body = { ...result }
  const status = result.error
    ? responseStatusForError(result.error)
    : result.state === 'in_progress'
      ? 409
      : 200
  return jsonResponse(
    body,
    status,
    result.retryAfter
      ? {
          'retry-after': String(
            Math.max(1, Math.ceil((Date.parse(result.retryAfter) - now) / 1000)),
          ),
        }
      : {},
  )
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

async function readRefreshTarget(request: Request): Promise<NbaRefreshTarget | null> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 2_048) return null
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    return null
  try {
    const rawBody = await request.text()
    if (rawBody.length > 2_048) return null
    const payload: unknown = JSON.parse(rawBody)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
    const resource = (payload as Record<string, unknown>).resource
    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) return null
    const target = resource as Record<string, unknown>
    if (target.type === 'games') {
      const date = parseNbaGameDate(target.date)
      return date && nbaSeasonEndYearForDate(date) ? { type: 'games', date } : null
    }
    if (target.type === 'standings') {
      const seasonEndYear = parseSeasonEndYear(target.seasonEndYear)
      return seasonEndYear ? { type: 'standings', seasonEndYear } : null
    }
    if (target.type === 'teamSeason') {
      const seasonEndYear = parseSeasonEndYear(target.seasonEndYear)
      const reference = typeof target.teamCode === 'string' ? findNbaTeam(target.teamCode) : null
      return seasonEndYear && reference
        ? { type: 'teamSeason', teamCode: reference.code, seasonEndYear }
        : null
    }
    if (target.type === 'teamDirectory') {
      const seasonEndYear = parseSeasonEndYear(target.seasonEndYear)
      return seasonEndYear ? { type: 'teamDirectory', seasonEndYear } : null
    }
    if (target.type === 'schedule') return { type: 'schedule' }
  } catch {
    return null
  }
  return null
}

function refreshResponseTarget(target: NbaRefreshTarget): NbaRevalidationTarget {
  if (target.type === 'games') return { type: 'games', date: target.date }
  if (target.type === 'standings') return target
  if (target.type === 'teamSeason') return target
  if (target.type === 'teamDirectory') return target
  return target
}

async function postRevalidate(
  request: Request,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
  requestId: string,
): Promise<Response> {
  const expectedToken = env.MANUAL_REFRESH_TOKEN
  if (!expectedToken) {
    return errorResponse(createError('not_configured'), requestId, 503)
  }
  const authorization = request.headers.get('authorization') ?? ''
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!bearer || !constantTimeEqual(bearer, expectedToken)) {
    return errorResponse(createError('unauthorized'), requestId, 401)
  }

  const target = await readRefreshTarget(request)
  if (!target) return errorResponse(createError('invalid_request'), requestId, 400)
  if (target.type !== 'teamSeason' && target.type !== 'teamDirectory') {
    const allowed = await repository.consumeRateSlot('manual:revalidate', now, 5 * 60_000, 1)
    if (!allowed) {
      const retryAfter = Math.ceil((5 * 60_000 - (now % (5 * 60_000))) / 1000)
      return errorResponse(createError('rate_limited'), requestId, 429, retryAfter)
    }
  }

  const result = await refreshNbaResource(target, env, repository, fetcher, now)
  const body: NbaRevalidationResponse = {
    target: refreshResponseTarget(target),
    state: result.state,
    isStale: result.isStale,
    fetchedAt: result.fetchedAt,
    retryAfter: result.retryAfter,
    error: result.error,
  }
  const status = result.error
    ? responseStatusForError(result.error)
    : result.state === 'in_progress'
      ? 409
      : 200
  return jsonResponse(
    body,
    status,
    result.retryAfter
      ? {
          'retry-after': String(
            Math.max(1, Math.ceil((Date.parse(result.retryAfter) - now) / 1000)),
          ),
        }
      : {},
  )
}

async function handleApiRequest(
  request: Request,
  env: WorkerEnvironment,
  repository: NbaRepository,
  fetcher: typeof fetch,
  now: number,
  requestId: string,
): Promise<Response> {
  const url = new URL(request.url)
  const playerRoute = /^\/api\/players(?:\/([^/]+))?$/.exec(url.pathname)
  if (playerRoute) {
    if (request.method !== 'GET')
      return errorResponse(createError('invalid_request'), requestId, 405)
    if (env.BBS_PLAYERS_ENABLED !== 'true' || !env.NBA_DB)
      return errorResponse(createError('not_configured', 'bbs'), requestId, 503)
    let playerId: string | undefined
    try {
      playerId = playerRoute[1] ? decodeURIComponent(playerRoute[1]) : undefined
    } catch {
      return errorResponse(createError('invalid_request'), requestId, 400)
    }
    const season = url.searchParams.get('seasonEndYear') ?? String(playerSeason)
    if (season !== String(playerSeason) || (playerId && !bbsPlayerId.test(playerId)))
      return errorResponse(createError('invalid_request'), requestId, 400)
    const result = await readPlayerSnapshot(env.NBA_DB, repository, Number(season), now, playerId)
    if (result.status === 'ready')
      return jsonResponse(
        result.data,
        200,
        result.data.isStale ? { warning: '110 - "Response is stale"' } : {},
      )
    return errorResponse(
      createError(result.status, 'bbs'),
      requestId,
      result.status === 'not_found' ? 404 : 503,
    )
  }
  if (url.pathname === '/api/news') {
    if (request.method !== 'GET')
      return errorResponse(createError('invalid_request'), requestId, 405, 60)
    return errorResponse(createError('not_configured'), requestId, 503)
  }

  if (url.pathname === '/api/games') {
    if (request.method !== 'GET')
      return errorResponse(createError('invalid_request'), requestId, 405)
    return getGames(url, env, repository, now, requestId)
  }

  const detailsMatch = /^\/api\/games\/([^/]+)(?:\/(refresh))?$/.exec(url.pathname)
  if (detailsMatch) {
    if (detailsMatch[2] === 'refresh') {
      if (request.method !== 'POST')
        return errorResponse(createError('invalid_request'), requestId, 405)
      return postGameDetailsRefresh(
        request,
        detailsMatch[1]!,
        env,
        repository,
        fetcher,
        now,
        requestId,
      )
    }
    if (request.method !== 'GET')
      return errorResponse(createError('invalid_request'), requestId, 405)
    return getGameDetails(url, detailsMatch[1]!, repository, now, requestId)
  }

  if (url.pathname === '/api/standings') {
    if (request.method !== 'GET')
      return errorResponse(createError('invalid_request'), requestId, 405)
    return getStandings(url, env, repository, now, requestId)
  }

  if (url.pathname === '/api/teams') {
    if (request.method !== 'GET')
      return errorResponse(createError('invalid_request'), requestId, 405)
    return getTeams(url, repository, now, requestId)
  }

  const teamSeasonMatch = /^\/api\/teams\/([^/]+)$/.exec(url.pathname)
  if (teamSeasonMatch) {
    if (request.method !== 'GET')
      return errorResponse(createError('invalid_request'), requestId, 405)
    return getTeamSeason(url, teamSeasonMatch[1]!, repository, now, requestId)
  }

  if (url.pathname === '/api/revalidate') {
    if (request.method !== 'POST')
      return errorResponse(createError('invalid_request'), requestId, 405)
    return postRevalidate(request, env, repository, fetcher, now, requestId)
  }

  return errorResponse(createError('not_found'), requestId, 404)
}

export function createNbaWorker(dependencies: WorkerDependencies = {}) {
  const now = dependencies.now ?? Date.now
  const fetcher = dependencies.fetcher ?? fetch

  function getRepository(env: WorkerEnvironment): NbaRepository | null {
    if (dependencies.repository) return dependencies.repository
    return env.NBA_DB ? new D1NbaRepository(env.NBA_DB) : null
  }

  return {
    async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
      const url = new URL(request.url)
      if (!url.pathname.startsWith('/api/')) {
        return env.ASSETS?.fetch(request) ?? new Response('Not found', { status: 404 })
      }

      if (url.pathname === '/api/health') {
        if (request.method !== 'GET')
          return Response.json({ status: 'method_not_allowed' }, { status: 405 })
        if (!env.NBA_DB) return Response.json({ status: 'unavailable' }, { status: 503 })
        try {
          const result = await env.NBA_DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
          return result?.ok === 1
            ? Response.json({ status: 'ok' })
            : Response.json({ status: 'unavailable' }, { status: 503 })
        } catch {
          return Response.json({ status: 'unavailable' }, { status: 503 })
        }
      }

      const requestId = dependencies.requestId?.() ?? crypto.randomUUID()
      const repository = getRepository(env)
      if (!repository) {
        return errorResponse(createError('storage_unavailable'), requestId, 503)
      }

      try {
        return await handleApiRequest(request, env, repository, fetcher, now(), requestId)
      } catch {
        return errorResponse(createError('storage_unavailable', null, true), requestId, 503)
      }
    },

    async scheduled(
      controller: ScheduledController,
      env: WorkerEnvironment,
      context: WorkerExecutionContext,
    ): Promise<void> {
      const repository = getRepository(env)
      if (!repository) {
        console.error('Scheduled NBA refresh skipped: storage_unavailable')
        return
      }

      const scheduledAt = controller.scheduledTime || now()
      if (env.DUNKAPI_REFRESH_ENABLED !== 'true' && env.BBS_REFRESH_ENABLED !== 'true') {
        await repository.cleanupExpired(scheduledAt)
        console.info('Scheduled NBA refresh skipped: refresh_disabled')
        return
      }

      const task = runScheduledRefresh(env, repository, fetcher, scheduledAt)
        .then((results) => {
          for (const result of results) {
            if (result.error) {
              console.warn(
                `Scheduled NBA refresh deferred: ${result.target.type}:${result.error.code}`,
              )
            }
          }
        })
        .catch(() => {
          console.error('Scheduled NBA refresh failed: storage_unavailable')
        })
      context.waitUntil(task)
    },
  }
}

const worker = createNbaWorker()
export default worker
