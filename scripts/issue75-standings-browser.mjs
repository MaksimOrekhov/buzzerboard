import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const hub = JSON.parse(
  await readFile(new URL('./fixtures/nba-hub.synthetic.json', import.meta.url), 'utf8'),
)
const full = hub.standings
const east = full.data.filter((row) => row.conference === 'east')
const west = full.data.filter((row) => row.conference === 'west')
const unknownPcts = new Map()
for (const conference of [east, west]) {
  const [one, zero, negative, unknown] = conference.slice(0, 4)
  unknownPcts.set(one.team.abbreviation, 1)
  unknownPcts.set(zero.team.abbreviation, 0)
  unknownPcts.set(negative.team.abbreviation, -0.1)
  unknownPcts.set(unknown.team.abbreviation, null)
  unknownPcts.set(conference.at(-1).team.abbreviation, 1.42)
}
const partial = {
  ...full,
  data: [...east.slice(0, 7), east.at(-1), ...west].map((row) =>
    unknownPcts.has(row.team.abbreviation)
      ? { ...row, winPercentage: unknownPcts.get(row.team.abbreviation) }
      : row,
  ),
}
const badSeason = (seasonEndYear, mixed) => ({
  ...full,
  data: full.data.map((row, index) => (!mixed || index === 16 ? { ...row, seasonEndYear } : row)),
})

export async function checkStandingsSnapshots({ browser, origin, output }) {
  await mkdir(output, { recursive: true })
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: 'ru-RU',
    timezoneId: 'Asia/Nicosia',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.clock.setFixedTime(new Date(hub.clock))
  let day = full
  const requested = []
  await context.route(
    (url) => url.origin !== origin || url.pathname.startsWith('/api/'),
    (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== origin || route.request().method() !== 'GET') return route.abort()
      if (url.pathname === '/api/standings') {
        requested.push(url.searchParams.get('seasonEndYear'))
        return route.fulfill({ json: day })
      }
      if (url.pathname === '/api/games') {
        return route.fulfill({ json: hub.days[url.searchParams.get('date')] })
      }
      return route.abort()
    },
  )

  const visit = (pathname) => page.goto(origin + pathname)
  const button = (name) => page.getByRole('button', { name, exact: true })
  const mainTable = page.locator('.standings-table')
  const rows = mainTable.locator('tbody tr')
  const home = page.locator('.home-standings')
  const standings = page.locator('.standings-center')
  const gb = mainTable.getByRole('button', { name: /расчётному отставанию/ })
  const capture = async (name) => {
    await page.evaluate(() => document.fonts.ready)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      page.viewportSize().width,
      name,
    )
    await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' })
  }

  try {
    for (const [name, snapshot] of [
      ['wrong-season', badSeason(2026, false)],
      ['mixed-seasons', badSeason(2026, true)],
      ['unknown-season', badSeason(null, false)],
      ['mixed-unknown-season', badSeason(null, true)],
      ['malformed-meta', { ...full, meta: { ...full.meta, fetchedAt: '2026-11-31T12:00:00Z' } }],
    ]) {
      day = snapshot
      await visit('/standings')
      await standings.getByRole('alert').waitFor()
      assert.equal(await rows.count(), 0, name)
      assert.equal(await standings.locator('.gc-data-status, .rank-cell').count(), 0, name)
      await capture(name + '-standings')
      await visit('/')
      await home.getByRole('alert').waitFor()
      assert.equal(await home.locator('.overview-mini-row, .gc-data-status').count(), 0, name)
      await capture(name + '-hub')
    }

    day = partial
    for (const [width, height] of [
      [320, 600],
      [375, 812],
      [768, 1024],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height })
      await visit('/standings')
      await rows.first().waitFor()
      for (const [conference, count, source] of [
        ['Восток', 8, east],
        ['Запад', 15, west],
      ]) {
        await button(conference).click()
        assert.equal(await rows.count(), count)
        assert.equal(await mainTable.locator('.rank-cell').count(), 0)
        assert(await gb.isDisabled())
        await page
          .getByText(conference === 'Восток' ? /Получено 8 из 15 команд/ : /W–L и PCT неполны/)
          .waitFor()
        const pctHeader = mainTable.getByRole('button', { name: /проценту побед/ })
        const header = mainTable.locator('th[aria-sort]')
        const knownFirst = {
          ascending: source[1].team.displayName,
          descending: source[0].team.displayName,
        }
        for (const direction of ['descending', 'ascending']) {
          assert.equal(await header.getAttribute('aria-sort'), direction)
          assert.equal(
            await rows.first().locator('.table-team-name').textContent(),
            knownFirst[direction],
          )
          const cells = await rows.locator('.pct-cell').allTextContents()
          assert.equal(cells[0].trim(), direction === 'ascending' ? '.000' : '1.000')
          assert.deepEqual(
            cells.slice(-3).map((text) => text.trim()),
            ['—', '—', '—'],
          )
          await pctHeader.press('Enter')
        }
        // Scroll to a visible regression row for evidence on narrow screens.
        await rows.first().scrollIntoViewIfNeeded()
        await capture(width + '-' + source[0].conference + '-pct')
      }
    }

    await page.setViewportSize({ width: 375, height: 812 })
    await visit('/standings')
    await rows.first().waitFor()
    const [valid, , malformed] = east
    await button('Режим сравнения').click()
    await mainTable.getByRole('checkbox', { name: 'Сравнить ' + valid.team.displayName }).check()
    const box = mainTable.getByRole('checkbox', { name: 'Сравнить ' + malformed.team.displayName })
    await box.focus()
    await page.keyboard.press('Space')
    await button('Сравнить команды').click()
    const compare = page.getByRole('dialog', { name: 'Сравнение команд' })
    const pct = compare.getByRole('row', { name: 'Доля побед · PCT 1.000 —' })
    await pct.waitFor()
    await capture('pct-comparison')
    await page.keyboard.press('Escape')
    await compare.waitFor({ state: 'hidden' })
    assert(await button('Сравнить команды').evaluate((el) => document.activeElement === el))

    await visit('/')
    await home.locator('.overview-mini-row').first().waitFor()
    for (const [conference, source] of [
      ['Восток', east],
      ['Запад', west],
    ]) {
      await home.getByRole('button', { name: conference, exact: true }).click()
      const top = home.locator('.overview-mini-row').first()
      assert.match(await top.innerText(), new RegExp(source[0].team.displayName))
      assert.equal(await top.locator('td').last().innerText(), '1.000')
      assert.equal(await home.getByText(source.at(-1).team.displayName, { exact: true }).count(), 0)
    }
    await capture('hub-known-pct-first')

    // Reuse the same valid cache across the two interfaces when a new snapshot fails validation.
    day = full
    await visit('/')
    await home.locator('.overview-mini-row').first().waitFor()
    const startingRows = await home.locator('.overview-mini-row').allTextContents()
    await home.getByRole('link', { name: 'Открыть турнирную таблицу' }).click()
    await rows.first().waitFor()
    assert.equal(await rows.count(), 15)
    assert(await gb.isEnabled())
    const cachedRows = await rows.allTextContents()
    day = badSeason(2026, true)
    await button('Обновить данные').click()
    await standings.locator('.gc-data-status--stale').waitFor()
    await standings.getByText(/Показана последняя загруженная таблица/).waitFor()
    assert.deepEqual(await rows.allTextContents(), cachedRows)
    await capture('standings-stale-after-mixed-season')
    await page.goBack()
    await home.locator('.gc-data-status--stale').waitFor()
    assert.deepEqual(await home.locator('.overview-mini-row').allTextContents(), startingRows)
    await capture('hub-stale-after-mixed-season')
    await button('Без спойлеров').click()
    await home.getByText('Картина сезона скрыта').waitFor()
    assert.equal(await home.locator('.overview-mini-row, .gc-data-status').count(), 0)

    assert.ok(requested.length > 0 && requested.every((season) => season === '2027'))
    assert.deepEqual(errors, [])
    console.log(
      'Issue #75: season rejection, PCT ordering, comparison, stale and Spoiler Mode passed',
    )
  } finally {
    await context.close()
  }
}
