import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, realpath, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { chromium, request } from 'playwright'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const logoEvidence = process.argv.includes('--logo-evidence')
const usePlaywrightLogoFetch = process.argv.includes('--playwright-logo-fetch')
const out = path.resolve(
  process.env.HUB_OUTPUT ?? path.join(root, 'artifacts', logoEvidence ? 'issue-72' : 'issue-70'),
)
const fixturePath = new URL('./fixtures/nba-hub.synthetic.json', import.meta.url)
const fixtureBytes = await readFile(fixturePath)
const fixture = JSON.parse(fixtureBytes)
const baseline = process.env.HUB_BASELINE_ROOT
const sizes = [
  ['desktop', 1440, 900],
  ['mobile', 375, 812],
  ['narrow', 320, 600],
  ['tablet', 768, 1024],
]
const revision = (cwd) =>
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
const today = fixture.today
const previous = '2026-11-23'
const next = '2026-11-25'
const noGames = '2026-11-26'
const table = (page) => page.locator('.overview-mini-row')
const board = (page) => page.locator('.home-scoreboard')
const rows = (page) => page.locator('.home-game-list .gc-score-row')
const favoriteCards = (page) => page.locator('.home-favorite-card')
const button = (page, name) => page.getByRole('button', { name, exact: true })
const gameDetails = (page) =>
  rows(page)
    .first()
    .getByRole('link', { name: /^Открыть матч:/ })
const snapshotError = (code) => ({
  code,
  message: 'Синтетический ответ',
  retryable: true,
  provider: null,
  upstreamStatus: null,
})
const metadata = (meta, mode) => ({
  ...meta,
  isStale: mode === 'stale',
  refreshError: mode === 'refreshError' ? snapshotError('storage_unavailable') : null,
})

const open = (page, origin, date = '') => page.goto(origin + '/' + (date ? '?date=' + date : ''))
const screenshot = (page, name, fullPage = false) =>
  page.screenshot({ path: path.join(out, name + '.png'), fullPage, animations: 'disabled' })
const crop = (locator, name) =>
  locator.screenshot({ path: path.join(out, name + '.png'), animations: 'disabled' })
const routeDate = (url) => url.pathname === '/' && url.searchParams.get('date')
const delay = () => new Promise((resolve) => setTimeout(resolve, 550))
const measurements = {
  head: revision(root),
  baselineHead: baseline ? revision(baseline) : null,
  baseline: {},
  implementation: {},
}
const failures = []
const logoIds = { BOS: '1610612738', CHI: '1610612741', LAL: '1610612747', MIN: '1610612750' }
const logoSelector = '.home-hub .gc-team-logo'
const logoClient = usePlaywrightLogoFetch && logoEvidence ? await request.newContext() : null
const svgBodies = new Map()

function fetchLogo(url) {
  if (!svgBodies.has(url)) {
    svgBodies.set(
      url,
      (async () => {
        const response = await logoClient.get(url, { maxRedirects: 0, timeout: 10_000 })
        try {
          assert.equal(response.status(), 200, url)
          assert.match(response.headers()['content-type'] ?? '', /^image\/svg\+xml/)
          return await response.body()
        } finally {
          await response.dispose()
        }
      })(),
    )
  }
  return svgBodies.get(url)
}

async function serve(appRoot, port) {
  const server = await createServer({
    root: appRoot,
    configFile: path.join(appRoot, 'vite.config.ts'),
    cacheDir: path.join(appRoot, 'node_modules', '.vite-issue70-' + port),
    logLevel: 'error',
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      ws: false,
      fs: { allow: [appRoot, await realpath(path.join(appRoot, 'node_modules'))] },
    },
  })
  await server.listen()
  return server
}

async function configure(browser, origin, width, height, options = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    timezoneId: fixture.viewerTimeZone,
    locale: 'ru-RU',
    ...(width < 400 ? { hasTouch: true } : {}),
  })
  const modes = { games: 'full', standings: 'full', ...options.modes }
  const requests = []
  const logoRequests = new Set()
  await ctx.addInitScript(
    ({ favorites, spoiler, date, storageDisabled }) => {
      if (storageDisabled) {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('Disabled', 'SecurityError')
          },
        })
        return
      }
      if (sessionStorage.getItem('hub70-fixtures-initialized')) return
      sessionStorage.setItem('hub70-fixtures-initialized', '1')
      for (const [kind, ids] of Object.entries(favorites))
        localStorage.setItem('buzzerboard.favorite-' + kind + '.v1', JSON.stringify(ids))
      if (spoiler)
        localStorage.setItem(
          'buzzerboard:spoilers:v1',
          JSON.stringify({ enabled: true, day: date }),
        )
    },
    {
      favorites: options.favorites ?? fixture.favorites,
      spoiler: options.spoiler,
      date: today,
      storageDisabled: options.storageDisabled,
    },
  )
  await ctx.route(
    (url) => url.origin !== origin || url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) {
        if (url.hostname !== 'cdn.nba.com')
          failures.push('Unexpected external request ' + url.hostname)
        const imageId = /^\/logos\/nba\/(\d+)\/primary\/L\/logo\.svg$/.exec(url.pathname)?.[1]
        if (
          url.origin === 'https://cdn.nba.com' &&
          imageId &&
          route.request().method() === 'GET' &&
          route.request().resourceType() === 'image'
        ) {
          logoRequests.add(imageId)
          if (options.logos === 'live') {
            if (!logoClient) return route.continue()
            // Use the same response bytes when the browser transport cannot reach the public SVG.
            return route.fulfill({ contentType: 'image/svg+xml', body: await fetchLogo(url.href) })
          }
          if (options.logos === 'error') return route.fulfill({ status: 503 })
        }
        return route.abort()
      }
      requests.push(url.pathname + url.search)
      if (route.request().method() !== 'GET') {
        failures.push(route.request().method() + ' ' + url.pathname)
        return route.abort()
      }
      const error = (code) =>
        route.fulfill({ status: 503, json: { error: snapshotError(code), requestId: null } })
      if (url.pathname === '/api/games') {
        const date = url.searchParams.get('date')
        const mode = modes.games
        if (mode === 'loading') await delay()
        if (mode === 'error') return error('storage_unavailable')
        if (mode === 'miss' || !fixture.days[date]) return error('cache_miss')
        const { data, meta } = fixture.days[date]
        const games =
          mode === 'spoilerStatus' && date === today
            ? data.map((game, index) => (index === 4 ? { ...game, status: 'canceled' } : game))
            : mode === 'futureStatus' && date === next
              ? data.map((game, index) =>
                  index === 0
                    ? { ...game, status: 'final', score: { away: 179, home: 180 } }
                    : game,
                )
              : data
        return route.fulfill({ json: { data: games, meta: metadata(meta, mode) } })
      }
      if (url.pathname === '/api/standings') {
        assert.equal(url.searchParams.get('seasonEndYear'), '2027')
        const mode = modes.standings
        if (mode === 'loading') await delay()
        if (mode === 'error') return error('storage_unavailable')
        if (mode === 'miss') return error('cache_miss')
        const { data, meta } = fixture.standings
        const east = data.filter((row) => row.conference === 'east')
        const west = data.filter((row) => row.conference === 'west')
        const standings =
          mode === 'partial' ? [...east.slice(0, 8), ...west] : mode === 'oneMissing' ? east : data
        return route.fulfill({ json: { data: standings, meta: metadata(meta, mode) } })
      }
      if (url.pathname === '/api/players') {
        return route.fulfill({
          json: {
            source: 'bbs',
            seasonEndYear: 2027,
            fetchedAt: fixture.clock,
            isStale: false,
            coverage: {
              providerRows: 2,
              total: 2,
              checked: 2,
              averages: 0,
              enriched: 0,
              boxLinks: 0,
            },
            players: fixture.players.map((player) => ({
              ...player,
              team: null,
              position: null,
              number: null,
              height: null,
              weight: null,
              stats: null,
            })),
          },
        })
      }
      if (url.pathname.startsWith('/api/games/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/games/'.length))
        const snapshot = fixture.days[url.searchParams.get('date')]
        const game = snapshot?.data.find((record) => record.id === id)
        if (game)
          return route.fulfill({
            json: {
              data: { game, boxScore: null },
              meta: snapshot.meta,
              boxScoreMeta: null,
              boxScoreAvailability: 'unavailable',
            },
          })
      }
      failures.push('Unexpected API ' + url.pathname)
      return error('cache_miss')
    },
  )
  const page = await ctx.newPage()
  page.setDefaultTimeout(10_000)
  page.on('pageerror', (error) => failures.push(error.message))
  await page.clock.setFixedTime(new Date(fixture.clock))
  return { ctx, page, modes, requests, logoRequests }
}

async function measure(page, before) {
  return page.evaluate((before) => {
    const fold = Math.min(
      innerHeight,
      document.querySelector('.gc-mobile-nav')?.getBoundingClientRect().top || innerHeight,
    )
    const selectors = {
      games: before ? '.overview-scoreboard .gc-score-row' : '.home-game-list .gc-score-row',
      standings: '.overview-mini-row',
      favorites: '.home-favorite-card',
    }
    const groups = Object.fromEntries(
      Object.entries(selectors).map(([key, value]) => {
        const rects = [...document.querySelectorAll(value)].map((el) => el.getBoundingClientRect())
        return [
          key,
          {
            firstY: rects[0] ? Math.round(rects[0].top * 10) / 10 : null,
            scrollToFirst: rects[0] ? Math.max(0, Math.ceil(rects[0].bottom - fold)) : null,
            fullBeforeFold: rects.filter((rect) => rect.bottom <= fold).length,
            rows: rects.length,
          },
        ]
      }),
    )
    const font = (selector) => {
      const el = document.querySelector(selector)
      return el ? getComputedStyle(el).fontSize : null
    }
    return {
      viewport: [innerWidth, innerHeight],
      fold,
      groups,
      width: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      teamFont: font(selectors.games + ' .gc-team-name'),
      scoreFont: font(
        before ? '.overview-scoreboard .gc-score' : '.home-game-list .gc-scoreboard-numbers',
      ),
      fonts: Array.from(document.fonts).filter(
        (font) => font.family.includes('Manrope') && font.status === 'loaded',
      ).length,
    }
  }, before)
}

async function checkLogoSlots(page, live) {
  await page.waitForFunction(
    ({ selector, live }) => {
      const slots = [...document.querySelectorAll(selector)]
      return (
        slots.length === 16 &&
        slots.every((slot) => {
          const image = slot.querySelector('img')
          return live
            ? image?.complete && image.naturalWidth > 0
            : slot.querySelector('.gc-team-fallback')
        })
      )
    },
    { selector: logoSelector, live },
  )
  const loadedIds = await page.locator(logoSelector).evaluateAll((slots) =>
    slots.map((slot) => ({
      id: slot.querySelector('img')?.src.split('/')[5],
      width: slot.getBoundingClientRect().width,
    })),
  )
  assert(
    loadedIds.every(({ width }) => width >= 18),
    'A team logo has no visible footprint',
  )
  if (live)
    for (const [team, id] of Object.entries(logoIds))
      assert(
        loadedIds.some((logo) => logo.id === id),
        team + ' logo did not load',
      )
}

async function captureLogoFallbacks(browser, origin) {
  for (const [name, width, height] of sizes) {
    const { ctx, page } = await configure(browser, origin, width, height, {
      logos: name === 'mobile' ? 'error' : 'blocked',
    })
    try {
      await open(page, origin)
      await checkLogoSlots(page, false)
      await page.evaluate(() => document.fonts.ready)
      const result = await measure(page, false)
      assert.equal(result.width, width)
      assert.equal(
        result.groups.games.fullBeforeFold,
        measurements.implementation[name].groups.games.fullBeforeFold,
      )
      await screenshot(page, 'fallback-' + name)
      await screenshot(page, 'fallback-' + name + '-full', true)
    } finally {
      await ctx.close()
    }
  }
  const { ctx, page } = await configure(browser, origin, 375, 812, { logos: 'live' })
  try {
    await page.goto(origin + '/games?date=' + today)
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('.gc-scoreboard-row img')).some(
        (image) => image.src.includes('/1610612738/') && image.complete && image.naturalWidth > 0,
      ),
    )
    await screenshot(page, 'game-center')
  } finally {
    await ctx.close()
  }
}

async function regularDay(browser, origin, before = false) {
  const prefix = before ? 'main' : 'hub'
  const legacy = before && !logoEvidence
  for (const [name, width, height] of sizes) {
    const { ctx, page, requests, logoRequests } = await configure(browser, origin, width, height, {
      logos: logoEvidence && !before ? 'live' : 'blocked',
    })
    try {
      await open(page, origin)
      await table(page).first().waitFor()
      await (legacy ? page.locator('.overview-scoreboard .gc-score-row') : rows(page))
        .last()
        .waitFor()
      await page.evaluate(() => document.fonts.ready)
      const result = await measure(page, legacy)
      if (result.width !== width) {
        await screenshot(page, prefix + '-' + name + '-overflow', true)
        console.error(
          await page.evaluate(() =>
            [...document.querySelectorAll('.home-hub *')]
              .filter(
                (el) =>
                  el.getBoundingClientRect().right > innerWidth &&
                  el.getBoundingClientRect().width > 1,
              )
              .map((el) => [
                el.className,
                el.getBoundingClientRect().right,
                el.textContent?.slice(0, 80),
              ]),
          ),
        )
      }
      assert.equal(result.width, width, name)
      assert.equal(result.groups.games.rows, legacy ? 4 : 5, name)
      assert.equal(result.groups.standings.rows, legacy ? 5 : 4)
      assert.ok(result.fonts >= 2)
      if (!before) {
        await checkLogoSlots(page, logoEvidence)
        for (const [team, id] of Object.entries(logoIds))
          assert(logoRequests.has(id), team + ' was not requested')
        assert.ok(
          result.groups.games.fullBeforeFold >= (name === 'narrow' ? 2 : 5),
          JSON.stringify(result),
        )
        assert.deepEqual(requests.sort(), [
          '/api/games?date=' + today,
          '/api/standings?seasonEndYear=2027',
        ])
      }
      measurements[before ? 'baseline' : 'implementation'][name] = result
      await screenshot(page, prefix + '-' + name)
      await screenshot(page, prefix + '-' + name + '-full', true)
      if (!before && name === 'mobile') {
        await crop(page.locator('.home-standings'), 'standings-east')
        await crop(page.locator('.home-favorites'), 'favorites-teams')
      }
    } finally {
      await ctx.close()
    }
  }
}

async function choose(page, name, option) {
  await page.getByRole('combobox', { name, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function journeys(browser, origin) {
  const { ctx, page, requests } = await configure(browser, origin, 375, 812)
  try {
    await open(page, origin)
    await rows(page).first().waitFor()
    assert.equal(
      await page.getByRole('combobox', { name: 'Подборка матчей' }).innerText(),
      'Вся NBA',
    )
    assert.equal(await rows(page).first().locator('time').innerText(), '02:00')
    assert.equal(
      await board(page).locator('.gc-scoreboard-time').first().locator('span').innerText(),
      '25.11',
    )
    await choose(page, 'Подборка матчей', 'Мои матчи')
    assert.equal(await rows(page).count(), 3)
    assert.match(await rows(page).nth(1).getAttribute('aria-label'), /Minnesota Timberwolves/)
    await screenshot(page, 'filter-favorites')
    await choose(page, 'Статус матча', 'Перенесённые')
    await board(page).getByText('Нет матчей из избранного по этому фильтру').waitFor()
    await screenshot(page, 'filter-no-matches')
    await button(page, 'Вся NBA').click()
    assert.equal(await rows(page).count(), 5)
    await choose(page, 'Статус матча', 'Перенесённые')
    assert.equal(await rows(page).count(), 1)
    assert.equal(await board(page).locator('.gc-compact-status').innerText(), 'Перенесён')
    await screenshot(page, 'postponed')
    await choose(page, 'Статус матча', 'Все статусы')
    await button(page, 'Запад').click()
    assert.equal(await table(page).count(), 4)
    await crop(page.locator('.home-standings'), 'standings-west')
    const players = page.getByRole('button', { name: /^Игроки 1$/ })
    assert.equal(requests.filter((url) => url.startsWith('/api/players')).length, 0)
    await players.click()
    const player = favoriteCards(page).getByRole('link', { name: /Ethan Clarke/ })
    assert.equal(
      await player.getAttribute('href'),
      '/players/' + encodeURIComponent(fixture.players[0].id),
    )
    assert.equal(requests.filter((url) => url === '/api/players?seasonEndYear=2027').length, 1)
    await crop(page.locator('.home-favorites'), 'favorites-players')
    await page.getByRole('button', { name: /^Матчи 1$/ }).click()
    assert.match(await favoriteCards(page).first().innerText(), /MIN – CHI/)
    await crop(page.locator('.home-favorites'), 'favorites-games')
    await favoriteCards(page)
      .getByRole('button', { name: /^Убрать/ })
      .click()
    assert.equal(
      await page.evaluate(() => localStorage.getItem('buzzerboard.favorite-games.v1')),
      '[]',
    )
    await rows(page).nth(1).getByRole('button', { name: 'Добавить матч в избранное' }).click()
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('buzzerboard.favorite-games.v1'))),
      fixture.favorites.games,
    )

    await page.evaluate(() => scrollTo(0, 0))
    const calendar = button(page, 'Выбрать игровую дату NBA')
    await calendar.focus()
    await screenshot(page, 'calendar-keyboard-focus')
    await calendar.press('Enter')
    const dialog = page.locator('.gc-calendar-popover')
    await dialog.waitFor()
    await screenshot(page, 'calendar-open')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert(await calendar.evaluate((el) => el === document.activeElement))
    await calendar.press('Enter')
    await dialog.locator('[data-value="' + noGames + '"]').click()
    await page.waitForURL((url) => routeDate(url) === noGames)
    await board(page).getByText('В этот день матчей нет').waitFor()
    await screenshot(page, 'no-games')
    await page.goBack()
    await page.waitForURL(origin + '/')
    await page.goForward()
    await page.waitForURL((url) => routeDate(url) === noGames)
    await page.reload()
    await board(page).getByText('В этот день матчей нет').waitFor()
    await page.getByRole('button', { name: /Пред. день/ }).click()
    await page.waitForURL((url) => routeDate(url) === next)
    await rows(page).first().waitFor()
    await screenshot(page, 'scheduled')
    const details = new URL(await gameDetails(page).getAttribute('href'), origin)
    assert.equal(details.searchParams.get('date'), next)
    assert.equal(details.searchParams.get('from'), '/?date=' + next)
    await gameDetails(page).click()
    await page.waitForURL((url) => url.pathname === details.pathname)
    await page.locator('.game-detail-back').click()
    await page.waitForURL(origin + '/?date=' + next)
    await board(page)
      .getByRole('link', { name: /^Все матчи/ })
      .click()
    await page.waitForURL(
      (url) => url.pathname === '/games' && url.searchParams.get('date') === next,
    )

    await open(page, origin, '2026-11-31')
    await rows(page).first().waitFor()
    assert.match(await board(page).locator('header p').innerText(), /24 ноября/)
    await page.getByRole('button', { name: /^Вчера/ }).tap()
    await page.waitForURL((url) => routeDate(url) === previous)
    await rows(page).first().waitFor()
    assert.equal(await rows(page).count(), 4)
    await screenshot(page, 'finals')
    const links = await page
      .locator('.home-hub a')
      .evaluateAll((links) => links.map((link) => new URL(link.href).pathname))
    for (const pathname of ['/games', '/standings', '/teams', '/players', '/favorites', '/news'])
      assert(links.includes(pathname), pathname)
  } finally {
    await ctx.close()
  }
}

async function states(browser, origin) {
  for (const [name, options, verify] of [
    [
      'favorites-empty',
      { favorites: {} },
      async (page) => {
        await page.getByText('Добавьте любимую команду').waitFor()
        await crop(page.locator('.home-favorites'), 'favorites-empty-panel')
      },
    ],
    [
      'storage-unavailable',
      { storageDisabled: true },
      async (page) => {
        await rows(page).first().waitFor()
        await rows(page).first().getByRole('button', { name: 'Добавить матч в избранное' }).click()
        assert.equal(
          await rows(page)
            .first()
            .getByRole('button', { name: 'Убрать матч из избранного' })
            .count(),
          1,
        )
      },
    ],
    [
      'loading',
      { modes: { games: 'loading', standings: 'loading' } },
      async (page) => {
        await page.locator('.home-scoreboard [aria-busy=true]').waitFor()
      },
    ],
    [
      'games-error',
      { modes: { games: 'error' } },
      async (page, modes) => {
        await board(page).getByText('Не удалось загрузить матчи').waitFor()
        await table(page).first().waitFor()
        await screenshot(page, 'games-error')
        modes.games = 'full'
        await board(page).getByRole('button', { name: 'Повторить' }).click()
        await rows(page).first().waitFor()
      },
    ],
    [
      'games-cache-miss',
      { modes: { games: 'miss' } },
      async (page) => {
        await board(page).getByText('За этот день пока нет данных').waitFor()
        await table(page).first().waitFor()
      },
    ],
    [
      'standings-error',
      { modes: { standings: 'error' } },
      async (page, modes) => {
        const panel = page.locator('.home-standings')
        await panel.getByText('Таблица пока недоступна').waitFor()
        await rows(page).first().waitFor()
        await crop(panel, 'standings-error-panel')
        modes.standings = 'full'
        await panel.getByRole('button', { name: 'Повторить' }).click()
        await table(page).first().waitFor()
      },
    ],
    [
      'standings-cache-miss',
      { modes: { standings: 'miss' } },
      async (page) => {
        await page.getByText('Снимка таблицы пока нет').waitFor()
        await crop(page.locator('.home-standings'), 'standings-cache-miss-panel')
      },
    ],
    [
      'standings-partial',
      { modes: { standings: 'partial' } },
      async (page) => {
        await page.getByText('Получено 8 из 15 команд.').waitFor()
        assert.equal(await table(page).count(), 4)
        assert.equal(
          await page
            .locator('.home-standings')
            .getByText(/\bGB\b/)
            .count(),
          0,
        )
        await crop(page.locator('.home-standings'), 'standings-partial-panel')
      },
    ],
    [
      'standings-one-missing',
      { modes: { standings: 'oneMissing' } },
      async (page) => {
        await button(page, 'Запад').click()
        await page.getByText('Нет данных по конференции «Запад»').waitFor()
        await crop(page.locator('.home-standings'), 'standings-one-missing-panel')
        await button(page, 'Восток').click()
        assert.equal(await table(page).count(), 4)
      },
    ],
    [
      'stale',
      { modes: { games: 'stale', standings: 'stale' } },
      async (page) => {
        await board(page).getByText('Данные устарели ·', { exact: true }).waitFor()
        assert.equal(await rows(page).count(), 5)
        await crop(page.locator('.home-standings'), 'standings-stale-panel')
      },
    ],
    [
      'refetch-error',
      { modes: { games: 'refreshError', standings: 'refreshError' } },
      async (page) => {
        await board(page)
          .getByText(/Показан последний загруженный снимок/)
          .waitFor()
        assert.equal(await rows(page).count(), 5)
        await crop(page.locator('.home-standings'), 'standings-refetch-error-panel')
      },
    ],
  ]) {
    const { ctx, page, modes } = await configure(browser, origin, 375, 812, options)
    try {
      await open(page, origin)
      await verify(page, modes)
      if (!['games-error'].includes(name)) {
        await page.evaluate(() => scrollTo(0, 0))
        await screenshot(page, name)
      }
    } finally {
      await ctx.close()
    }
  }
}

async function spoiler(browser, origin) {
  const { ctx, page } = await configure(browser, origin, 375, 812, {
    spoiler: true,
    modes: { games: 'spoilerStatus', standings: 'partial' },
    logos: logoEvidence ? 'live' : 'blocked',
  })
  try {
    await open(page, origin)
    await rows(page).first().waitFor()
    if (logoEvidence)
      await page.waitForFunction(() => {
        const image = document.querySelector('.gc-score-row--protected .gc-team-logo img')
        return image?.complete && image.naturalWidth > 0
      })
    const home = page.locator('.home-hub')
    assert.equal(
      await home
        .locator(
          '.gc-scoreboard-numbers, .gc-match-team--winner, .gc-scoreboard-team--loser, .home-mini-table',
        )
        .count(),
      0,
    )
    assert.equal(await home.getByRole('combobox', { name: 'Статус матча' }).count(), 0)
    assert.equal(await home.getByRole('link', { name: /Результат скрыт/ }).count(), 4)
    const html = await home.innerHTML()
    assert(!html.includes('111 : 118') && !html.includes('.789') && !html.includes('8 из 15'))
    assert.match(
      await rows(page)
        .last()
        .getByRole('link', { name: /Отменён/ })
        .getAttribute('aria-label'),
      /Отменён/,
    )
    await screenshot(page, 'spoiler-on')
    await crop(page.locator('.home-standings'), 'spoiler-table-gate')
    const first = rows(page).first()
    await first.getByRole('button', { name: 'Показать результат' }).click()
    assert.equal(await home.locator('.gc-scoreboard-numbers').count(), 1)
    assert.match(
      await first.getByRole('link', { name: /^Открыть матч:/ }).getAttribute('aria-label'),
      /111 : 118/,
    )
    await screenshot(page, 'spoiler-reveal')
    await page.getByRole('button', { name: /^Матчи 1$/ }).click()
    assert.doesNotMatch(await favoriteCards(page).first().innerText(), /124|113|Побед/)
    await favoriteCards(page).getByRole('link', { name: /MIN/ }).click()
    await page.waitForURL((url) => url.pathname.startsWith('/games/'))
    await page.getByRole('button', { name: 'Показать результат' }).waitFor()
    await page.locator('.game-detail-back').click()
    await page.waitForURL(origin + '/?date=' + today)
    await page.getByRole('button', { name: /^Вчера/ }).tap()
    await page.waitForURL((url) => routeDate(url) === previous)
    await rows(page).first().waitFor()
    assert.equal(await home.getByRole('link', { name: /Результат скрыт/ }).count(), 4)
    assert.equal(await home.locator('.gc-scoreboard-numbers').count(), 0)
    await screenshot(page, 'spoiler-yesterday')
  } finally {
    await ctx.close()
  }
  const future = await configure(browser, origin, 320, 600, {
    spoiler: true,
    modes: { games: 'futureStatus' },
  })
  try {
    await open(future.page, origin, next)
    await rows(future.page).first().waitFor()
    const markup = await board(future.page).innerHTML()
    assert(!markup.includes('179 : 180') && !markup.includes('Завершён'))
    assert.equal(
      await board(future.page)
        .getByRole('link', { name: /Ожидается/ })
        .count(),
      5,
    )
    await screenshot(future.page, 'spoiler-future')
  } finally {
    await future.ctx.close()
  }
}

async function comparison(browser) {
  const file = path.join(out, 'comparison.html')
  const boxes = (name, label) =>
    `<figure><figcaption>${label}</figcaption><a href="${name}.png"><img alt="${label}" src="${name}.png"></a></figure>`
  const style = `
    html{background:#0e121a;color:#edf4ff;font:700 16px/1.4 system-ui}
    body{max-width:1440px;margin:0 auto;padding:25px 32px}
    h1{margin:0 0 8px;font-size:34px}p{margin:0 0 18px;color:#afc1d7}
    section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}
    figure{margin:0}figcaption{margin-bottom:8px}
    img{display:block;max-width:100%;max-height:790px;border:1px solid #354962;border-radius:8px;background:#172334}
  `
  const markup = (name, label) =>
    `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>NBA Hub · сравнение</title><style>${style}</style><h1>NBA Hub · ${label}</h1><p>Одинаковые синтетические данные Terra · Vue baseline и реализация A</p><section>${boxes('main-' + name, 'Текущий main')}${boxes('hub-' + name, 'League Command Center · Vue')}</section>`
  const page = await browser.newPage()
  try {
    for (const [name, width, height] of sizes) {
      const contact = path.join(out, '.contact.html')
      await writeFile(contact, markup(name, width + ' × ' + height))
      await page.setViewportSize({
        width: name === 'desktop' ? 1480 : Math.max(780, width * 2 + 86),
        height: 540,
      })
      await page.goto(pathToFileURL(contact).href)
      assert(
        await page.evaluate(() =>
          [...document.images].every((image) => image.complete && image.naturalWidth > 0),
        ),
      )
      await screenshot(page, 'comparison-' + name, true)
      await unlink(contact)
    }
    await writeFile(
      file,
      markup('desktop', '1440 × 900') +
        '<p>См. также comparison-mobile.png, comparison-narrow.png, comparison-tablet.png.</p></html>',
    )
  } finally {
    await page.close()
  }
}

await mkdir(out, { recursive: true })
let baselineServer
let app
let browser
try {
  if (baseline) baselineServer = await serve(baseline, 4171)
  app = await serve(root, 4172)
  browser = await chromium.launch()
  if (baseline) await regularDay(browser, 'http://127.0.0.1:4171', true)
  const origin = 'http://127.0.0.1:4172'
  await regularDay(browser, origin)
  if (logoEvidence) await captureLogoFallbacks(browser, origin)
  await journeys(browser, origin)
  await states(browser, origin)
  await spoiler(browser, origin)
  if (baseline) await comparison(browser)
  assert.deepEqual(failures, [])
  await writeFile(path.join(out, 'measurements.json'), JSON.stringify(measurements, null, 2) + '\n')
  await writeFile(path.join(out, 'nba-hub.synthetic.json'), fixtureBytes)
  await writeFile(
    path.join(out, 'README.md'),
    [
      '# BuzzerBoard · Issue #' + (logoEvidence ? '72' : '70'),
      '',
      'Vue HEAD: `' + measurements.head + '`',
      'Baseline: `' + (measurements.baselineHead ?? 'not captured') + '`',
      '',
      'Screenshots at 1440×900, 375×812, 320×600 and 768×1024, with full-page variants and scenario crops.',
      'The viewport fold stops at fixed bottom navigation. Rows count only when completely visible.',
      'Measurements are in CSS pixels. The source fixture is from the Terra Issue #69 archive.',
      'Chromium uses Asia/Nicosia. API responses are mocked. No live provider calls.',
      logoEvidence
        ? 'After captures use authentic cdn.nba.com SVGs via ' +
          (usePlaywrightLogoFetch ? 'the Playwright HTTP client. ' : 'Chromium. ') +
          'Fallback captures simulate blocked requests or HTTP 503.'
        : 'External requests are blocked.',
      'Run: HUB_BASELINE_ROOT=/path/to/baseline node scripts/issue70-home-visual.mjs',
      '',
    ].join('\n'),
  )
  console.log(JSON.stringify(measurements, null, 2))
} finally {
  await browser?.close()
  await logoClient?.dispose()
  await app?.close()
  await baselineServer?.close()
}
