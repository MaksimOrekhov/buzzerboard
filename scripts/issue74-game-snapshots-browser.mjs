import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const fixture = JSON.parse(
  await readFile(new URL('./fixtures/nba-hub.synthetic.json', import.meta.url), 'utf8'),
)
const yesterday = '2026-11-23'
const tomorrow = '2026-11-25'

const wrongDate = (game) => ({
  ...game,
  nbaGameDate: '2026-11-22',
  status: 'final',
  score: { away: 181, home: 183 },
  scoreByPeriod: null,
})

const badMeta = (meta) => ({ ...meta, fetchedAt: 'invalid', rejectedRecords: -2 })

const cases = [
  {
    name: 'qa-01-wrong-date',
    date: yesterday,
    spoiler: true,
    change: (snapshot, game) => ({ ...snapshot, data: [wrongDate(game)] }),
  },
  {
    name: 'qa-02-start-time',
    change: (snapshot, game) => ({
      ...snapshot,
      data: [{ ...game, startsAt: 'not-a-timestamp' }],
    }),
  },
  {
    name: 'qa-03-score-domain',
    change: (snapshot, game) => ({
      ...snapshot,
      data: [{ ...game, status: 'final', score: { away: -15, home: 4.5 }, scoreByPeriod: null }],
    }),
  },
  {
    name: 'qa-07-metadata',
    change: (snapshot) => ({ ...snapshot, meta: badMeta(snapshot.meta) }),
  },
  {
    name: 'mixed-wrong-date',
    date: yesterday,
    spoiler: true,
    change: (snapshot, game) => ({ ...snapshot, data: [...snapshot.data, wrongDate(game)] }),
  },
]

export async function checkGameSnapshots({ browser, origin, output, syntheticBoxScore }) {
  await mkdir(output, { recursive: true })
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: 'ru-RU',
    timezoneId: 'Asia/Nicosia',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.clock.setFixedTime(new Date(fixture.clock))

  let scenario
  let boxMetaMode = null
  let heldRequest
  await context.route(
    (url) => url.origin !== origin || url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== origin || route.request().method() !== 'GET') return route.abort()
      if (url.pathname === '/api/standings') return route.fulfill({ json: fixture.standings })
      const date = url.searchParams.get('date')
      const day = fixture.days[date]
      if (!day) return route.abort()
      const game = day.data[0]
      const snapshot =
        date === (scenario?.date ?? fixture.today) && scenario ? scenario.change(day, game) : day
      if (url.pathname === '/api/games') {
        const held = heldRequest
        if (held && date === fixture.today) {
          await held.release.promise
          try {
            return await route.fulfill({ json: snapshot })
          } finally {
            held.finished.resolve()
          }
        }
        return route.fulfill({ json: snapshot })
      }
      if (url.pathname.startsWith('/api/games/')) {
        const returnedGame = snapshot.data.find(
          (item) => item.id === decodeURIComponent(url.pathname.split('/').at(-1)),
        )
        if (!returnedGame) return route.abort()
        const boxScore = boxMetaMode ? { ...syntheticBoxScore(game), players: [] } : null
        return route.fulfill({
          json: {
            data: { game: returnedGame, boxScore },
            meta: snapshot.meta,
            boxScoreMeta:
              boxMetaMode === 'invalid' ? badMeta(day.meta) : boxScore ? day.meta : null,
            boxScoreAvailability: boxScore ? 'available' : 'unavailable',
          },
        })
      }
      return route.abort()
    },
  )
  const open = (url) => page.goto(origin + url)
  const button = (name) => page.getByRole('button', { name, exact: true })
  const rows = page.locator('.gc-score-row')
  const detailsUrl = (date) =>
    '/games/' + encodeURIComponent(fixture.days[date].data[0].id) + '?date=' + date
  const capture = async (name) => {
    await page.evaluate(() => document.fonts.ready)
    const { width } = page.viewportSize()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width)
    await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' })
  }
  async function assertRejected(scope, tag) {
    const root = page.locator(scope)
    await root.getByRole('alert').waitFor()
    assert.equal(
      await root.locator('.gc-data-status, .home-game-count, .gc-game-count').count(),
      0,
      tag,
    )
    assert.equal(
      await root
        .locator(
          '.gc-score-row, .game-detail-side, .gc-match-team--winner, .gc-winner-marker, a[href^="/games/"]',
        )
        .count(),
      0,
      tag,
    )
    const labels = await root
      .locator('[aria-label], [title], title')
      .evaluateAll((nodes) =>
        nodes.map((node) => [
          node.getAttribute('aria-label'),
          node.getAttribute('title'),
          node.nodeName === 'title' ? node.textContent : null,
        ]),
      )
    assert.doesNotMatch(JSON.stringify(labels), /\b(?:181|183)\b|Победитель/)
    assert.doesNotMatch(await page.title(), /\b(?:181|183)\b|Победитель/)
    assert.doesNotMatch(
      await root.innerText(),
      /not-a-timestamp|-15|4[.,]5|записей: -2|\b(?:181|183)\b/,
    )
  }

  try {
    for (const test of cases) {
      scenario = test
      const date = test.date ?? fixture.today
      await open('/?date=' + date)
      const toggle = button('Без спойлеров')
      if (((await toggle.getAttribute('aria-pressed')) === 'true') !== Boolean(test.spoiler))
        await toggle.click()
      for (const [name, scope, url] of [
        ['home', '.home-scoreboard', '/?date=' + date],
        ['center', '.gc-games', '/games?date=' + date],
        ['details', '.game-details-view', detailsUrl(date)],
      ]) {
        if (name === 'details' && test.name === 'mixed-wrong-date') continue
        if (name !== 'home') await open(url)
        if (test.spoiler)
          assert.equal(await button('Без спойлеров').getAttribute('aria-pressed'), 'true')
        await assertRejected(scope, test.name + ' ' + name)
        await capture(test.name + '-' + name)
      }
    }

    scenario = null
    boxMetaMode = 'valid'
    await open(detailsUrl(fixture.today))
    if ((await button('Без спойлеров').getAttribute('aria-pressed')) === 'true')
      await button('Без спойлеров').click()
    await page.locator('.game-detail-data').waitFor()
    boxMetaMode = 'invalid'
    await page.reload()
    await page.locator('.game-detail-side > strong').first().waitFor()
    await page.getByText(/Снимки матча и статистики не совпадают/).waitFor()
    assert.equal(await page.locator('.game-detail-data').count(), 0)
    assert.equal(await page.locator('.game-detail-snapshots .gc-data-status').count(), 1)
    await capture('box-metadata-fallback')
    boxMetaMode = null

    await open('/games?date=' + yesterday)
    await rows.first().locator('.gc-scoreboard-numbers').waitFor()
    const cached = await rows.allTextContents()
    scenario = cases[4]
    await button('Обновить данные').click()
    await page.locator('.gc-games .gc-data-status--stale').waitFor()
    await page.getByText(/Не удалось обновить данные. Показаны последние/).waitFor()
    assert.deepEqual(await rows.allTextContents(), cached)
    for (const href of await rows
      .locator('a.gc-scoreboard-result')
      .evaluateAll((links) => links.map((link) => link.href)))
      assert.equal(new URL(href).searchParams.get('date'), yesterday)
    await capture('mixed-wrong-date-cached')

    scenario = null
    await open(detailsUrl(fixture.today))
    const score = page.locator('.game-detail-side > strong')
    await score.first().waitFor()
    const detailsScore = await score.allTextContents()
    await page.clock.setFixedTime(new Date(Date.parse(fixture.clock) + 120_000))
    await page.locator('.game-detail-back').click()
    const link = rows.first().locator('a.gc-scoreboard-result')
    await link.waitFor()
    scenario = { ...cases[0], date: fixture.today }
    await link.click()
    const detail = page.locator('.game-details-view')
    await detail.getByText(/Не удалось обновить данные. Показаны последние/).waitFor()
    assert.deepEqual(await score.allTextContents(), detailsScore)
    await detail.locator('.gc-data-status--stale').waitFor()
    await capture('details-wrong-date-cached')
    await button('Без спойлеров').click()
    await detail.getByRole('button', { name: 'Показать результат' }).waitFor()
    assert.equal(await score.count(), 0)
    assert.equal(
      await detail.getByText(/Не удалось обновить данные. Показаны последние/).count(),
      1,
    )

    // A malformed response held for an old key cannot affect the next selected date.
    scenario = { ...cases[4], date: fixture.today }
    heldRequest = { release: Promise.withResolvers(), finished: Promise.withResolvers() }
    const request = page.waitForRequest(
      (req) => req.url() === origin + '/api/games?date=' + fixture.today,
    )
    await open('/games?date=' + fixture.today)
    await request
    await button('Следующий день').click()
    await rows.last().waitFor()
    heldRequest.release.resolve()
    await heldRequest.finished.promise
    heldRequest = null
    const links = await rows
      .locator('a.gc-scoreboard-result')
      .evaluateAll((items) => items.map((link) => link.href))
    assert.equal(links.length, fixture.days[tomorrow].data.length)
    assert.ok(links.every((href) => new URL(href).searchParams.get('date') === tomorrow))
    assert.equal(await page.locator('.gc-games [role="alert"], .gc-scoreboard-numbers').count(), 0)
    await capture('delayed-wrong-date')

    scenario = null
    await button('Без спойлеров').click()
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 320 ? 600 : 900 })
      await open('/games?date=' + fixture.today)
      await rows.first().locator('.gc-scoreboard-numbers').waitFor()
      assert.equal(await rows.count(), fixture.days[fixture.today].data.length)
      await capture(width + '-valid-scoreboard')
    }
    assert.deepEqual(errors, [])
    console.log(
      'Issue #74: QA-01/02/03/07, mixed/refetch, box fallback and responsive scoreboard passed',
    )
  } finally {
    heldRequest?.release.resolve()
    await context.close()
  }
}
