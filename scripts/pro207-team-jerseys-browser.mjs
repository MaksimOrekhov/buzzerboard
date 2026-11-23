import assert from 'node:assert/strict'
import { assertFocused, assertMenuFits, chooseOption } from './pro217-ui-browser.mjs'

const origin = 'http://127.0.0.1:4186'
const teamProfile = (code) => origin + '/teams/' + code
const teamRequest = (url) => /^\/api\/teams\/[^/]+$/.test(url.pathname)

export async function checkTeamJerseys({ page, capture }) {
  const panel = page.getByRole('region', { name: 'Форма', exact: true })
  const nav = page.getByRole('navigation', { name: 'Разделы профиля' })
  const tab = nav.getByRole('link', { name: 'Форма' })
  const coaches = nav.getByRole('link', { name: 'Тренеры' })
  const season = panel.getByRole('combobox', { name: 'Сезон', exact: true })
  const type = panel.getByRole('combobox', { name: 'Тип', exact: true })
  const order = panel.getByRole('combobox', { name: 'Сортировка', exact: true })
  const archive = panel.getByRole('button', { name: /^Архив/ })
  const groups = panel.locator('.jersey-season')
  const spoilers = page.getByRole('button', { name: 'Без спойлеров', exact: true })
  const current = panel.getByRole('region', { name: 'Подборка 2026/27' })
  const requests = []
  const onRequest = (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url())
  }
  page.on('request', onRequest)
  try {
    await page.goto(teamProfile('CHI') + '?tab=jerseys')
    await panel.getByRole('heading', { name: 'Sweet Home', exact: true }).waitFor()
    assert.equal(await tab.getAttribute('aria-current'), 'page')
    assert.equal(await coaches.getAttribute('aria-current'), null)
    assert.ok(
      await nav.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      'All four profile tabs must be visible without horizontal scrolling',
    )
    assert.equal(await panel.locator('img').count(), 0)
    assert.equal(await current.getByRole('article').count(), 2)
    const city = current.getByRole('article', { name: 'Sweet Home', exact: true })
    assert.equal(
      await city.getByRole('link', { name: 'NBA LockerVision' }).getAttribute('href'),
      'https://lockervision.nba.com/game-outfit/chicago-bulls?gameid=0022600588',
    )
    await spoilers.click()
    await city.waitFor()
    await spoilers.click()
    await panel.getByRole('heading', { name: 'Форма', exact: true }).scrollIntoViewIfNeeded()
    await capture('jerseys-chi', { fullPage: false })

    const details = city.locator('summary')
    await details.focus()
    await details.press('Enter')
    await city.getByText('В календаре формы', { exact: true }).waitFor()
    assert.equal(await city.locator('time[datetime="2027-01-14"]').innerText(), '14.01.2027')
    await details.press('Enter')
    await city.getByText('В календаре формы', { exact: true }).waitFor({ state: 'hidden' })

    await coaches.focus()
    await page.keyboard.press('Tab')
    await assertFocused(tab)
    await page.mouse.move(0, 0)
    await season.focus()
    await season.press('ArrowDown')
    await assertMenuFits(page)
    await capture('jerseys-season-open', { fullPage: false })
    await page.keyboard.press('Escape')
    await assertFocused(season)
    await page.keyboard.press('Tab')
    await assertFocused(type)

    await chooseOption(page, season, '2023/24')
    await panel.getByRole('heading', { name: 'Madhouse on Madison' }).waitFor()
    assert.equal(await archive.getAttribute('aria-pressed'), 'true')
    assert.equal(new URL(page.url()).searchParams.get('jerseySeason'), '2023-24')
    await chooseOption(page, type, 'Statement Edition')
    await panel.getByText('Комплекты не найдены', { exact: true }).waitFor()
    await page.goBack()
    await panel.getByRole('heading', { name: 'Madhouse on Madison' }).waitFor()
    await page.goForward()
    await panel.getByText('Комплекты не найдены', { exact: true }).waitFor()
    await page.reload()
    await panel.getByText('Комплекты не найдены', { exact: true }).waitFor()
    await panel.getByRole('button', { name: 'Сбросить фильтры' }).click()
    await panel.getByRole('heading', { name: 'Sweet Home', exact: true }).waitFor()
    assert.equal(await groups.first().getAttribute('aria-label'), 'Подборка 2025/26')
    await chooseOption(page, order, 'Сначала ранние')
    assert.equal(await groups.first().getAttribute('aria-label'), 'Подборка 2022/23')
    await groups.first().scrollIntoViewIfNeeded()
    await capture('jerseys-archive', { fullPage: false })

    for (const [code, expectedSets] of [
      ['LAL', 2],
      ['MIN', 3],
      ['LAC', 2],
      ['ORL', 1],
    ]) {
      await page.goto(teamProfile(code) + '?tab=jerseys')
      await current.getByRole('article').first().waitFor()
      assert.equal(await current.getByRole('article').count(), expectedSets, code)
      assert.equal(await current.locator('img').count(), 0)
      if (code === 'MIN') {
        await current.scrollIntoViewIfNeeded()
        await capture('jerseys-min', { fullPage: false })
      }
    }
    assert.deepEqual(requests, [], 'The jersey tab must use static data without new API requests')
  } finally {
    page.off('request', onRequest)
  }

  const error = (code) => ({
    error: {
      code,
      message: 'Synthetic profile error',
      retryable: false,
      provider: null,
      upstreamStatus: null,
    },
    requestId: null,
  })
  const failOverview = (route) => {
    const path = new URL(route.request().url()).pathname
    return path.endsWith('/LAL')
      ? route.fulfill({ status: 404, json: error('cache_miss') })
      : route.fulfill({ status: 503, json: error('storage_unavailable') })
  }
  await page.route(teamRequest, failOverview)
  try {
    for (const [code, message] of [
      ['LAL', 'Профиль ещё не кэширован'],
      ['MIN', 'Не удалось загрузить профиль'],
    ]) {
      await page.goto(teamProfile(code))
      await page.getByText(message, { exact: true }).waitFor()
      await tab.click()
      await current.getByRole('article').first().waitFor()
      assert.equal(await tab.getAttribute('aria-current'), 'page')
    }
  } finally {
    await page.unroute(teamRequest, failOverview)
  }
}
