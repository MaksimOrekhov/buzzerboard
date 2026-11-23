import assert from 'node:assert/strict'
import { assertFocused, assertMenuFits, chooseOption } from './pro217-ui-browser.mjs'

const origin = 'http://127.0.0.1:4186'

export async function checkArenaGuide({ page, capture, baseline }) {
  const size = page.viewportSize()
  const browserInteractions = !baseline && [320, 768, 1440].includes(size.width)
  const heading = (name) => page.getByRole('heading', { name, exact: true, level: 1 })
  const visit = (route) => page.goto(origin + route)
  const shots = (label) => capture('arenas-' + label, { fullPage: false })
  const requests = []
  const observe = (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url())
  }
  page.on('request', observe)
  const cards = page.locator('.arena-card')
  const search = page.getByRole('searchbox', { name: 'Поиск арен' })
  const filters = page.getByRole('region', { name: 'Каталог арен' })
  const select = (name) => filters.getByRole('combobox', { name, exact: true })
  const reset = () => page.getByRole('button', { name: 'Сбросить фильтры' }).click()

  try {
    await visit('/arenas')
    await heading('Арены NBA').waitFor()
    assert.equal(await cards.count(), 30)
    await page.getByText('30 из 30 арен · 30 команд NBA').waitFor()
    await page.locator('.arena-featured img').evaluate((image) => image.decode())
    await shots('catalog')
    await filters.scrollIntoViewIfNeeded()
    await shots('filters')

    if (browserInteractions) {
      await search.fill('Brooklyn Nets')
      await cards.getByRole('link', { name: 'Barclays Center', exact: true }).waitFor()
      assert.equal(await cards.count(), 1)
      await cards.getByRole('link', { name: 'Barclays Center' }).click()
      await heading('Barclays Center').waitFor()
      await page.goBack()
      await cards.getByRole('link', { name: 'Barclays Center' }).waitFor()
      assert.equal(await search.inputValue(), 'Brooklyn Nets')
      await page.goForward()
      await heading('Barclays Center').waitFor()
      await page.getByRole('link', { name: '← Каталог арен' }).click()
      await heading('Арены NBA').waitFor()

      const city = select('Город')
      await page.mouse.move(0, 0)
      await city.focus()
      await city.press('ArrowDown')
      await assertMenuFits(page)
      await shots('city-open')
      await page.keyboard.press('Escape')
      await assertFocused(city)
      await page.keyboard.press('Tab')
      await assertFocused(select('Данные об арене'))

      await chooseOption(page, city, 'Chicago')
      await cards.getByRole('link', { name: 'United Center' }).waitFor()
      assert.equal(await cards.count(), 1)
      await reset()
      await page.getByRole('button', { name: 'Запад', exact: true }).click()
      await chooseOption(page, select('Данные об арене'), 'С координатами')
      assert.equal(await cards.count(), 2)
      await reset()
      await chooseOption(page, select('Сортировка арен'), 'По вместимости')
      await cards.first().getByRole('link', { name: 'United Center', exact: true }).waitFor()
      await search.fill('Нет такой арены')
      await page.getByRole('heading', { name: 'Арены не найдены' }).waitFor()
      await reset()
    }

    for (const [slug, name, address, hasPhoto, pin] of [
      ['united-center', 'United Center', '1901 W. Madison Street', true, true],
      ['crypto-com-arena', 'Crypto.com Arena', '1111 South Figueroa Street', true, true],
      ['target-center', 'Target Center', '600 First Avenue North', true, true],
      ['td-garden', 'TD Garden', '100 Legends Way', false, false],
    ]) {
      await visit('/arenas/' + slug)
      await heading(name).waitFor()
      await page.getByText(address, { exact: false }).waitFor()
      const map = page.getByRole('link', {
        name: pin ? 'Открыть на OpenStreetMap' : 'Найти адрес на OpenStreetMap',
      })
      const href = new URL(await map.getAttribute('href'))
      assert.equal(href.hostname, 'www.openstreetmap.org')
      assert.equal(await map.getAttribute('target'), '_blank')
      if (pin) assert.ok(href.searchParams.has('mlat') && href.searchParams.has('mlon'))
      else assert.ok(href.searchParams.get('query').includes(address))
      await page.getByRole('link', { name: '© OpenStreetMap contributors' }).waitFor()
      if (hasPhoto) {
        const cover = page.locator('.arena-cover img')
        assert.equal(await cover.getAttribute('loading'), 'lazy')
        await cover.evaluate((image) => image.decode())
        await page
          .locator('.arena-cover')
          .getByRole('link', { name: 'Файл на Wikimedia Commons' })
          .waitFor()
        const gallery = page.getByRole('region', { name: 'Галерея' })
        const photo = gallery.locator('img')
        await photo.scrollIntoViewIfNeeded()
        await photo.evaluate((image) => image.decode())
        await gallery.getByRole('link', { name: /CC BY/ }).waitFor()
        await page.evaluate(() => window.scrollTo(0, 0))
      } else {
        await page.getByText('Фотографий с проверенной лицензией пока нет.').waitFor()
        assert.equal(await page.locator('.arena-cover img').count(), 0)
      }
      await shots(slug)
    }

    if (browserInteractions) {
      await visit('/arenas/crypto-com-arena')
      await page.getByRole('heading', { name: 'Прежние названия' }).waitFor()
      await page.getByText('Staples Center', { exact: true }).waitFor()
      await page.getByRole('link', { name: 'LA Clippers', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Без спойлеров', exact: true }).click()
      await heading('Crypto.com Arena').waitFor()
      await page.getByText('В доступном снимке BBS такой привязки нет.', { exact: false }).waitFor()
      assert.equal(await page.locator('[aria-label^="Счёт"]').count(), 0)
      await page.getByRole('button', { name: 'Без спойлеров', exact: true }).click()
      await page.reload()
      await heading('Crypto.com Arena').waitFor()

      await visit('/arenas/frost-bank-center')
      await page.getByText('Moody Center, Austin, Texas').waitFor()
      await page.getByText('2027-02-28', { exact: true }).waitFor()
      await visit('/arenas/unknown-venue')
      await page.getByRole('heading', { name: 'Арена не найдена' }).waitFor()
      const failedPhoto = '**/media/encyclopedia/arenas/crypto-com-arena-guide.jpg'
      const abort = (route) => route.abort()
      await page.route(failedPhoto, abort)
      await visit('/arenas/crypto-com-arena')
      await page.locator('.arena-cover').getByText('Изображение временно недоступно').waitFor()
      await page.locator('.arena-cover').getByRole('link', { name: /CC BY/ }).waitFor()
      await shots('broken-photo')
      await page.unroute(failedPhoto, abort)
    }
    assert.deepEqual(requests, [], 'Arena Guide must use static data only')
  } finally {
    page.off('request', observe)
  }

  if (browserInteractions) {
    await visit('/teams')
    await page.locator('main').getByRole('link', { name: 'Арены NBA' }).click()
    await heading('Арены NBA').waitFor()
    await visit('/teams/LAC?tab=history')
    await page.getByText('Исторические арены · выборочно').click()
    await page.getByRole('link', { name: 'Staples Center / Crypto.com Arena' }).click()
    await heading('Crypto.com Arena').waitFor()
  }
}
