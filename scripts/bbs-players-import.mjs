import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  bbsGameId,
  calendarDate,
  isPlayerDetail,
  isPlayerEntry,
  isPlayersResponse,
  isStoredPlayers,
  record,
  seasonDate,
  timestamp,
} from '../src/entities/nba/playerSnapshotGuards.ts'
import {
  boxPlayerLine,
  combinePlayerGames,
  verifiedPlayerBox,
} from '../src/server/nba/runtime/playerGames.ts'

const [source, database, seasonArg] = process.argv.slice(2)
const season = Number(seasonArg)
const endYear = season + 1
if (!source || !database || !/^20\d{2}$/.test(seasonArg ?? ''))
  throw new Error(
    'Usage: node --experimental-strip-types scripts/bbs-players-import.mjs SNAPSHOTS LOCAL_SQLITE 2026',
  )
statSync(database)
const db = new DatabaseSync(database)
db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE')
try {
  importSnapshot()
  db.exec('COMMIT')
} catch (error) {
  db.exec('ROLLBACK')
  throw error
} finally {
  db.close()
}

function importSnapshot() {
  const files = new Set(readdirSync(source))
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
  const numericFields = {
    pts: 'pts',
    reb: 'reb',
    ast: 'ast',
    fgm: 'fgm',
    fga: 'fga',
    threeM: 'fg3m',
    threeA: 'fg3a',
    ftm: 'ftm',
    fta: 'fta',
    stl: 'stl',
    blk: 'blk',
    oreb: 'oreb',
    dreb: 'dreb',
    tov: 'turnover',
    pf: 'pf',
  }
  let rejected = 0
  let ambiguous = 0
  function read(name) {
    const filename = name + '.json'
    if (!files.has(filename)) return null
    const path = join(source, filename)
    try {
      const json = JSON.parse(readFileSync(path, 'utf8'))
      if (record(json) && json.error == null)
        return { json, at: statSync(path).mtime.toISOString() }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
    }
    rejected++
    return null
  }
  const string = (value) =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, 130) : null
  const number = (value) => {
    if (value == null) return null
    if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '')
      return NaN
    const numeric = Number(value)
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : NaN
  }
  const percent = (value) => {
    const rate = number(value)
    return rate === null || rate <= 1 ? rate : NaN
  }
  const minutes = (value) => {
    const clock = typeof value === 'string' ? /^(\d+):([0-5]\d)$/.exec(value) : null
    const min = clock ? Number(clock[1]) + Number(clock[2]) / 60 : number(value)
    return min === null || min <= 80 ? min : NaN
  }
  const now = Date.now()
  const records = new Map()
  for (const { cache_key, record_json } of db
    .prepare(
      "SELECT cache_key,record_json FROM nba_cache WHERE provider='bbs' AND stale_until_ms>? AND capability IN ('teamDirectory','boxScore','games')",
    )
    .iterate(now)) {
    try {
      const row = JSON.parse(record_json)
      if (row.cacheKey === cache_key && row.provider === 'bbs') records.set(cache_key, row)
    } catch {
      rejected++
    }
  }
  const crosswalk = records.get('bbs:nba:team-directory:season=' + endYear)
  const teams = new Map(
    (Array.isArray(crosswalk?.data) ? crosswalk.data : []).flatMap((team) =>
      typeof team?.providerTeamId === 'string' &&
      uuid.test(team.providerTeamId) &&
      /^nba:team:[A-Z]{3}$/.test(team.teamId)
        ? [[team.providerTeamId, team.teamId.split(':').at(-1)]]
        : [],
    ),
  )
  if (teams.size !== 30 || new Set(teams.values()).size !== 30)
    throw new Error('Expected an available verified BBS team directory')
  const teamCodes = new Set(teams.values())
  const aliases = { GS: 'GSW', NO: 'NOP', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS', NY: 'NYK' }
  function code(value) {
    const name = string(value)?.toUpperCase()
    const result = aliases[name] ?? name
    return teamCodes.has(result) ? result : null
  }

  const previousRow = db
    .prepare('SELECT fetched_at,payload FROM nba_player_snapshot WHERE season_end_year=?')
    .get(endYear)
  let previous = null
  let legacyImport = false
  if (previousRow) {
    const payload = JSON.parse(previousRow.payload)
    if (isStoredPlayers(payload, endYear)) previous = payload
    else {
      const legacy = {
        ...payload,
        source: 'bbs',
        fetchedAt: previousRow.fetched_at,
        seasonEndYear: endYear,
        isStale: false,
      }
      if (
        payload.version !== undefined ||
        !isPlayersResponse(legacy) ||
        !record(payload.details) ||
        !Object.values(payload.details).every((value) => isPlayerDetail(value, endYear))
      )
        throw new Error(
          'Existing player snapshot is invalid; keep it intact and restore a known-good copy',
        )
      previous = {
        ...payload,
        directoryAt: previousRow.fetched_at,
        averageAt: Object.fromEntries(
          payload.players
            .filter((player) => player.stats)
            .map(({ id }) => [id, previousRow.fetched_at]),
        ),
        details: Object.fromEntries(
          Object.entries(payload.details).map(([id, detail]) => [
            id,
            {
              ...detail,
              games: detail.games
                .filter((row) => row.gameId === null)
                .map((row) => ({ ...row, matchId: null })),
            },
          ]),
        ),
      }
      legacyImport = true
    }
  }
  const first = read('directory-' + season + '-0')
  const providerRows = first?.json.pagination?.total
  if (!Number.isSafeInteger(providerRows) || providerRows < 1 || providerRows > 1500)
    throw new Error('Invalid directory denominator')
  let directoryAt = first.at
  const incoming = new Map()
  for (let offset = 0; offset < providerRows; offset += 200) {
    const loaded = offset === 0 ? first : read('directory-' + season + '-' + offset)
    const page = loaded?.json
    if (
      page?.pagination?.offset !== offset ||
      page.pagination.total !== providerRows ||
      !Array.isArray(page.data) ||
      page.data.length !== Math.min(200, providerRows - offset) ||
      page.meta?.filters_applied?.season !== season ||
      page.meta.filters_applied.league_scope?.mode !== 'requested_season'
    )
      throw new Error('Incomplete season directory')
    if (loaded.at < directoryAt) directoryAt = loaded.at
    for (const row of page.data) {
      if (
        !record(row) ||
        typeof row.id !== 'string' ||
        !uuid.test(row.id) ||
        !string(row.name) ||
        row.team?.league !== 'NBA' ||
        !uuid.test(row.team?.id ?? '') ||
        incoming.has('bbs:player:' + row.id)
      )
        throw new Error('Invalid or duplicate NBA player identity; directory not published')
      const id = 'bbs:player:' + row.id
      incoming.set(id, {
        id,
        name: string(row.name),
        team: teams.get(row.team.id) ?? null,
        position: string(row.position),
        number: string(row.jersey_number),
        height: string(row.height),
        weight: string(row.weight),
        stats: null,
      })
    }
  }
  const priorPlayers = new Map(previous?.players.map((item) => [item.id, item]))
  const keepDirectory = previous && Date.parse(previous.directoryAt) >= Date.parse(directoryAt)
  if (keepDirectory) directoryAt = previous.directoryAt
  const players = []
  const details = {}
  const gameRefs = {}
  const averageAt = {}
  for (const [id, directoryPlayer] of keepDirectory ? priorPlayers : incoming) {
    const prior = priorPlayers.get(id)
    const tail = season + '-' + id.slice('bbs:player:'.length)
    let stats = prior?.stats ?? null
    let avgAt = previous?.averageAt[id]
    const average = read('average-' + tail)
    if (
      average &&
      (!avgAt ||
        Date.parse(average.at) > Date.parse(avgAt) ||
        (legacyImport && average.at === avgAt))
    ) {
      const rows = average.json.data
      if (
        !Array.isArray(rows) ||
        rows.some(
          (row) =>
            !record(row) ||
            row.season !== season ||
            'bbs:player:' + row.player_id !== id ||
            !Number.isSafeInteger(number(row.games_played)),
        )
      )
        rejected++
      else if (rows.length > 1) ambiguous++
      else if (rows.length === 0) {
        if (stats === null) avgAt = average.at
      } else {
        const row = rows[0]
        const gp = number(row.games_played)
        const candidate = {
          gp,
          min: gp ? minutes(row.min) : null,
          ...Object.fromEntries(
            Object.entries(numericFields).map(([key, alias]) => [
              key,
              gp ? number(row[alias]) : null,
            ]),
          ),
          fg: gp ? percent(row.fg_pct) : null,
          three: gp ? percent(row.fg3_pct) : null,
          ft: gp ? percent(row.ft_pct) : null,
        }
        if (isPlayerEntry({ ...directoryPlayer, stats: candidate })) {
          stats = candidate
          avgAt = average.at
        } else rejected++
      }
    }
    players.push({ ...directoryPlayer, stats })
    if (avgAt) averageAt[id] = avgAt
    const detail = previous?.details[id] ?? {
      birthDate: null,
      currentTeam: null,
      profileAt: null,
      logAt: null,
      games: [],
    }
    const profileFile = read('profile-' + tail)
    if (
      profileFile &&
      (!detail.profileAt || Date.parse(profileFile.at) > Date.parse(detail.profileAt))
    ) {
      const profile = profileFile.json.data?.player
      if (
        record(profile) &&
        'bbs:player:' + profile.id === id &&
        profile.league === 'NBA' &&
        (profile.date_of_birth == null || calendarDate(profile.date_of_birth)) &&
        (profile.current_team == null ||
          (record(profile.current_team) && uuid.test(profile.current_team.id)))
      ) {
        detail.birthDate = profile.date_of_birth ?? null
        detail.currentTeam = teams.get(profile.current_team?.id) ?? null
        detail.profileAt = profileFile.at
      } else rejected++
    }
    const logFile = read('log-' + tail)
    if (
      logFile &&
      (!detail.logAt ||
        Date.parse(logFile.at) > Date.parse(detail.logAt) ||
        (legacyImport && logFile.at === detail.logAt))
    ) {
      const log = logFile.json.data
      if (
        !Array.isArray(log) ||
        log.length > 15 ||
        log.some(
          (row) =>
            !record(row) ||
            !seasonDate(row.date, endYear) ||
            (row.player_id != null && 'bbs:player:' + row.player_id !== id),
        )
      )
        rejected++
      else {
        const seen = new Set()
        const games = log
          .map((row) => {
            const proposed = typeof row.match_id === 'string' ? 'bbs:game:' + row.match_id : null
            return {
              date: row.date,
              opponent: code(row.abbr) ?? string(row.opponent),
              gameId: null,
              matchId: proposed && bbsGameId.test(proposed) ? proposed : null,
              pts: number(row.pts),
              reb: number(row.reb),
              ast: number(row.ast),
              min: minutes(row.min_played),
            }
          })
          .filter((row) => {
            const key = row.matchId ?? row.date + ':' + (row.opponent ?? '')
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
        if (
          isPlayerDetail({ ...detail, games }, endYear) &&
          (games.length || !detail.games.length)
        ) {
          detail.games = games
          detail.logAt = logFile.at
        } else rejected++
      }
    }
    if (detail.profileAt || detail.logAt) details[id] = detail
  }
  const identities = new Set(players.map(({ id }) => id))
  const boxes = new Map()
  for (const [key, record] of records) {
    if (
      record.capability !== 'boxScore' ||
      !record.data?.game ||
      key !== 'bbs:nba:game-details:id=' + encodeURIComponent(record.gameId)
    )
      continue
    const ref = { date: record.data.game.nbaGameDate, gameId: record.gameId }
    const base = records.get('bbs:nba:games:date=' + ref.date)
    const verified = verifiedPlayerBox(base, record, ref, endYear, now)
    if (!verified) continue
    for (const line of verified.players) {
      if (!identities.has(line.player.id)) continue
      const game = boxPlayerLine(verified, line.player.id)
      if (!game) continue
      const list = boxes.get(line.player.id) ?? []
      list.push(game)
      boxes.set(line.player.id, list)
    }
  }
  let boxLinks = 0
  for (const [id, games] of boxes) {
    const bounded = games.sort((left, right) => right.date.localeCompare(left.date)).slice(0, 15)
    gameRefs[id] = bounded.map(({ date, gameId }) => ({ date, gameId }))
    boxLinks += combinePlayerGames(details[id]?.games ?? [], bounded).filter(
      (row) => row.gameId,
    ).length
  }
  const coverage = {
    providerRows: keepDirectory ? previous.coverage.providerRows : providerRows,
    total: players.length,
    checked: Object.keys(averageAt).length,
    averages: players.filter(({ stats }) => stats?.gp > 0).length,
    enriched: Object.values(details).filter(
      (detail) => detail.profileAt && detail.logAt && detail.games.length,
    ).length,
    boxLinks,
  }
  const normalized = { version: 2, players, details, gameRefs, directoryAt, averageAt, coverage }
  if (!isStoredPlayers(normalized, endYear))
    throw new Error('Refusing to publish an invalid player snapshot')
  const observations = [directoryAt, ...Object.values(averageAt)].filter(timestamp)
  const oldest = observations.reduce((left, right) =>
    Date.parse(left) < Date.parse(right) ? left : right,
  )
  const payload = JSON.stringify(normalized)
  if (Buffer.byteLength(payload) >= 1_800_000) throw new Error('Snapshot exceeds safe D1 row size')
  db.prepare(
    'INSERT INTO nba_player_snapshot VALUES (?, ?, ?) ON CONFLICT(season_end_year) DO UPDATE SET fetched_at=excluded.fetched_at,payload=excluded.payload',
  ).run(endYear, oldest, payload)
  console.log({ ...coverage, ambiguous, rejected })
}
