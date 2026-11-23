import assert from 'node:assert/strict'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { checkSpoilerMode } from './pro210-spoiler-browser.mjs'
import { checkTeamHistory } from './pro203-team-history-browser.mjs'
import { checkTeamCoaching } from './pro204-team-coaching-browser.mjs'
import { checkUiAudit } from './pro217-ui-browser.mjs'

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baselineRoot = process.env.BUZZERBOARD_VISUAL_BASELINE_ROOT
const root = baselineRoot ? path.resolve(baselineRoot) : workspace
const auditOnly = Boolean(baselineRoot) || process.argv.includes('--audit-only')
const artifact = path.join(workspace, 'artifacts/pro-171')
const baselineOutput = path.join(artifact, 'baseline')
const output = baselineRoot ? baselineOutput : path.join(artifact, 'synthetic')
const viewports = [320, 375, 620, 768, 1024, 1280, 1440]
const checks = []
const layoutFailures = []
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())
const shift = (days) => {
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
const team = (id, name) => ({
  id: `test:team:${id}`,
  providerId: id,
  abbreviation: id,
  displayName: name,
})
const games = Array.from({ length: 15 }, (_, index) => ({
  id: `dunkapi:game:synthetic-${index}`,
  provider: 'dunkapi',
  providerId: `synthetic-${index}`,
  seasonEndYear: 2027,
  nbaGameDate: today,
  startsAt: `${today}T${String(10 + Math.floor(index / 2)).padStart(2, '0')}:00:00Z`,
  status: index < 12 ? 'final' : 'scheduled',
  awayTeam: team(
    `A${index}`,
    index === 0
      ? 'Synthetic exceptionally long basketball team name'
      : `Away Test Club ${index + 1}`,
  ),
  homeTeam: team(`H${index}`, `Home Test Club ${index + 1}`),
  score: index < 12 ? { away: 101 + index, home: 110 + index * 2 } : { away: null, home: null },
  scoreByPeriod: index === 0 ? [{ period: 1, away: 20, home: 30 }] : null,
  venue: index === 0 ? 'Synthetic Arena' : null,
}))
const meta = {
  source: 'dunkapi',
  fetchedAt: `${today}T08:00:00Z`,
  providerUpdatedAt: null,
  isStale: false,
  rejectedRecords: 0,
  refreshError: null,
}
function syntheticBoxScore(game) {
  if (!game) return null
  const line = (team, points, id) => ({
    team,
    points,
    fieldGoals: { made: 38, attempted: 82, percentage: 0.463 },
    threePointers: { made: 11, attempted: 30, percentage: 0.367 },
    freeThrows: { made: 14, attempted: 17, percentage: 0.824 },
    rebounds: 45,
    offensiveRebounds: 11,
    defensiveRebounds: 34,
    assists: 25,
    steals: 8,
    blocks: 5,
    turnovers: 11,
    fouls: 18,
    plusMinus: id === 'home' ? 3 : -3,
  })
  const playerLine = (team, id, points, dnp = false) => ({
    player: {
      id: `dunkapi:player:${id}`,
      provider: 'dunkapi',
      providerId: id,
      displayName: dnp ? 'Synthetic reserve' : 'Synthetic scorer',
      teamId: team.id,
    },
    starter: !dnp,
    didNotPlay: dnp,
    minutes: dnp ? null : '35:12',
    points: dnp ? null : points,
    fieldGoals: { made: dnp ? null : 9, attempted: dnp ? null : 18, percentage: dnp ? null : 0.5 },
    threePointers: {
      made: dnp ? null : 3,
      attempted: dnp ? null : 7,
      percentage: dnp ? null : 0.429,
    },
    freeThrows: { made: dnp ? null : 3, attempted: dnp ? null : 4, percentage: dnp ? null : 0.75 },
    rebounds: dnp ? null : 5,
    offensiveRebounds: dnp ? null : 1,
    defensiveRebounds: dnp ? null : 4,
    assists: dnp ? null : 8,
    steals: dnp ? null : 2,
    blocks: dnp ? null : 0,
    turnovers: dnp ? null : 3,
    fouls: dnp ? null : 2,
    plusMinus: dnp ? null : 7,
  })
  return {
    game,
    teams: [
      line(game.awayTeam, game.score.away, 'away'),
      line(game.homeTeam, game.score.home, 'home'),
    ],
    players: [
      playerLine(game.homeTeam, `scorer-${game.providerId}`, Math.max(1, game.score.home - 86)),
      ...Array.from({ length: 14 }, (_, index) => {
        const row = playerLine(
          game.homeTeam,
          `home-extra-${index}`,
          index === 0 ? Math.max(1, game.score.home - 86) : index === 1 ? null : 1,
        )
        return {
          ...row,
          player: {
            ...row.player,
            displayName:
              index === 0
                ? 'Synthetic exceptionally long player name with multiple surnames'
                : `Synthetic home player ${index}`,
          },
          didNotPlay: index === 1 ? null : false,
          plusMinus: index === 2 ? -12 : row.plusMinus,
        }
      }),
      ...Array.from({ length: 13 }, (_, index) =>
        playerLine(game.awayTeam, `away-extra-${index}`, index === 0 ? null : 1),
      ),
      playerLine(game.awayTeam, `reserve-${game.providerId}`, null, true),
    ],
  }
}
const standings = ['east', 'west'].flatMap((conference) =>
  Array.from({ length: 15 }, (_, index) => ({
    team: team(
      `${conference}${String(index + 1).padStart(2, '0')}`,
      `${conference === 'east' ? 'East' : 'West'} Test Club ${String(index + 1).padStart(2, '0')}${index === 4 ? ' with an exceptionally long team name' : ''}`,
    ),
    seasonEndYear: 2027,
    conference,
    record: {
      wins: 30 - index,
      losses: 10 + index,
      conferenceWins: index % 2 === 0 ? 10 : null,
      conferenceLosses: index % 2 === 0 ? 4 : null,
      homeWins: 15 - index,
      homeLosses: 5 + index,
      awayWins: 15,
      awayLosses: 5,
      lastTenWins: index % 11,
      pointsFor: null,
      pointsAgainst: null,
      averageMargin: index % 2 === 0 ? 5 - index : null,
    },
    winPercentage: (30 - index) / 40,
    officialRank: null,
    playoffSeed: null,
    providerOrder: 15 - index,
  })),
)
const error = {
  error: {
    code: 'cache_miss',
    message: 'Synthetic cache miss',
    retryable: true,
    provider: null,
    upstreamStatus: null,
  },
  requestId: null,
}
const syntheticPlayers = Array.from({ length: 520 }, (_, index) => ({
  id: 'bbs:player:00000000-0000-0000-0000-' + String(index).padStart(12, '0'),
  name:
    index === 0
      ? 'Synthetic long player name with multiple family names'
      : 'Synthetic Prospect ' + index,
  team: index % 2 ? 'BOS' : 'SAS',
  position: 'Guard',
  number: null,
  height: null,
  weight: null,
  stats:
    index % 5
      ? {
          gp: 12,
          pts: index / 20,
          reb: 4,
          ast: 3,
          min: 20,
          fgm: null,
          fga: null,
          fg: null,
          threeM: null,
          threeA: null,
          three: null,
          ftm: null,
          fta: null,
          ft: null,
          stl: null,
          blk: null,
          oreb: null,
          dreb: null,
          tov: null,
          pf: null,
        }
      : null,
}))
const playerMeta = {
  source: 'bbs',
  seasonEndYear: 2027,
  fetchedAt: meta.fetchedAt,
  isStale: false,
  coverage: {
    total: 520,
    providerRows: 520,
    checked: 520,
    averages: 416,
    enriched: 1,
    boxLinks: 1,
  },
}
await mkdir(output, { recursive: true })
const server = await createServer({
  cacheDir: path.join(root, 'node_modules/.vite-pro171'),
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 4186, strictPort: true },
})
let browser
try {
  await server.listen()
  const { NBA_TEAMS } = await server.ssrLoadModule('/src/entities/nba/teamCatalog.ts')
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_CHANNEL || undefined,
    executablePath: process.env.PW_EXECUTABLE_PATH || undefined,
  })
  for (const width of viewports) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      locale: 'ru-RU',
      timezoneId: 'Asia/Nicosia',
    })
    let mode = 'ready'
    let tiedStandings = false
    let boxScoreAvailable = true
    const calls = []
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.hostname !== '127.0.0.1') return route.abort()
      if (!url.pathname.startsWith('/api/')) return route.continue()
      if (request.method() !== 'GET') return route.abort()
      calls.push({ path: url.pathname, method: request.method() })
      if (mode === 'loading') await new Promise((resolve) => setTimeout(resolve, 1200))
      if (mode === 'error') return route.fulfill({ status: 503, json: error })
      if (url.pathname === '/api/players')
        return route.fulfill({ json: { ...playerMeta, players: syntheticPlayers } })
      if (url.pathname.startsWith('/api/players/')) {
        const id = decodeURIComponent(url.pathname.split('/').at(-1))
        const player = syntheticPlayers.find((item) => item.id === id)
        if (!player) return route.fulfill({ status: 404, json: error })
        return route.fulfill({
          json: {
            ...playerMeta,
            player,
            detail: {
              birthDate: null,
              currentTeam: player.team,
              profileAt: meta.fetchedAt,
              logAt: meta.fetchedAt,
              games: [
                { date: today, opponent: 'BOS', gameId: null, pts: 22, reb: 5, ast: 4, min: 35 },
                {
                  date: shift(-1),
                  opponent: 'PHI',
                  gameId: null,
                  pts: null,
                  reb: 4,
                  ast: 8,
                  min: 21,
                },
                { date: shift(-2), opponent: 'CLE', gameId: null, pts: 1, reb: 3, ast: 0, min: 12 },
              ],
            },
          },
        })
      }
      if (url.pathname === '/api/standings')
        return route.fulfill({
          json: {
            data:
              mode === 'empty'
                ? []
                : tiedStandings
                  ? standings.map((row) => ({
                      ...row,
                      winPercentage: 0.5,
                      record: { ...row.record, wins: 20, losses: 20 },
                    }))
                  : standings,
            meta: { ...meta, isStale: mode === 'stale' },
          },
        })
      if (/^\/api\/games\/[^/]+$/.test(url.pathname)) {
        const id = decodeURIComponent(url.pathname.split('/').at(-1))
        const game = games.find(
          (item) => item.id === id && item.nbaGameDate === url.searchParams.get('date'),
        )
        if (!game) return route.fulfill({ status: 503, json: error })
        return route.fulfill({
          json: {
            data: { game, boxScore: boxScoreAvailable ? syntheticBoxScore(game) : null },
            meta: { ...meta },
            boxScoreMeta: boxScoreAvailable ? { ...meta } : null,
            boxScoreAvailability: boxScoreAvailable ? 'available' : 'unavailable',
          },
        })
      }
      const date = url.searchParams.get('date')
      const records =
        mode === 'empty'
          ? []
          : date === today
            ? games
            : games.slice(10).map((game) => ({ ...game, nbaGameDate: date }))
      return route.fulfill({
        json: { data: records, meta: { ...meta, isStale: mode === 'stale' } },
      })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const visit = async () => {
      await page.goto(`http://127.0.0.1:4186/games?date=${today}`)
      await page.evaluate(() => document.fonts.ready)
    }
    const capture = async (
      label,
      { fullPage = !/comparison|calendar|select-open/.test(label) } = {},
    ) => {
      if (mode !== 'loading') await page.evaluate(() => document.fonts.ready)
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      assert.ok(
        baselineRoot || documentWidth <= width,
        `${width} ${label}: overflow ${documentWidth}`,
      )
      await page.screenshot({
        path: path.join(output, `${width}-${label}.png`),
        fullPage,
        animations: 'disabled',
      })
    }
    const sizes = width === 1440 ? [1000, 600] : [width === 320 ? 600 : 1000]
    const setMode = (nextMode) => {
      mode = nextMode
    }
    const auditPage = await context.newPage()
    auditPage.on('pageerror', (error) => errors.push(error.message))
    for (const height of sizes) {
      await auditPage.setViewportSize({ width, height })
      await checkUiAudit({
        page: auditPage,
        today,
        game: games[0],
        player: syntheticPlayers[0],
        teams: NBA_TEAMS,
        meta,
        setMode,
        baseline: Boolean(baselineRoot),
        capture: async (label, { fullPage }) => {
          if (mode !== 'loading') await auditPage.evaluate(() => document.fonts.ready)
          const actualWidth = await auditPage.evaluate(() => document.documentElement.scrollWidth)
          if (actualWidth > width) {
            const elements = await auditPage.evaluate(() =>
              [...document.querySelectorAll('main *, .gc-topbar *')]
                .filter((node) => node.getBoundingClientRect().right > innerWidth + 1)
                .filter((node) => !node.closest('table'))
                .slice(0, 8)
                .map((node) => node.getAttribute('class') || node.tagName),
            )
            layoutFailures.push({ width, height, label, actualWidth, elements })
          }
          await auditPage.screenshot({
            path: path.join(output, width + 'x' + height + '-' + label + '.png'),
            fullPage,
            animations: 'disabled',
          })
        },
      })
    }
    await auditPage.close()
    assert.deepEqual(errors, [])
    if (auditOnly || width === 320) {
      await context.close()
      continue
    }
    await page.bringToFront()
    await visit()
    await page.locator('.gc-score-row').last().waitFor()
    assert.equal(await page.locator('.gc-score-row').count(), 15)
    await capture('ready')
    // Search, team filter, date reset, status, sort, and persisted favorites.
    await page.getByRole('searchbox', { name: 'Поиск команды' }).fill('exceptionally')
    assert.equal(await page.locator('.gc-score-row').count(), 1)
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await page.getByRole('combobox', { name: 'Фильтр по команде' }).click()
    await capture('select-open')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.getByRole('combobox', { name: 'Фильтр по команде' }).click()
    await page.getByRole('option', { name: 'Home Test Club 1', exact: true }).click()
    assert.equal(await page.locator('.gc-score-row').count(), 1)
    await page.getByRole('button', { name: 'Предыдущий день', exact: true }).click()
    await page.waitForURL(`**date=${shift(-1)}**`)
    assert.equal(
      await page.getByRole('combobox', { name: 'Фильтр по команде' }).innerText(),
      'Все команды',
    )
    await page.getByRole('button', { name: 'Сегодня', exact: true }).click()
    await page.waitForURL(`**date=${today}**`)
    await page.locator('.gc-score-row').last().waitFor()
    await page.getByRole('button', { name: 'Предстоящие', exact: false }).click()
    assert.equal(await page.locator('.gc-score-row').count(), 3)
    await page.getByRole('button', { name: 'Все матчи', exact: false }).click()
    const first = await page.locator('.gc-score-row').first().getAttribute('aria-label')
    await page.getByRole('button', { name: 'Сначала ранние. Изменить порядок' }).click()
    assert.notEqual(await page.locator('.gc-score-row').first().getAttribute('aria-label'), first)
    await page.getByRole('button', { name: 'Сначала поздние. Изменить порядок' }).click()
    await page.getByRole('button', { name: 'Добавить матч в избранное' }).first().click()
    await page.getByRole('button', { name: 'Только избранные', exact: true }).click()
    assert.equal(await page.locator('.gc-score-row').count(), 1)
    await page.reload()
    await page.getByRole('button', { name: 'Только избранные', exact: true }).click()
    assert.equal(await page.locator('.gc-score-row').count(), 1)
    await page.getByRole('searchbox', { name: 'Поиск команды' }).fill('exceptionally')
    await page.getByRole('link', { name: 'Открыть карточку матча' }).first().click()
    await page.getByRole('heading', { name: 'Сравнение команд' }).waitFor()
    assert.equal(await page.getByRole('heading', { name: 'Статистика игроков' }).isVisible(), true)
    assert.equal(await page.locator('.game-detail-hero').isVisible(), true)
    assert.equal(
      (await page.locator('.player-dnp summary').first().innerText())
        .replaceAll(/\s+/g, ' ')
        .trim(),
      'Не играли 1',
    )
    const playerTable = page.locator('.player-box-score').first()
    await playerTable.getByRole('button', { name: 'Сортировать по: Очки' }).focus()
    await page.keyboard.press('Enter')
    assert.equal(await playerTable.locator('[aria-sort="ascending"]').innerText(), 'PTS↑')
    await playerTable.getByRole('button', { name: 'Броски', exact: true }).click()
    await playerTable.getByRole('button', { name: 'Сортировать по: Броски с игры, %' }).click()
    await playerTable.getByRole('button', { name: 'Основное', exact: true }).click()
    assert.equal(await playerTable.locator('tbody tr').count(), 13)
    assert.equal(await page.locator('.player-box-score').last().locator('tbody tr').count(), 15)
    assert.equal(await page.getByText('Участие не подтверждено', { exact: true }).count(), 1)
    assert.equal(await page.locator('.game-leader-card').first().locator('small').count(), 2)
    assert.equal(
      await playerTable
        .locator('.player-box-table-scroll')
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      true,
    )
    assert.equal(await page.locator('.game-leader-card').count(), 3)
    await capture('game-details')
    await page.getByRole('link', { name: 'К игровому дню' }).click()
    await page.getByRole('searchbox', { name: 'Поиск команды' }).waitFor()
    assert.equal(
      await page.getByRole('searchbox', { name: 'Поиск команды' }).inputValue(),
      'exceptionally',
    )
    assert.equal(await page.locator('.gc-score-row').count(), 1)
    boxScoreAvailable = false
    await page.reload()
    await page.getByRole('searchbox', { name: 'Поиск команды' }).waitFor()
    await page.getByRole('link', { name: 'Открыть карточку матча' }).first().click()
    await page.getByRole('heading', { name: 'Подробная статистика пока недоступна' }).waitFor()
    await capture('game-details-no-box')
    boxScoreAvailable = true
    await page.getByRole('link', { name: 'К игровому дню' }).click()
    await page.getByRole('searchbox', { name: 'Поиск команды' }).waitFor()
    await page.getByRole('button', { name: 'Выбрать игровую дату NBA' }).click()
    await capture('calendar-open')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')
    await page.waitForURL(`**date=${shift(-1)}**`)
    await page.getByRole('button', { name: 'Сегодня', exact: true }).click()
    await page.waitForURL(`**date=${today}**`)
    await page.getByRole('button', { name: 'Выбрать игровую дату NBA' }).click()
    await page.keyboard.press('Escape')
    assert.equal(
      await page
        .getByRole('button', { name: 'Выбрать игровую дату NBA' })
        .evaluate((node) => document.activeElement === node),
      true,
    )
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await page.getByRole('button', { name: 'Убрать матч из избранного' }).click()
    await page.getByRole('button', { name: 'Только избранные', exact: true }).click()
    assert.equal(await page.getByText('Матчи не найдены', { exact: true }).isVisible(), true)
    for (const state of ['loading', 'empty', 'error', 'stale']) {
      mode = state
      await page.reload({ waitUntil: 'domcontentloaded' })
      if (state === 'loading') await page.locator('.gc-skeleton-list').waitFor()
      else if (state === 'empty')
        await page.getByText('В этот день матчей нет', { exact: true }).waitFor()
      else if (state === 'error')
        await page.getByText('За этот день пока нет данных', { exact: true }).waitFor()
      else await page.getByText('Данные устарели', { exact: false }).waitFor()
      await capture(state)
    }

    // All routes share the same shell, tokens and keyboard navigation.
    mode = 'ready'
    for (const [name, route] of [
      ['overview', '/'],
      ['favorites-empty', '/favorites'],
      ['news', '/news'],
      ['not-found', '/not-a-page'],
    ]) {
      await page.goto(`http://127.0.0.1:4186${route}`)
      await page.waitForFunction(() => document.querySelectorAll('h1').length === 1)
      if (name === 'overview') await page.locator('.overview-mini-row').first().waitFor()
      assert.equal(await page.locator('h1').count(), 1)
      assert.equal(await page.locator('.gc-mobile-nav').isVisible(), width <= 620)
      assert.equal(await page.locator('.gc-sidebar').isVisible(), width > 620)
      await capture(name)
    }
    await page.goto('http://127.0.0.1:4186/standings')
    await page.locator('.standings-table tbody tr').last().waitFor()
    assert.equal(await page.locator('.standings-table tbody tr').count(), 15)
    assert.equal(await page.locator('.rank-cell').count(), 0)
    assert.ok(
      (await page.locator('.standings-table tbody tr').first().textContent()).includes(
        'East Test Club 01',
      ),
    )
    await capture('standings-east')
    await page.getByRole('button', { name: 'Сортировать по полю «победам»', exact: true }).click()
    await page
      .getByRole('button', {
        name: 'Сортировать по полю «победам», сейчас по убыванию',
        exact: true,
      })
      .click()
    assert.ok(
      (await page.locator('.standings-table tbody tr').first().textContent()).includes(
        'East Test Club 15',
      ),
    )
    await page.getByRole('button', { name: 'Запад', exact: true }).click()
    assert.equal(await page.locator('.standings-table tbody tr').count(), 15)
    await capture('standings-west')
    await page.getByRole('searchbox', { name: 'Поиск команды в таблице' }).fill('club 01')
    assert.equal(await page.locator('.standings-table tbody tr').count(), 1)
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    await page.locator('.standings-table .favorite-button').first().click()
    await page.getByRole('button', { name: 'Избранные', exact: true }).click()
    assert.equal(await page.locator('.standings-table tbody tr').count(), 1)
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    const scroll = page.locator('.standings-scroll')
    await scroll.evaluate((node) => {
      node.scrollLeft = node.scrollWidth
    })
    const checkboxes = page.getByRole('checkbox', { name: /Сравнить/ })
    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()
    assert.equal(await checkboxes.nth(2).isDisabled(), true)
    // A sticky team column remains visible while other metrics scroll.
    const sticky = await page.locator('.team-cell').first().boundingBox()
    const region = await scroll.boundingBox()
    assert.ok(Math.abs(sticky.x - region.x) < 3)
    await capture('standings-scrolled')
    await page.getByRole('button', { name: 'Сравнить команды', exact: true }).click()
    await page.getByRole('dialog', { name: 'Сравнение команд', exact: true }).waitFor()
    await capture('comparison-open')
    assert.equal(await page.locator('.comparison-table tbody tr').count(), 7)
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    assert.equal(
      await page
        .getByRole('button', { name: 'Сравнить команды', exact: true })
        .evaluate((node) => document.activeElement === node),
      true,
    )
    await page.getByRole('combobox', { name: 'Сортировка турнирной таблицы' }).click()
    await capture('standings-select-open')
    await page.keyboard.press('Escape')
    // Favorite teams survive route navigation; cached games use the same row component.
    await page.goto('http://127.0.0.1:4186/favorites')
    await page.locator('.favorite-team-card').waitFor()
    await capture('favorites-teams')
    await page.goto(`http://127.0.0.1:4186/games?date=${today}`)
    await page.getByRole('button', { name: 'Добавить матч в избранное' }).first().click()
    await page
      .locator('.gc-primary-nav a[href="/favorites"],.gc-mobile-nav a[href="/favorites"]')
      .filter({ visible: true })
      .click()
    await page.getByRole('button', { name: /^Матчи/ }).click()
    await page.locator('.gc-score-row').first().waitFor()
    assert.equal(await page.locator('.gc-score-row').count(), 1)
    await capture('favorites-games')
    // Source errors, stale data and incomplete/ambiguous GB remain honest.
    for (const state of ['loading', 'empty', 'error', 'stale']) {
      mode = state
      await page.goto('http://127.0.0.1:4186/standings', { waitUntil: 'domcontentloaded' })
      if (state === 'loading') await page.locator('.gc-skeleton-list').waitFor()
      else if (state === 'empty')
        await page.getByText('Данные таблицы отсутствуют', { exact: true }).waitFor()
      else if (state === 'error')
        await page.getByText('Таблица пока не загружена', { exact: true }).waitFor()
      else await page.getByText('Данные устарели', { exact: false }).waitFor()
      await capture(`standings-${state}`)
    }
    mode = 'ready'
    tiedStandings = true
    await page.reload()
    await page.locator('.standings-table tbody tr').last().waitFor()
    assert.equal(
      await page
        .getByRole('button', {
          name: 'Сортировать по полю «расчётному отставанию от лидера»',
          exact: true,
        })
        .isDisabled(),
      true,
    )
    await capture('standings-tied-pct')
    await page.goto('http://127.0.0.1:4186/players')
    const playerRows = page.locator('.players-table tbody tr')
    await playerRows.first().waitFor()
    assert.equal(await playerRows.count(), 25)
    await page.getByRole('button', { name: 'Далее', exact: true }).click()
    await page.waitForURL((url) => url.searchParams.get('page') === '2')
    await page.getByRole('searchbox', { name: 'Поиск игрока' }).fill('multiple family names')
    await page.getByRole('link', { name: syntheticPlayers[0].name }).waitFor()
    assert.equal(await playerRows.count(), 1)
    await page.getByRole('button', { name: 'Избранное: ' + syntheticPlayers[0].name }).click()
    await page.getByRole('link', { name: syntheticPlayers[0].name }).click()
    await page.locator('.player-chart').waitFor()
    assert.equal(await page.locator('.chart-line').count(), 0)
    await page.getByRole('button', { name: 'Подборы', exact: true }).first().click()
    assert.equal(await page.locator('.chart-line').count(), 2)
    await capture('player-profile')
    await page.getByRole('link', { name: 'К списку игроков', exact: false }).click()
    await page.getByRole('link', { name: syntheticPlayers[0].name }).waitFor()
    assert.equal(
      await page.getByRole('searchbox', { name: 'Поиск игрока' }).inputValue(),
      'multiple family names',
    )
    await page.goto('http://127.0.0.1:4186/favorites?tab=players')
    await page.getByRole('link', { name: syntheticPlayers[0].name }).waitFor()
    assert.equal(await playerRows.count(), 1)
    await capture('favorite-players')
    await page.keyboard.press('Tab')
    // All network data in public screenshots are generated above.
    assert.ok(
      calls.every(
        (call) =>
          call.method === 'GET' &&
          (call.path === '/api/games' ||
            call.path === '/api/standings' ||
            /^\/api\/players(?:\/[^/]+)?$/.test(call.path) ||
            /^\/api\/games\/[^/]+$/.test(call.path)),
      ),
    )
    if (width === 1440) {
      await page.setViewportSize({ width, height: 600 })
      await page.locator('.gc-sidebar').evaluate((node) => {
        node.scrollTop = node.scrollHeight
      })
      const signature = await page.locator('.gc-sidebar-signature').boundingBox()
      assert.ok(signature.y >= 0 && signature.y + signature.height <= 600)
      await page.setViewportSize({ width, height: 1000 })
    }
    if ([375, 768, 1440].includes(width)) {
      await checkSpoilerMode({
        page,
        today,
        shift,
        games,
        meta,
        syntheticBoxScore,
        playerMeta,
        syntheticPlayers,
        standings,
        capture,
      })
    }
    if ([375, 768, 1440].includes(width)) {
      await checkTeamHistory({ page, capture })
      await checkTeamCoaching({ page, capture })
    }
    assert.deepEqual(errors, [])
    checks.push({
      width,
      routes: 11,
      states: 'ready,loading,empty,error,stale,ambiguous GB',
      interactions:
        'filters, sort, favorites, comparison, sticky columns, date reset, calendar keyboard, focus restoration, GET-only',
    })
    await context.close()
  }
  await writeFile(
    path.join(output, 'checks.json'),
    JSON.stringify({ checks, layoutFailures }, null, 2),
  )
  if (!baselineRoot) {
    const before = new Set(
      await readdir(baselineOutput).catch((error) => {
        if (error.code !== 'ENOENT') throw error
        return []
      }),
    )
    if (before.size) {
      const images = (await readdir(output))
        .filter((file) => file.includes('-audit-') && file.endsWith('.png'))
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      const view = (label, folder, file) =>
        `<figure><figcaption>${label}</figcaption><a href="${folder}/${file}"><img loading="lazy" src="${folder}/${file}" alt="${label}"></a></figure>`
      const comparison = images
        .map(
          (file) =>
            `<section><h2>${file.slice(0, -4)}</h2><div>${before.has(file) ? view('До', 'baseline', file) : ''}${view('После', 'synthetic', file)}</div></section>`,
        )
        .join('')
      await writeFile(
        path.join(artifact, 'comparison.html'),
        `<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>BuzzerBoard · PRO-217 · до и после</title>
<style>
body { background: #0d1017; color: #f1f4fa; font: 16px system-ui; margin: 24px }
section { border-block-start: 1px solid #272e3d; padding-block: 12px 24px }
section > div { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,320px),1fr)); gap: 16px }
figure { margin: 0; min-width: 0 } img { display: block; max-width: 100%; height: 350px; object-fit: contain; object-position: left top }
</style>
<h1>BuzzerBoard · PRO-217</h1><p>Выберите изображение для просмотра в исходном размере.</p>
${comparison}
</html>`,
      )
    }
    assert.equal(layoutFailures.length, 0, 'Page overflow found. See checks.json.')
  }
  console.info(
    `BuzzerBoard UI audit: all 11 route types with synthetic GET data at ${viewports.join(', ')} px. Regression suite: ${checks.length} viewports.`,
  )
} finally {
  await browser?.close()
  await server.close()
}
