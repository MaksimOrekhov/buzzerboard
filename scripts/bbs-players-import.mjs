import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const [source, database, seasonArg] = process.argv.slice(2)
const season = Number(seasonArg)
if (!source || !database || !/^20\d{2}$/.test(seasonArg ?? ''))
  throw new Error('Usage: node scripts/bbs-players-import.mjs SNAPSHOTS LOCAL_SQLITE 2026')
statSync(database)
const db = new DatabaseSync(database)
const files = new Set(readdirSync(source))
const load = (name) =>
  files.has(name + '.json') ? JSON.parse(readFileSync(join(source, name + '.json'), 'utf8')) : null
const time = (name) =>
  files.has(name + '.json') ? statSync(join(source, name + '.json')).mtime.toISOString() : null
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const string = (value) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 130) : null
const number = (value) =>
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0
    ? Number(value)
    : null
const percent = (value) => {
  const rate = number(value)
  return rate !== null && rate <= 1 ? rate : null
}
const minutes = (value) => {
  const clock = /^(\d+):([0-5]\d)$/.exec(value)
  const min = clock ? Number(clock[1]) + Number(clock[2]) / 60 : number(value)
  return min !== null && min <= 80 ? min : null
}
const date = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && !Number.isNaN(Date.parse(value)) ? value : null
const seasonDate = (value) =>
  date(value) && value >= `${season}-08-01` && value < `${season + 1}-08-01`
const snapshotRecords = db
  .prepare(
    "SELECT record_json FROM nba_cache WHERE provider='bbs' AND capability IN ('teamDirectory','boxScore')",
  )
  .all()
  .map((row) => JSON.parse(row.record_json))
const crosswalk = snapshotRecords.find(
  (row) => row.capability === 'teamDirectory' && row.seasonEndYear === season + 1,
)
const teams = new Map(
  crosswalk?.data.map((team) => [team.providerTeamId, team.teamId.split(':').at(-1)]),
)
if (teams.size !== 30)
  throw new Error('Import the verified PRO-189 BBS team directory before players')
const teamCodes = new Set(teams.values())
const aliases = { GS: 'GSW', NO: 'NOP', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS', NY: 'NYK' }
function code(value) {
  const name = string(value)?.toUpperCase()
  const result = aliases[name] ?? name
  return teamCodes.has(result) ? result : null
}

const boxes = new Map()
const distinctBoxIds = new Set()
for (const { capability, data } of snapshotRecords) {
  if (
    capability !== 'boxScore' ||
    !data?.game ||
    data.game.seasonEndYear !== season + 1 ||
    data.game.status !== 'final'
  )
    continue
  const game = data.game
  for (const line of data.players) {
    if (line.player?.id) distinctBoxIds.add(line.player.id)
    if (!uuid.test(line.player?.id?.split(':').at(-1) ?? '') || line.didNotPlay === true) continue
    const home = line.player.teamId === game.homeTeam.id
    const away = line.player.teamId === game.awayTeam.id
    if (home === away || !seasonDate(game.nbaGameDate)) continue
    const opponent = code((home ? game.awayTeam : game.homeTeam).abbreviation)
    const item = {
      date: game.nbaGameDate,
      opponent,
      gameId: game.id,
      pts: number(line.points),
      reb: number(line.rebounds),
      ast: number(line.assists),
      min: minutes(line.minutes),
    }
    const list = boxes.get(line.player.id) ?? []
    list.push(item)
    boxes.set(line.player.id, list)
  }
}
const providerRows = load(`directory-${season}-0`)?.pagination?.total
if (!Number.isSafeInteger(providerRows) || providerRows < 1 || providerRows > 1500)
  throw new Error('Invalid directory denominator')
const directory = new Map()
for (let offset = 0; offset < providerRows; offset += 200) {
  const page = load(`directory-${season}-${offset}`)
  if (
    page?.pagination?.offset !== offset ||
    page.pagination.total !== providerRows ||
    page.data.length !== Math.min(200, providerRows - offset) ||
    page.meta?.filters_applied?.season !== season
  )
    throw new Error('Incomplete season directory')
  for (const row of page.data) {
    if (uuid.test(row.id) && string(row.name) && row.team?.league?.toUpperCase() === 'NBA')
      directory.set(row.id, row)
  }
}
const players = []
const details = {}
let checked = 0
let averages = 0
let enriched = 0
let boxLinks = 0
let ambiguous = 0
let oldest
for (const [uuid, row] of directory) {
  const id = 'bbs:player:' + uuid
  const averageName = `average-${season}-${uuid}`
  const average = load(averageName)
  const rows = (Array.isArray(average?.data) ? average.data : []).filter(
    (item) => item.season === season && String(item.player_id) === uuid,
  )
  if (average) {
    checked++
    const observed = time(averageName)
    if (!oldest || observed < oldest) oldest = observed
  }
  if (rows.length > 1) ambiguous++
  const stats = rows.length === 1 ? rows[0] : null
  const gp = number(stats?.games_played)
  const hasAverage = gp !== null && Number.isInteger(gp)
  players.push({
    id,
    name: string(row.name),
    team: teams.get(row.team.id) ?? null,
    position: string(row.position),
    number: string(row.jersey_number),
    height: string(row.height),
    weight: string(row.weight),
    stats: hasAverage
      ? {
          gp,
          min: gp ? minutes(stats.min) : null,
          ...Object.fromEntries(
            Object.entries({
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
            }).map(([key, alias]) => [key, gp ? number(stats[alias]) : null]),
          ),
          fg: gp ? percent(stats.fg_pct) : null,
          three: gp ? percent(stats.fg3_pct) : null,
          ft: gp ? percent(stats.ft_pct) : null,
        }
      : null,
  })
  if (hasAverage && gp > 0) averages++
  const profileName = `profile-${season}-${uuid}`
  const logName = `log-${season}-${uuid}`
  const profile = load(profileName)?.data?.player
  const validProfile = profile?.id === uuid && profile?.league?.toUpperCase() === 'NBA'
  const log = load(logName)?.data
  const cachedGames = boxes.get(id) ?? []
  if (validProfile || Array.isArray(log) || cachedGames.length) {
    const games = new Map()
    for (const item of (Array.isArray(log) ? log : []).filter((game) => seasonDate(game.date))) {
      const opponent = code(item.abbr)
      const key = item.date + ':' + (opponent ?? item.opponent ?? '')
      if (games.has(key)) continue
      games.set(key, {
        date: item.date,
        opponent: opponent ?? string(item.opponent),
        gameId: null,
        pts: number(item.pts),
        reb: number(item.reb),
        ast: number(item.ast),
        min: minutes(item.min_played),
      })
    }
    for (const game of cachedGames) games.set(game.date + ':' + (game.opponent ?? ''), game)
    const recent = [...games.values()]
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 15)
    boxLinks += recent.filter((game) => game.gameId).length
    if (recent.length > 0 && validProfile) enriched++
    details[id] = {
      birthDate: validProfile ? date(profile.date_of_birth) : null,
      currentTeam: validProfile ? (teams.get(profile.current_team?.id) ?? null) : null,
      profileAt: validProfile ? time(profileName) : null,
      logAt: Array.isArray(log) ? time(logName) : null,
      games: recent,
    }
  }
}
if (!players.length) throw new Error('Refusing to replace the snapshot with an empty catalog')
const coverage = { providerRows, total: directory.size, checked, averages, enriched, boxLinks }
const payload = JSON.stringify({ players, details, coverage })
if (Buffer.byteLength(payload) >= 1_800_000) throw new Error('Snapshot exceeds safe D1 row size')
const write = db.prepare(
  "INSERT INTO nba_player_snapshot VALUES (?, ?, ?) ON CONFLICT(season_end_year) DO UPDATE SET fetched_at=excluded.fetched_at,payload=excluded.payload WHERE json_extract(excluded.payload, '$.coverage.checked') >= json_extract(nba_player_snapshot.payload, '$.coverage.checked')",
)
const result = write.run(season + 1, oldest ?? time(`directory-${season}-0`), payload)
console.log({
  ...coverage,
  ambiguous,
  distinctBoxIds: distinctBoxIds.size,
  snapshotWritten: result.changes === 1,
})
db.close()
