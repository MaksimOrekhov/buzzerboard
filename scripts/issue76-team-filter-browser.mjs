import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const fixture = JSON.parse(
  await readFile(new URL('./fixtures/nba-hub.synthetic.json', import.meta.url), 'utf8'),
)
const dayA = fixture.today
const dayB = '2026-11-25'
const dayC = '2026-11-26'
const minnesota = 'nba:team:MIN'
const newYork = 'nba:team:NYK'
const teamUrl = '/games?date=' + dayA + '&team=' + encodeURIComponent(minnesota)
const favorite = fixture.days[dayB].data[0]
const errorResponse = (code) => ({
  error: {
    code,
    message: 'Synthetic fixture',
    retryable: true,
    provider: null,
    upstreamStatus: null,
  },
  requestId: null,
})

export async function checkGameCenterTeamFilter({ browser, origin, output }) {
  await mkdir(output, { recursive: true })
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: 'ru-RU',
    timezoneId: 'Asia/Nicosia',
  })
  await context.addInitScript(
    (id) => localStorage.setItem('buzzerboard.favorite-games.v1', JSON.stringify([id])),
    favorite.id,
  )
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date(fixture.clock))
  const browserErrors = []
  const unexpected = []
  const dateReads = []
  page.on('pageerror', (error) => browserErrors.push(error.message))

  let modes = {}
  let delayed
  await context.route(
    (url) => url.origin !== origin || url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) return route.abort()
      const date = url.searchParams.get('date')
      if (route.request().method() !== 'GET' || !fixture.days[date]) {
        unexpected.push(route.request().method() + ' ' + url.pathname)
        return route.abort()
      }
      if (url.pathname === '/api/games') {
        dateReads.push(date)
        const { status = 200, json = fixture.days[date] } = modes[date] ?? {}
        if (delayed && date === dayB) {
          const { release, done } = delayed
          await release.promise
          try {
            return await route.fulfill({ status, json })
          } finally {
            done.resolve()
          }
        }
        return route.fulfill({ status, json })
      }
      if (url.pathname === '/api/games/' + encodeURIComponent(favorite.id) && date === dayB) {
        return route.fulfill({
          json: {
            data: { game: favorite, boxScore: null },
            meta: fixture.days[dayB].meta,
            boxScoreMeta: null,
            boxScoreAvailability: 'unavailable',
          },
        })
      }
      unexpected.push(url.pathname)
      return route.abort()
    },
  )

  const visit = (url = teamUrl) => page.goto(origin + url)
  const button = (name) => page.getByRole('button', { name, exact: true })
  const nextDay = () => button('Следующий день').click()
  const rows = page.locator('.gc-scoreboard .gc-score-row')
  const select = page.getByRole('combobox', { name: 'Фильтр по команде' })
  const filters = page.getByRole('button', { name: /^Фильтры/ })
  const waitDate = (date, team) =>
    page.waitForURL(
      (url) =>
        url.pathname === '/games' &&
        url.searchParams.get('date') === date &&
        url.searchParams.get('team') === team,
    )
  const capture = async (name) => {
    await page.evaluate(() => document.fonts.ready)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      page.viewportSize().width,
    )
    await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' })
  }

  try {
    for (const [width, height] of [
      [320, 600],
      [375, 812],
    ]) {
      await page.setViewportSize({ width, height })
      const start = dateReads.length
      await visit()
      await rows.first().waitFor()
      assert.equal(await rows.count(), 1)
      await nextDay()
      await waitDate(dayB, null)
      await rows.last().waitFor()
      assert.equal(await rows.count(), 5)
      await filters.click()
      assert.equal(await select.innerText(), 'Все команды')
      await capture(width + '-team-cleared')
      await filters.click()
      await capture(width + '-five-matches')

      await page.goBack()
      await waitDate(dayA, minnesota)
      await rows.first().waitFor()
      assert.equal(await rows.count(), 1)
      await page.goForward()
      await waitDate(dayB, null)
      await rows.last().waitFor()
      assert.equal(await rows.count(), 5)
      assert.deepEqual(dateReads.slice(start), [dayA, dayB])
    }

    await visit('/games?date=' + dayA + '&team=' + encodeURIComponent(newYork))
    await rows.first().waitFor()
    await nextDay()
    await waitDate(dayB, newYork)
    await rows.first().waitFor()
    assert.equal(await rows.count(), 1)
    await filters.click()
    assert.equal(await select.innerText(), 'New York Knicks')

    await visit('/games?date=' + dayB + '&team=' + encodeURIComponent(minnesota))
    await waitDate(dayB, null)
    await rows.last().waitFor()
    assert.equal(await rows.count(), 5)
    await page.reload()
    await waitDate(dayB, null)
    await rows.last().waitFor()
    assert.equal(await rows.count(), 5)

    await visit(teamUrl + '&status=scheduled&q=WAS&favorites=1&sort=desc')
    await nextDay()
    await waitDate(dayB, null)
    await rows.first().waitFor()
    assert.equal(await rows.count(), 1)
    await page.getByText(/1 из 5 матчей/).waitFor()
    const expectedQuery = {
      date: dayB,
      status: 'scheduled',
      q: 'WAS',
      favorites: '1',
      sort: 'desc',
    }
    const gameLink = rows.locator('a.gc-scoreboard-result')
    const href = new URL(await gameLink.getAttribute('href'), origin)
    assert.deepEqual(
      Object.fromEntries(new URL(href.searchParams.get('from'), origin).searchParams),
      expectedQuery,
    )
    assert.equal(await rows.getByRole('button', { name: 'Убрать матч из избранного' }).count(), 1)
    const beforeDetails = dateReads.length
    await gameLink.click()
    await page.getByRole('link', { name: 'К игровому дню' }).click()
    await rows.first().waitFor()
    assert.deepEqual(Object.fromEntries(new URL(page.url()).searchParams), expectedQuery)
    assert.equal(dateReads.length, beforeDetails)
    await capture('other-filters-and-favorite')

    for (const flags of [{ isStale: true }, { rejectedRecords: 1 }]) {
      modes = {
        [dayB]: { json: { ...fixture.days[dayB], meta: { ...fixture.days[dayB].meta, ...flags } } },
      }
      await visit()
      await rows.first().waitFor()
      await nextDay()
      await waitDate(dayB, minnesota)
      await page.getByText('Матчи не найдены', { exact: true }).waitFor()
      assert.equal(
        await page
          .locator('.gc-filter-summary')
          .textContent()
          .then((text) => text.includes('0 из 5')),
        true,
      )
    }
    modes = { [dayB]: { status: 503, json: errorResponse('cache_miss') } }
    await visit()
    await rows.first().waitFor()
    await nextDay()
    await waitDate(dayB, minnesota)
    await page.getByText('За этот день пока нет данных', { exact: true }).waitFor()
    assert.equal(await select.isVisible(), false)
    await capture('cache-miss-retains-filter')

    modes = {}
    await nextDay()
    await waitDate(dayC, null)
    await page.getByText('В этот день матчей нет', { exact: true }).waitFor()
    await capture('complete-empty-day')

    const match = fixture.days[dayA].data.find((game) => game.awayTeam.id === minnesota)
    modes = {
      [dayC]: {
        json: {
          ...fixture.days[dayC],
          data: [
            {
              ...match,
              nbaGameDate: dayC,
              status: 'scheduled',
              startsAt: null,
              score: { home: null, away: null },
              scoreByPeriod: null,
            },
          ],
        },
      },
    }
    await visit()
    await rows.first().waitFor()
    const beforeRapid = dateReads.length
    delayed = { release: Promise.withResolvers(), done: Promise.withResolvers() }
    const pending = page.waitForRequest(origin + '/api/games?date=' + dayB)
    await nextDay()
    await pending
    await waitDate(dayB, minnesota)
    await page.locator('.gc-skeleton-list').waitFor()
    await nextDay()
    await waitDate(dayC, minnesota)
    await rows.first().waitFor()
    delayed.release.resolve()
    await delayed.done.promise
    delayed = null
    assert.equal(new URL(page.url()).searchParams.get('team'), minnesota)
    assert.deepEqual(dateReads.slice(beforeRapid), [dayB, dayC])
    await filters.click()
    assert.equal(await select.innerText(), 'Minnesota Timberwolves')
    await capture('rapid-switch-retains-team')

    assert.deepEqual(unexpected, [])
    assert.deepEqual(browserErrors, [])
    console.log(
      'Issue #76: day team reset, cache, history, other filters and delayed response passed',
    )
  } finally {
    delayed?.release.resolve()
    await context.close()
  }
}
