import assert from 'node:assert/strict'
import { assertFocused, assertMenuFits, chooseOption } from './pro217-ui-browser.mjs'

const origin = 'http://127.0.0.1:4186'
const profiles = [
  ['chicago-illinois-united-states', 'Чикаго', 'America/Chicago', true],
  ['los-angeles-california-united-states', 'Лос-Анджелес', 'America/Los_Angeles', true],
  ['minneapolis-minnesota-united-states', 'Миннеаполис', 'America/Chicago', true],
  ['brooklyn-new-york-united-states', 'Бруклин', 'America/New_York', true],
  ['new-york-new-york-united-states', 'Нью-Йорк', 'America/New_York', true],
  ['toronto-ontario-canada', 'Торонто', 'America/Toronto', true],
  ['inglewood-california-united-states', 'Инглвуд', 'America/Los_Angeles', false],
  ['san-francisco-california-united-states', 'Сан-Франциско', 'America/Los_Angeles', true],
]

export async function checkCityGuide({ page, capture, today, game, meta }) {
  const { width, height } = page.viewportSize()
  const interactive = [320, 768, 1440].includes(width)
  const main = page.locator('main')
  const heading = (name) => main.getByRole('heading', { name, level: 1, exact: true })
  const visit = (url) => page.goto(origin + url)
  const shot = (label) => capture('cities-' + label, { fullPage: false })
  const cards = main.locator('.city-card')
  const apiRequests = []
  const remoteRequests = []
  const observe = (request) => {
    const url = new URL(request.url())
    const logo =
      url.hostname === 'cdn.nba.com' &&
      /^\/logos\/nba\/(?:nba-logoman\.svg|\d+\/primary\/L\/logo\.svg)$/.test(url.pathname)
    if (url.origin !== origin && !logo) remoteRequests.push(request.url())
    if (url.pathname.startsWith('/api/')) apiRequests.push(url.pathname)
  }
  page.on('request', observe)

  try {
    await visit('/cities')
    await heading('Города NBA').waitFor()
    if (width === 1440 && height === 600) {
      const navLink = await page
        .locator('.gc-sidebar')
        .getByRole('link', { name: 'Города NBA' })
        .boundingBox()
      assert.ok(
        navLink && navLink.y + navLink.height <= height,
        'City navigation should fit in the short desktop sidebar',
      )
    }
    assert.equal(await cards.count(), 30)
    const introPhoto = main.locator('.city-hero img')
    await introPhoto.evaluate((image) => image.decode())
    await shot('catalog')
    const controls = main.getByRole('region', { name: 'Каталог городов' })
    await controls.scrollIntoViewIfNeeded()
    await shot('filters')

    if (interactive) {
      const country = controls.getByRole('combobox', { name: 'Страна или регион' })
      await page.mouse.move(0, 0)
      await country.focus()
      await country.press('ArrowDown')
      await assertMenuFits(page)
      await shot('select-open')
      await page.keyboard.press('Escape')
      await assertFocused(country)
      await page.keyboard.press('Tab')
      const attribute = controls.getByRole('combobox', { name: 'Данные о городе' })
      await assertFocused(attribute)
      await chooseOption(page, country, 'Канада')
      await page.waitForURL('**/cities?region=CA')
      await cards.getByRole('link', { name: 'Торонто' }).waitFor()
      assert.equal(await cards.count(), 1)
      await page.goBack()
      await page.waitForURL('**/cities')
      assert.equal(await cards.count(), 30)
      await page.goForward()
      await page.waitForURL('**/cities?region=CA')
      await page.reload()
      await cards.getByRole('link', { name: 'Торонто' }).waitFor()
      await main.getByRole('button', { name: 'Запад', exact: true }).click()
      await main.getByRole('heading', { name: 'Города не найдены' }).waitFor()
      const reset = () => main.getByRole('button', { name: 'Сбросить фильтры' }).click()
      await reset()
      await page.waitForURL('**/cities')
      await chooseOption(page, attribute, 'С панорамой')
      await page.waitForURL('**/cities?attribute=photo')
      assert.equal(await cards.count(), 7)
      await chooseOption(
        page,
        controls.getByRole('combobox', { name: 'Сортировка городов' }),
        'По населению',
      )
      await cards.first().getByRole('link', { name: 'Нью-Йорк', exact: true }).waitFor()
      await reset()
      const search = main.getByRole('searchbox', { name: 'Поиск городов' })
      await search.fill('Brooklyn Nets')
      await cards.getByRole('link', { name: 'Бруклин' }).click()
      await heading('Бруклин').waitFor()
      await page.goBack()
      await cards.getByRole('link', { name: 'Бруклин' }).waitFor()
      assert.equal(await cards.count(), 1)
      assert.equal(await search.inputValue(), 'Brooklyn Nets')
    }

    for (const [slug, title, zone, photo] of profiles) {
      await visit('/cities/' + slug)
      await heading(title).waitFor()
      await main.getByText(zone, { exact: false }).waitFor()
      const map = main.getByRole('link', { name: 'Открыть на OpenStreetMap' })
      const href = new URL(await map.getAttribute('href'))
      assert.equal(href.origin, 'https://www.openstreetmap.org')
      assert.equal(await map.getAttribute('target'), '_blank')
      assert.ok(href.searchParams.has('mlat') && href.searchParams.has('mlon'))
      assert.equal(await main.locator('iframe').count(), 0)
      await main.getByRole('link', { name: '© OpenStreetMap contributors' }).waitFor()
      const hero = main.locator('.city-hero')
      if (photo) {
        const image = hero.locator('img')
        assert.equal(await image.getAttribute('loading'), 'lazy')
        await image.evaluate((img) => img.decode())
        await hero.getByRole('link', { name: 'Файл на Wikimedia Commons' }).waitFor()
        await hero.getByRole('link', { name: /CC BY/ }).waitFor()
      } else {
        await hero.getByText('Панорама с проверенной лицензией пока недоступна').waitFor()
        assert.equal(await hero.locator('img').count(), 0)
      }
      await shot(slug.split(/-(?=illinois|california|minnesota|new-york|ontario)/)[0])
    }

    if (interactive) {
      await visit('/cities/brooklyn-new-york-united-states')
      await main.getByRole('link', { name: 'В составе города Нью-Йорк' }).click()
      await heading('Нью-Йорк').waitFor()
      await main.getByText(/Муниципалитет арены · Нью-Йорк · Манхэттен/).waitFor()
      await main.getByRole('link', { name: 'Боро Бруклин' }).click()
      await heading('Бруклин').waitFor()

      const photoPath = '**/media/encyclopedia/cities/toronto-islands-skyline.jpg'
      const abortPhoto = (route) => route.abort()
      await page.route(photoPath, abortPhoto)
      await visit('/cities/toronto-ontario-canada')
      await main.getByText('Изображение временно недоступно').waitFor()
      await main.getByRole('link', { name: /CC BY/ }).waitFor()
      await shot('broken-photo')
      await page.unroute(photoPath, abortPhoto)

      await visit('/cities/nba:city:inglewood-california-united-states')
      await heading('Инглвуд').waitFor()
      await main.getByRole('link', { name: 'Город бренда' }).click()
      await heading('Лос-Анджелес').waitFor()

      await visit('/cities/not-a-city')
      await main.getByRole('heading', { name: 'Город не найден' }).waitFor()
      await shot('not-found')
    }
    assert.deepEqual(apiRequests, [], 'City Guide must use static data')

    if (interactive) {
      const teamsEndpoint = (url) => url.pathname === '/api/teams/CHI'
      const missing = (route) =>
        route.fulfill({
          status: 404,
          json: {
            error: { code: 'cache_miss', message: 'Synthetic team cache miss', retryable: false },
          },
        })
      await page.route(teamsEndpoint, missing)
      try {
        await visit('/cities/chicago-illinois-united-states')
        await main.getByRole('link', { name: 'Chicago Bulls', exact: true }).click()
        await heading('Chicago Bulls').waitFor()
        const teamCityPhoto = main.locator('.city-team-spotlight img')
        await teamCityPhoto.evaluate((image) => image.decode())
        await main.getByRole('link', { name: 'Город', exact: true }).click()
        await heading('Чикаго').waitFor()
        await main.getByRole('link', { name: 'United Center', exact: true }).click()
        await heading('United Center').waitFor()
        await main.getByRole('link', { name: 'Профиль города · Чикаго' }).click()
        await heading('Чикаго').waitFor()
      } finally {
        await page.unroute(teamsEndpoint, missing)
      }
    }

    const canonical = (code) => ({
      id: 'nba:team:' + code,
      abbreviation: code,
      displayName: code,
      providerId: code,
    })
    const checkedGame = {
      ...game,
      id: 'dunkapi:game:pro206-geography',
      homeTeam: canonical('TOR'),
      awayTeam: canonical('CHI'),
      score: { away: 107, home: 119 },
      startsAt: new Date(Date.parse(today + 'T00:30:00Z') + 86_400_000).toISOString(),
      venue: 'Scotiabank Arena',
    }
    const endpoint = (url) => decodeURIComponent(url.pathname) === '/api/games/' + checkedGame.id
    const gamePath = '/games/' + encodeURIComponent(checkedGame.id) + '?date=' + today
    const serve = (route) =>
      route.fulfill({
        json: {
          data: { game: checkedGame, boxScore: null },
          meta,
          boxScoreMeta: null,
          boxScoreAvailability: 'unavailable',
        },
      })
    await page.route(endpoint, serve)
    const geo = main.getByRole('region', { name: 'География матча' })
    try {
      const requestCount = apiRequests.length
      await visit(gamePath)
      await geo.getByRole('link', { name: 'Scotiabank Arena' }).waitFor()
      await geo.getByText('Местное время площадки · Торонто', { exact: true }).waitFor()
      await geo.getByText('Расстояние по прямой между центрами городов команд').waitFor()
      assert.deepEqual(apiRequests.slice(requestCount).map(decodeURIComponent), [
        '/api/games/' + checkedGame.id,
      ])
      await geo.scrollIntoViewIfNeeded()
      await shot('game-geo')

      if (interactive) {
        const spoiler = page.getByRole('button', { name: 'Без спойлеров', exact: true })
        await spoiler.click()
        await main.getByText('Результат скрыт', { exact: false }).first().waitFor()
        assert.equal(
          await main
            .locator('.game-detail-side strong, [aria-label^="Счёт"], .player-box-score')
            .count(),
          0,
        )
        await geo.getByRole('link', { name: 'Торонто' }).waitFor()
        await shot('game-spoiler')
        await spoiler.click()

        checkedGame.venue = 'Neutral site'
        await page.reload()
        await geo.getByText('Нейтральная площадка, город не подтверждён.').waitFor()
        assert.equal(await geo.locator('.game-geography__distance').count(), 0)
        await geo.getByText('Справочное время города хозяев · Торонто').waitFor()

        checkedGame.venue = null
        checkedGame.awayTeam = { ...checkedGame.awayTeam, id: 'test:team:unknown' }
        await page.reload()
        await geo
          .getByText('Для расстояния нужны две подтверждённые точки в центрах городов.')
          .waitFor()
        assert.equal(await geo.locator('.game-geography__distance').count(), 0)
        await shot('game-unknown')
      }
    } finally {
      await page.unroute(endpoint, serve)
    }
    assert.deepEqual(remoteRequests, [], 'City Guide must not load external images or map tiles')
  } finally {
    page.off('request', observe)
  }
}
