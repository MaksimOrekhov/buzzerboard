import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, 'artifacts/issue-82')
const baseline = process.env.PLAYER_BASELINE_ROOT
const logoDir = process.env.PLAYER_LOGO_DIR
const fixture = JSON.parse(
  await readFile(new URL('../docs/fixtures/player-profile.synthetic.json', import.meta.url)),
)
const profile = '/players/' + encodeURIComponent(fixture.default.player.id)
const viewports = [
  [1440, 900],
  [768, 1024],
  [375, 812],
  [320, 600],
]
const svgFixture =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#efb943"/><path d="M3 12h18M12 2v20" stroke="#552583" stroke-width="2"/></svg>'

await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const measurements = []

async function startServer(workspace, label) {
  const server = await createServer({
    root: workspace,
    cacheDir: path.join(root, 'node_modules/.vite-issue82-' + label),
    server: { host: '127.0.0.1', port: 0, hmr: false, fs: { allow: [workspace, root] } },
  })
  await server.listen()
  return { server, origin: 'http://127.0.0.1:' + server.httpServer.address().port }
}

async function session(origin, viewport, options = {}) {
  const context = await browser.newContext({
    viewport,
    locale: 'ru-RU',
    timezoneId: 'Asia/Nicosia',
    hasTouch: viewport.width <= 620,
  })
  const requests = []
  const unexpected = []
  const errors = []
  const snapshot = structuredClone(options.snapshot ?? fixture.default)
  const { player, source, seasonEndYear, fetchedAt, isStale } = snapshot
  const catalog = {
    source,
    seasonEndYear,
    fetchedAt,
    isStale,
    coverage: { providerRows: 1, total: 1, checked: 1, averages: 1, enriched: 1, boxLinks: 1 },
    players: [player],
  }
  let failures = options.failures ?? 0
  let pending = options.pending

  await context.route(
    (url) => url.origin !== origin || url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url())
      if (url.origin === 'https://cdn.nba.com') {
        if (options.logoError) return route.fulfill({ status: 503 })
        const id = /\/logos\/nba\/(\d+)\/primary\/L\/logo\.svg/.exec(url.pathname)?.[1]
        if (id) {
          const body = logoDir ? await readFile(path.join(logoDir, id + '.svg')) : svgFixture
          return route.fulfill({ contentType: 'image/svg+xml', body })
        }
        return route.abort()
      }
      requests.push({
        path: decodeURIComponent(url.pathname),
        search: url.search,
        method: route.request().method(),
      })
      if (url.origin !== origin || route.request().method() !== 'GET') {
        unexpected.push(url.href)
        return route.abort()
      }
      if (url.pathname === '/api' + profile && url.search === '?seasonEndYear=2027') {
        if (pending) {
          await pending
          pending = null
        }
        if (failures-- > 0) return route.fulfill({ status: 503, json: {} })
        return route.fulfill({ json: snapshot })
      }
      if (url.pathname === '/api/players') return route.fulfill({ json: catalog })
      const meta = {
        source: 'bbs',
        fetchedAt,
        providerUpdatedAt: null,
        isStale: false,
        rejectedRecords: 0,
        refreshError: null,
      }
      if (url.pathname === '/api/games' || url.pathname === '/api/standings') {
        return route.fulfill({ json: { data: [], meta } })
      }
      const linkedGame = snapshot.detail.games.find(
        (game) =>
          game.gameId &&
          decodeURIComponent(url.pathname) === '/api/games/' + game.gameId &&
          url.searchParams.get('date') === game.date,
      )
      if (linkedGame) {
        const game = {
          id: linkedGame.gameId,
          provider: 'bbs',
          providerId: linkedGame.gameId.split(':').at(-1),
          seasonEndYear,
          nbaGameDate: linkedGame.date,
          startsAt: null,
          status: 'final',
          homeTeam: {
            id: 'nba:team:LAL',
            providerId: null,
            abbreviation: 'LAL',
            displayName: 'Los Angeles Lakers',
          },
          awayTeam: {
            id: 'fixture:team:opponent',
            providerId: null,
            abbreviation: null,
            displayName: linkedGame.opponent,
          },
          score: { home: 106, away: 103 },
          scoreByPeriod: null,
          venue: null,
        }
        return route.fulfill({
          json: { data: { game, boxScore: null }, meta, boxScoreAvailability: 'unavailable' },
        })
      }
      unexpected.push(url.href)
      return route.abort()
    },
  )
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.clock.setFixedTime(new Date(fixture.now))
  const go = (route = profile) => page.goto(origin + route)
  return {
    page,
    go,
    requests,
    async close() {
      await context.close()
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
    },
  }
}

async function screenshot(page, filename, fullPage = false) {
  // The viewport PNG retains fixed shell chrome. Put mobile navigation at the end of the page for the full-page export.
  const style = fullPage
    ? await page.addStyleTag({ content: '.gc-mobile-nav { position: static }' })
    : null
  try {
    await page.screenshot({
      path: path.join(output, filename + '.png'),
      fullPage,
      animations: 'disabled',
    })
  } finally {
    await style?.evaluate((node) => node.remove())
  }
}

const boxSelectors = {
  before: {
    primary: '.player-kpis',
    shooting: '.player-panel > div:nth-of-type(2) .player-kpis',
    trend: '.player-chart',
    log: '.player-log',
    favorite: '.player-profile-heading button',
  },
  after: {
    primary: '.pa-primary',
    shooting: '.pa-shooting',
    trend: '.pa-trend',
    log: '.pa-log-panel',
    favorite: '.pa-favorite',
    anchor: '.pa-sections a',
    source: '.pa-source summary',
    logo: '.pa-team a',
  },
}
const sharedSelectors = {
  firstGame: '.player-log tbody tr',
  back: '.player-center > a',
  spoiler: '.gc-topbar button',
  metric: '.player-panel .ui-segmented button',
  sort: '.player-log thead button',
  game: '.player-log tbody a',
}

async function measure(page, stage) {
  return page.evaluate(
    (selectors) => {
      const get = (selector) => document.querySelector(selector)
      const round = (n) => Math.round(n * 10) / 10
      const bounds = (node) => {
        if (!node) return null
        const { top, bottom, width, height } = node.getBoundingClientRect()
        return {
          top: round(top + scrollY),
          bottom: round(bottom + scrollY),
          width: round(width),
          height: round(height),
        }
      }
      return {
        width: innerWidth,
        height: innerHeight,
        pageHeight: document.documentElement.scrollHeight,
        documentWidth: document.documentElement.scrollWidth,
        fold: get('.gc-mobile-nav').getBoundingClientRect().top || innerHeight,
        font: getComputedStyle(get('.player-center')).fontFamily,
        metricCount: document.querySelectorAll('.player-kpis > div, [data-metric]').length,
        boxes: Object.fromEntries(
          Object.entries(selectors).map(([key, selector]) => [key, bounds(get(selector))]),
        ),
      }
    },
    { ...sharedSelectors, ...boxSelectors[stage] },
  )
}

async function captureDefault(origin, stage) {
  for (const [width, height] of viewports) {
    const run = await session(origin, { width, height })
    const { page } = run
    try {
      await run.go()
      await page.locator('.player-log tbody tr').first().waitFor()
      const fonts = await page.evaluate(async () => {
        const loaded = await document.fonts.load('600 14px "Manrope Variable"', 'Статистика NBA')
        return loaded.every((font) => font.status === 'loaded') && loaded.length > 0
      })
      assert.ok(fonts, 'Manrope must be loaded in both revisions')
      if (stage === 'after') {
        await page.locator('.pa-team img').evaluate((img) => img.decode())
        assert.equal(await page.locator('.pa-team a').count(), 1)
        assert.equal(await page.locator('.pa-team a').getAttribute('href'), '/teams/LAL')
      }
      const metrics = await measure(page, stage)
      assert.equal(metrics.documentWidth, width)
      assert.equal(metrics.metricCount, 32)
      assert.equal(run.requests.length, 1)
      if (stage === 'after') {
        assert.equal(
          await page
            .locator('[data-metric]')
            .evaluateAll((nodes) => new Set(nodes.map((node) => node.dataset.metric)).size),
          32,
        )
        for (const key of [
          'favorite',
          'back',
          'metric',
          'sort',
          'game',
          'anchor',
          'source',
          'logo',
        ]) {
          assert.ok(metrics.boxes[key].height >= 44, key + ' target at ' + width)
          assert.ok(metrics.boxes[key].width >= 44, key + ' target at ' + width)
        }
        assert.ok(metrics.boxes.shooting.bottom <= metrics.fold, JSON.stringify(metrics))
        if (width >= 768) {
          assert.equal(metrics.boxes.primary.top, metrics.boxes.shooting.top)
          assert.equal(metrics.boxes.trend.top, metrics.boxes.log.top)
        }
      }
      if (stage === 'after' && width === 1440) {
        const rows = await page.locator('[data-metric]').evaluateAll((nodes) =>
          nodes.map((node) => ({
            metric: node.dataset.metric,
            section: node.closest('section').querySelector('h3').textContent.trim(),
            code: node.querySelector('.pa-stat-code').textContent.trim(),
            label: node.querySelector('th').lastElementChild.textContent.trim(),
          })),
        )
        await writeFile(path.join(output, 'metric-map.json'), JSON.stringify(rows, null, 2) + '\n')
      }
      measurements.push({ stage, ...metrics, requests: run.requests })
      await screenshot(page, stage + '-' + width + '-viewport')
      await screenshot(page, stage + '-' + width + '-full', true)
    } finally {
      await run.close()
    }
  }
}

function row(page, date) {
  return page
    .locator('.player-log tbody tr')
    .filter({ has: page.locator(`time[datetime="${date}"]`) })
}

async function checkSorting(page, games) {
  const table = page.locator('.player-log')
  for (const [key, label] of [
    ['date', 'Дата'],
    ['opponent', 'Соперник'],
    ['pts', 'Очки'],
    ['reb', 'Подборы'],
    ['ast', 'Передачи'],
    ['min', 'Минуты'],
  ]) {
    const button = table.getByRole('button', { name: label, exact: true })
    for (let step = 0; step < 2; step++) {
      await button.click()
      const aria = await button.locator('..').getAttribute('aria-sort')
      const expected =
        (key === 'date' && step === 0) || (key !== 'date' && step === 1)
          ? 'ascending'
          : 'descending'
      assert.equal(aria, expected)
      assert.equal(await table.locator('[aria-sort]').count(), 1)
      assert.equal(await button.evaluate((node) => node === document.activeElement), true)
      const actual = await table
        .locator('tbody time')
        .evaluateAll((nodes) => nodes.map((node) => node.dateTime))
      const sign = expected === 'ascending' ? 1 : -1
      const byDate = (a, b) => b.date.localeCompare(a.date)
      const target = [...games]
        .sort((a, b) => {
          if (a[key] === null) return b[key] === null ? byDate(a, b) : 1
          if (b[key] === null) return -1
          const difference =
            typeof a[key] === 'number' ? a[key] - b[key] : a[key].localeCompare(b[key])
          return difference * sign || byDate(a, b)
        })
        .map(({ date }) => date)
      assert.deepEqual(actual, target, key + ' ' + expected)
    }
  }
}

async function assertAnchor(page, id) {
  await page.waitForFunction((anchor) => {
    const target = document.querySelector(anchor)
    const nav = document.querySelector('.pa-sections')?.getBoundingClientRect()
    return (
      nav &&
      target &&
      target.getBoundingClientRect().top >= nav.bottom - 1 &&
      target.getBoundingClientRect().top <= 72 &&
      document.querySelector('.pa-sections [aria-current="location"]')?.getAttribute('href') ===
        anchor
    )
  }, id)
}

async function checkInteractions(origin) {
  const run = await session(origin, { width: 375, height: 812 })
  const { page } = run
  try {
    await run.go()
    await page.locator('.pa-primary').waitFor()
    await page.locator('.pa-source summary').click()
    const freshness = await page.locator('.pa-source-details').innerText()
    for (const phrase of [
      'Снимок BBS',
      'Средние игрока',
      'Профиль BBS',
      'Журнал матчей',
      '310/520',
      'обновляются средние',
      'Последний завершённый проход',
    ])
      assert.ok(freshness.includes(phrase))
    await screenshot(page, 'freshness-375')
    await page.locator('.pa-source summary').click()

    let point = page.getByRole('button', { name: 'Очки · 2026-11-14 NBA ET · 47', exact: true })
    await point.hover()
    assert.ok((await page.locator('.pa-point-controls').innerText()).includes('Очки: 47'))
    point = page.getByRole('button', { name: 'Очки · 2026-11-06 NBA ET · 28', exact: true })
    await point.focus()
    await point.press('Enter')
    assert.ok((await page.locator('.pa-point-controls').innerText()).includes('Очки: 28'))
    await page.getByRole('button', { name: 'Следующая точка' }).tap()
    assert.ok((await page.locator('.pa-point-controls').innerText()).includes('Очки: 44'))
    await page.getByRole('button', { name: 'Очки · 2026-11-14 NBA ET · 47', exact: true }).tap()
    assert.ok((await page.locator('.pa-point-controls').innerText()).includes('Очки: 47'))
    assert.equal(await page.locator('.player-chart title').count(), 7)
    assert.equal(await page.locator('.chart-line').count(), 5)
    for (const [label, expected] of [
      ['Подборы', 9],
      ['Передачи', 0],
      ['Минуты', 34],
    ]) {
      await page.locator('.pa-trend').getByRole('button', { name: label, exact: true }).tap()
      const date = label === 'Подборы' ? '2026-11-11' : '2026-11-13'
      await page
        .getByRole('button', { name: `${label} · ${date} NBA ET · ${expected}`, exact: true })
        .tap()
      assert.ok(
        (await page.locator('.pa-point-controls').innerText()).includes(`${label}: ${expected}`),
      )
      assert.equal(await page.locator('.player-chart title').count(), 8)
    }
    assert.equal(await row(page, '2026-11-11').getByRole('link').count(), 0)
    assert.equal(await page.locator('.player-log tbody a').count(), 7)
    await checkSorting(page, fixture.default.detail.games)
    const scroll = page.getByRole('region', { name: 'Журнал матчей игрока' })
    await scroll.evaluate((node) => {
      node.scrollLeft = 0
    })
    await scroll.focus()
    await scroll.press('ArrowRight')
    await page.waitForFunction(() => document.querySelector('.stat-table-scroll').scrollLeft > 0)
    assert.equal(await scroll.evaluate((node) => node === document.activeElement), true)
    await screenshot(page, 'keyboard-scroll-375')

    const nav = page.getByRole('navigation', { name: 'Разделы профиля игрока' })
    await nav.getByRole('link', { name: 'Матчи' }).press('Enter')
    await assertAnchor(page, '#player-matches')
    assert.equal(
      await page.locator('#player-matches').evaluate((node) => node === document.activeElement),
      true,
    )
    await nav.getByRole('link', { name: 'Статистика' }).click()
    await assertAnchor(page, '#player-stats')
    await page.goBack()
    await assertAnchor(page, '#player-matches')
    await page.goForward()
    await assertAnchor(page, '#player-stats')
    await page.locator('#player-matches').evaluate((node) => node.scrollIntoView())
    await assertAnchor(page, '#player-matches')
    assert.equal(run.requests.length, 1)
    await page.reload()
    await assertAnchor(page, '#player-stats')
    assert.equal(run.requests.length, 2)

    const favorite = page.getByRole('button', { name: 'Избранное: ' + fixture.default.player.name })
    await favorite.click()
    assert.equal(await favorite.getAttribute('aria-pressed'), 'true')
    await page.reload()
    await favorite.waitFor()
    assert.equal(await favorite.getAttribute('aria-pressed'), 'true')
    for (const from of ['/players?q=Luka&team=LAL', '/favorites?tab=players&q=Luka']) {
      await run.go(from)
      await page.getByRole('link', { name: fixture.default.player.name, exact: true }).click()
      await page.locator('.pa-identity').waitFor()
      assert.equal(new URL(page.url()).searchParams.get('from'), from)
      const playerGets = () =>
        run.requests.filter(({ path }) => path === '/api' + decodeURIComponent(profile)).length
      const beforeMatch = playerGets()
      await page.locator('.player-log tbody a').first().click()
      await page.locator('#game-overview').waitFor()
      await page.getByRole('link', { name: 'К профилю игрока' }).click()
      await page.locator('.pa-identity').waitFor()
      assert.equal(new URL(page.url()).searchParams.get('from'), from)
      await assertAnchor(page, '#player-matches')
      assert.equal(playerGets(), beforeMatch)
      await page
        .getByRole('link', {
          name: from.startsWith('/favorites') ? 'К избранному' : 'К списку игроков',
        })
        .click()
      await page.waitForURL(origin + from)
    }
  } finally {
    await run.close()
  }
}

async function assertMasked(page, values) {
  const scope = page.locator('.player-analytics')
  const surface = (await scope.innerHTML()) + (await scope.ariaSnapshot())
  for (const value of values) {
    const pattern = new RegExp(String.raw`(?:>\s*|:\s*|ET · |cell ")${value}(?=[<"\s]|$)`)
    assert.ok(!pattern.test(surface), 'Protected statistic present: ' + value)
  }
}

async function checkSpoilers(origin) {
  const snapshot = structuredClone(fixture.protected)
  snapshot.detail.games.push({
    ...snapshot.detail.games.at(-1),
    date: '2026-11-27',
    pts: 88,
  })
  for (const aggregateFirst of [false, true]) {
    const run = await session(origin, { width: 375, height: 812 }, { snapshot })
    const { page } = run
    try {
      await run.go()
      await page.locator('.pa-primary').waitFor()
      await page.getByRole('button', { name: 'Без спойлеров', exact: true }).click()
      const gate = page.getByRole('button', { name: 'Показать статистику' })
      const gameReveal = row(page, '2026-11-25').getByRole('button', { name: 'Показать результат' })
      const table = page.locator('.player-log')
      await gate.waitFor()
      assert.equal(
        await page.locator('.pa-primary, .pa-shooting, .pa-trend, [data-metric]').count(),
        0,
      )
      assert.equal(
        await row(page, '2026-11-18').getByRole('cell', { name: '42', exact: true }).count(),
        1,
      )
      assert.equal(await row(page, '2026-11-26').getByRole('button').count(), 0)
      assert.equal(await row(page, '2026-11-27').getByRole('button').count(), 0)
      await assertMasked(page, ['59', '67', '88'])
      for (const metric of ['Очки', 'Подборы', 'Передачи', 'Минуты']) {
        for (let direction = 0; direction < 2; direction++) {
          await table.getByRole('button', { name: metric, exact: true }).click()
          const dates = await table
            .locator('tbody time')
            .evaluateAll((nodes) => nodes.map((node) => node.dateTime))
          assert.deepEqual(
            dates.filter((date) => date >= '2026-11-25'),
            ['2026-11-27', '2026-11-26', '2026-11-25'],
          )
          assert.ok(dates.indexOf('2026-11-27') >= 7)
        }
      }
      if (aggregateFirst) {
        await screenshot(page, 'protected-375')
        await gate.click()
        assert.equal(await page.locator('[data-metric]').count(), 32)
        assert.equal(await page.locator('.player-chart title').count(), 7)
        await assertMasked(page, ['59', '67', '88'])
        await screenshot(page, 'aggregate-only-375')
        await gameReveal.click()
      } else {
        await gameReveal.click()
        assert.equal(
          await row(page, '2026-11-25').getByRole('cell', { name: '59', exact: true }).count(),
          1,
        )
        assert.equal(await page.locator('.pa-primary, .pa-trend, [data-metric]').count(), 0)
        await gate.waitFor()
        await assertMasked(page, ['67', '88'])
        await screenshot(page, 'game-only-375')
        await gate.click()
      }
      await page.locator('.player-chart title').first().waitFor({ state: 'attached' })
      assert.equal(await page.locator('.player-chart title').count(), 8)
      assert.equal(await page.locator('.player-chart [aria-label$=" · 59"]').count(), 1)
      await assertMasked(page, ['67', '88'])
      assert.equal(run.requests.length, 1)
      await page.reload()
      await page.locator('.pa-trend').waitFor()
      assert.equal(
        await row(page, '2026-11-25').getByRole('cell', { name: '59', exact: true }).count(),
        1,
      )
      await page.clock.setFixedTime(new Date('2026-11-27T20:00:00Z'))
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
      await gate.waitFor()
      assert.equal(await page.locator('.pa-primary, .pa-trend, [data-metric]').count(), 0)
      assert.equal(
        await row(page, '2026-11-25').getByRole('cell', { name: '59', exact: true }).count(),
        1,
      )
      await assertMasked(page, ['67', '88'])
      assert.equal(run.requests.length, 2)
    } finally {
      await run.close()
    }
  }

  const historical = await session(origin, { width: 375, height: 812 })
  try {
    await historical.go()
    await historical.page.locator('.pa-trend').waitFor()
    await historical.page.getByRole('button', { name: 'Без спойлеров', exact: true }).click()
    assert.equal(await historical.page.locator('[data-metric]').count(), 32)
    assert.equal(await historical.page.locator('.player-chart title').count(), 7)
  } finally {
    await historical.close()
  }
}

async function checkStates(origin) {
  for (const variant of ['trade', 'unconfirmed', 'no-stats', 'no-log', 'partial', '15-games']) {
    const snapshot = structuredClone(fixture.default)
    if (variant === 'trade') {
      Object.assign(snapshot.player, {
        name: 'Alexandros Konstantinos Antetokounmpo de los Santos Fernández',
        position: 'Combo Guard / Forward',
        height: '6-11',
        weight: '242 lb',
        number: '34',
      })
      Object.assign(snapshot.detail, { currentTeam: 'DAL', birthDate: '1994-12-06' })
    }
    if (variant === 'unconfirmed') snapshot.detail.currentTeam = null
    if (variant === 'no-stats') snapshot.player.stats = null
    if (variant === 'no-log') snapshot.detail.games = []
    if (variant === 'partial') {
      Object.assign(snapshot.player.stats, { fg: null, ft: 0, ftm: 0, fta: 3 })
      snapshot.detail.games.forEach((game) => {
        game.min = null
      })
    }
    if (variant === '15-games') {
      snapshot.detail.games.unshift(
        ...Array.from({ length: 7 }, (_, index) => ({
          ...snapshot.detail.games[0],
          date: '2026-10-' + (21 + index),
          gameId: null,
        })),
      )
    }
    const width = variant === '15-games' ? 1440 : 320
    const run = await session(
      origin,
      { width, height: width === 320 ? 600 : 900 },
      {
        snapshot,
        logoError: variant === 'unconfirmed',
      },
    )
    const { page } = run
    try {
      await run.go()
      await page.getByRole('heading', { name: snapshot.player.name }).waitFor()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, variant)
      assert.equal(run.requests.length, 1)
      if (variant === 'trade') {
        assert.deepEqual(
          await page
            .locator('.pa-team a')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))),
          ['/teams/LAL', '/teams/DAL'],
        )
        const facts = await page.locator('.pa-facts dd').allTextContents()
        assert.deepEqual(facts, ['Combo Guard / Forward', '№ 34', '31 лет', '6-11', '242 lb'])
        await page
          .locator('.pa-team img')
          .evaluateAll((images) => Promise.all(images.map((img) => img.decode())))
      }
      if (variant === 'unconfirmed') {
        await page.locator('.pa-team .gc-team-fallback').waitFor()
        assert.equal(await page.locator('.pa-team a').count(), 1)
        assert.ok((await page.locator('.pa-affiliation').innerText()).includes('Не подтверждена'))
      }
      if (variant === 'no-stats') {
        assert.equal(await page.locator('[data-metric], .pa-shooting').count(), 0)
        await page.getByText('Подтверждённых средних за сезон пока нет.').first().waitFor()
        assert.equal(await page.locator('.player-log tbody tr').count(), 8)
      }
      if (variant === 'no-log') {
        assert.equal(await page.locator('.pa-trend').count(), 0)
        await page.getByText('Журнал матчей пока недоступен.').waitFor()
        assert.equal(await page.locator('[data-metric]').count(), 32)
      }
      if (variant === 'partial') {
        const tracks = page.locator('.pa-shot-track')
        assert.equal(await tracks.nth(0).locator('span').count(), 0)
        assert.equal(
          await tracks
            .nth(2)
            .locator('span')
            .evaluate((node) => node.style.width),
          '0%',
        )
        assert.equal(await page.locator('[data-metric="fg"] td').textContent(), '—')
        assert.match(await page.locator('[data-metric="ft"] td').textContent(), /^0\s*%$/)
        await page.locator('.pa-trend').getByRole('button', { name: 'Минуты', exact: true }).tap()
        await page.getByText('Для этого показателя нет видимых значений.').waitFor()
        assert.equal(await page.locator('.player-chart').count(), 0)
      }
      if (variant === '15-games') {
        assert.equal(await page.locator('.player-log tbody tr').count(), 15)
        const size = await page
          .locator('.stat-table-scroll')
          .evaluate((node) => [node.clientHeight, node.scrollHeight])
        assert.ok(size[0] <= 376 && size[1] > size[0])
        assert.ok(
          await page
            .locator('.pa-log-panel')
            .evaluate(
              (node) => node.offsetHeight - document.querySelector('.pa-trend').offsetHeight < 145,
            ),
        )
        await screenshot(page, '15-games-1440')
        const region = page.getByRole('region', { name: 'Журнал матчей игрока' })
        await region.focus()
        await region.press('PageDown')
        await page.waitForFunction(() => document.querySelector('.stat-table-scroll').scrollTop > 0)
        await region.press('End')
        await page.waitForFunction(() => {
          const scroll = document.querySelector('.stat-table-scroll')
          const row = scroll.querySelector('tbody tr:last-child')
          return row.getBoundingClientRect().bottom <= scroll.getBoundingClientRect().bottom + 1
        })
      } else {
        await screenshot(page, variant + '-320', true)
      }
    } finally {
      await run.close()
    }
  }

  const pending = Promise.withResolvers()
  const reload = await session(
    origin,
    { width: 375, height: 812 },
    { pending: pending.promise, failures: 1 },
  )
  try {
    await reload.go()
    await reload.page.locator('.player-analytics .state-card--loading[aria-busy=true]').waitFor()
    await screenshot(reload.page, 'loading-375')
    pending.resolve()
    await reload.page.getByText('Профиль недоступен').waitFor()
    await screenshot(reload.page, 'error-375')
    await reload.page.getByRole('button', { name: 'Повторить запрос' }).click()
    await reload.page.locator('.pa-primary').waitFor()
    assert.equal(reload.requests.length, 2)
  } finally {
    pending.resolve()
    await reload.close()
  }
}

try {
  if (baseline) {
    const before = await startServer(baseline, 'before')
    try {
      await captureDefault(before.origin, 'before')
    } finally {
      await before.server.close()
    }
  }
  const after = await startServer(root, 'after')
  try {
    await captureDefault(after.origin, 'after')
    await writeFile(
      path.join(output, 'measurements.json'),
      JSON.stringify(measurements, null, 2) + '\n',
    )
    await checkInteractions(after.origin)
    await checkSpoilers(after.origin)
    await checkStates(after.origin)
  } finally {
    await after.server.close()
  }
  console.log('Issue #82: Player Analytics capture, interactions, Spoiler Mode and states passed')
} finally {
  await browser.close()
}
