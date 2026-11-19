import assert from 'node:assert/strict'

const origin = 'http://127.0.0.1:4186'

export async function checkTeamHistory({ page, capture }) {
  const sections = page.getByRole('navigation', { name: 'Разделы профиля' })
  const overview = sections.getByRole('link', { name: 'Обзор', exact: true })
  const history = sections.getByRole('link', { name: 'История', exact: true })
  const heading = page.getByRole('heading', { name: 'История франшизы' })
  const route = (code, tab = '') => `${origin}/teams/${code}${tab}`
  const teamRequests = []
  const recordTeamRequest = (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/teams/')) teamRequests.push(request.url())
  }
  page.on('request', recordTeamRequest)

  await page.route(
    (url) => /^\/api\/teams\/(CHI|LAL|MIN|NYK)$/.test(url.pathname),
    (request) => {
      const isCacheMiss = new URL(request.request().url()).pathname.endsWith('/LAL')
      return request.fulfill({
        status: isCacheMiss ? 404 : 503,
        json: {
          error: {
            code: isCacheMiss ? 'cache_miss' : 'upstream_unavailable',
            message: 'Synthetic team-season unavailable',
            retryable: !isCacheMiss,
          },
        },
      })
    },
  )

  for (const [code, fact, images] of [
    ['CHI', '72 победы в регулярном сезоне', 2],
    ['LAL', '81 очко Коби', 2],
    ['MIN', '№2 Малика Сили', 2],
    ['NYK', 'Первое чемпионство с 1973 года', 0],
  ]) {
    await page.goto(route(code, '?tab=history'))
    await heading.waitFor()
    await page.getByRole('heading', { name: fact, exact: true }).waitFor()
    assert.equal(await history.getAttribute('aria-current'), 'page')
    assert.equal(await overview.getAttribute('aria-current'), null)
    assert.equal(await page.locator('.teams-profile-overview, .teams-profile-columns').count(), 0)
    const gallery = page.getByRole('region', { name: 'Галерея' })
    if (images) {
      const galleryImages = gallery.locator('img')
      assert.equal(await galleryImages.count(), images)
      for (const img of await galleryImages.all()) {
        assert.equal(await img.getAttribute('loading'), 'lazy')
        await img.scrollIntoViewIfNeeded()
        await img.evaluate((element) => element.decode())
      }
      assert.equal(
        await gallery.getByRole('link', { name: 'Файл на Wikimedia Commons' }).count(),
        images,
      )
    } else {
      await gallery.getByText('Пока нет фотографий с проверенной лицензией.').waitFor()
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await capture(`team-history-${code.toLowerCase()}`)
  }
  assert.deepEqual(teamRequests, [], 'Direct history links must work without team-season requests')

  await page.goto(route('LAL', '?tab=history'))
  await heading.waitFor()
  await page.reload()
  await heading.waitFor()
  const timeline = page.getByRole('region', { name: 'Хронология' })
  await timeline.getByLabel('Категория').selectOption('identity')
  await timeline.getByRole('heading', { name: 'Los Angeles Lakers', exact: true }).waitFor()
  assert.equal(await timeline.locator('ol li').count(), 2)
  await timeline.getByLabel('Категория').selectOption('titles')
  await timeline.getByLabel('Порядок').selectOption('desc')
  assert.equal(await timeline.locator('time').first().textContent(), '2020')
  assert.equal(await timeline.locator('time').last().textContent(), '1948')
  const arenaList = page.locator('details').filter({ hasText: 'Исторические арены · выборочно' })
  await arenaList.getByText('Исторические арены · выборочно', { exact: true }).click()
  await arenaList.getByText('Los Angeles Memorial Sports Arena', { exact: true }).waitFor()
  const currentArena = page.locator('dd').filter({ hasText: 'Crypto.com Arena' })
  await currentArena.waitFor()
  assert.equal(
    await currentArena.getByRole('link', { name: 'Источник' }).getAttribute('href'),
    'https://www.nba.com/news/all-30-nba-arenas-by-team',
  )

  await overview.focus()
  await page.keyboard.press('Enter')
  await page.getByText('Профиль ещё не кэширован').waitFor()
  assert.equal(await overview.getAttribute('aria-current'), 'page')
  await page.goBack()
  await heading.waitFor()
  await page.goForward()
  await page.getByText('Профиль ещё не кэширован').waitFor()
  await overview.focus()
  await page.keyboard.press('Tab')
  assert.ok(await history.evaluate((anchor) => anchor === document.activeElement))
  await page.keyboard.press('Enter')
  await heading.waitFor()
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'history')

  await page.route('**/media/encyclopedia/arenas/united-center.jpg', (image) => image.abort())
  await page.goto(route('CHI'))
  await page.getByText('Не удалось загрузить профиль').waitFor()
  await history.click()
  await heading.waitFor()
  const failed = page.locator('figure').filter({ hasText: 'United Center, 2006' })
  await failed.scrollIntoViewIfNeeded()
  await failed.getByText('Изображение временно недоступно').waitFor()
  await failed.getByRole('link', { name: 'CC BY-SA 2.5' }).waitFor()

  // The preceding spoiler browser suite supplies BOS team-season data and enables the mode.
  await page.goto(route('BOS'))
  await page.getByText('Сезонная статистика скрыта').waitFor()
  await history.click()
  await heading.waitFor()
  await page.getByRole('heading', { name: 'Восемнадцатое чемпионство' }).waitFor()
  assert.equal(await page.locator('.teams-profile-overview').count(), 0)
  await page.goBack()
  await page.getByText('Сезонная статистика скрыта').waitFor()
  page.off('request', recordTeamRequest)
}
