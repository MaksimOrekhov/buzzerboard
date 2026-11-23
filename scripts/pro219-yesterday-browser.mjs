import assert from 'node:assert/strict'
import path from 'node:path'

const yesterday = '2026-11-22'
const origin = 'http://127.0.0.1:4186'

async function returnFocus(page) {
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}

export async function checkYesterdayRefresh({ browser, games, meta, output }) {
  const finals = games.slice(0, 7).map((game, index) => ({
    ...game,
    nbaGameDate: yesterday,
    startsAt: index === 6 ? '2026-11-23T03:30:00Z' : '2026-11-22T23:00:00Z',
    status: 'final',
    score: { home: 116 + index, away: 106 + index },
    scoreByPeriod: null,
  }))
  const scheduled = finals.map((game) => ({
    ...game,
    status: 'scheduled',
    score: { home: null, away: null },
  }))

  for (const width of [320, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      timezoneId: 'Asia/Nicosia',
    })
    try {
      const page = await context.newPage()
      let published = false
      let yesterdayReads = 0
      const unexpected = []
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url())
        if (url.hostname !== '127.0.0.1') {
          if (url.hostname === 'api.bigballsdata.com') unexpected.push('BBS request')
          return route.abort()
        }
        if (!url.pathname.startsWith('/api/')) return route.continue()
        if (url.pathname !== '/api/games' || route.request().method() !== 'GET') {
          unexpected.push(route.request().method() + ' ' + url.pathname)
          return route.abort()
        }
        const isYesterday = url.searchParams.get('date') === yesterday
        if (isYesterday) yesterdayReads++
        return route.fulfill({
          json: {
            data: isYesterday ? (published ? finals : scheduled) : [],
            meta: {
              ...meta,
              isStale: isYesterday && !published,
              fetchedAt: published ? '2026-11-23T10:20:00Z' : '2026-11-22T18:20:00Z',
            },
          },
        })
      })
      await page.clock.setFixedTime(new Date('2026-11-23T09:55:00Z'))
      await page.goto(origin + '/games?date=' + yesterday)
      const rows = page.locator('.gc-score-row')
      const resultLinks = rows.getByRole('link', { name: 'Открыть карточку матча' })
      const spoiler = page.getByRole('button', { name: 'Без спойлеров', exact: true })
      const pending = page.getByText('Ждём подтверждённые результаты от источника.')
      await rows.nth(6).waitFor()
      await pending.waitFor()
      assert.equal(await rows.count(), 7)
      assert.equal(yesterdayReads, 1)

      await returnFocus(page)
      assert.equal(yesterdayReads, 1, 'Fresh unresolved data must be throttled')
      await page.clock.setFixedTime(new Date('2026-11-23T10:20:00Z'))
      published = true
      if (width === 320) {
        await spoiler.click()
        await page.getByRole('button', { name: 'Сегодня', exact: true }).click()
        await page.getByText('В этот день матчей нет', { exact: true }).waitFor()
        await page.getByRole('button', { name: 'Вчера', exact: true }).click()
        await rows.nth(6).waitFor()
        await page
          .locator('.gc-data-status')
          .getByText(/Обновлено.*12:20/)
          .waitFor()
        assert.equal(await rows.getByText('Результат скрыт', { exact: true }).count(), 7)
        assert.equal(
          await rows.locator('.gc-score, .gc-mobile-score, .gc-winner-marker').count(),
          0,
        )
        assert.equal(await pending.count(), 0)
        await page.screenshot({ path: path.join(output, 'pro219-320-yesterday-spoilers.png') })
      } else {
        const search = page.getByRole('searchbox', { name: 'Поиск команды' })
        await search.fill(finals[0].homeTeam.abbreviation)
        await returnFocus(page)
        await rows.locator('.gc-match-status--final').first().waitFor({ state: 'attached' })
        assert.equal(await search.inputValue(), finals[0].homeTeam.abbreviation)
        await search.clear()
        await rows.locator('.gc-match-status--final').nth(6).waitFor({ state: 'attached' })
        assert.equal(await resultLinks.count(), 7)
        assert.equal(await rows.locator('.gc-match-status--final').count(), 7)
        await page.screenshot({ path: path.join(output, 'pro219-1440-yesterday-finals.png') })
      }
      assert.equal(yesterdayReads, 2, 'Returning to yesterday should issue one GET')
      await page.clock.setFixedTime(new Date('2026-11-23T11:00:00Z'))
      await returnFocus(page)
      assert.equal(yesterdayReads, 2, 'Settled results should not be refetched on focus')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      assert.deepEqual(unexpected, [])
    } finally {
      await context.close()
    }
  }
  console.info(
    'PRO-219 yesterday: one cache-only GET on focus or date return, 320–1440 px, spoiler-safe.',
  )
}
