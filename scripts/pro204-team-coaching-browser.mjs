import assert from 'node:assert/strict'
import { assertFocused, assertMenuFits, chooseOption } from './pro217-ui-browser.mjs'

const origin = 'http://127.0.0.1:4186'

export async function checkTeamCoaching({ page, capture }) {
  const teamPath = (code, tab = '') => `${origin}/teams/${code}${tab}`
  const sections = page.getByRole('navigation', { name: 'Разделы профиля' })
  const coaches = sections.getByRole('link', { name: 'Тренеры' })
  const history = sections.getByRole('link', { name: 'История' })
  const overview = sections.getByRole('link', { name: 'Обзор' })
  const title = page.getByRole('heading', { name: 'Тренерский штаб', exact: true })
  const requested = []
  const observe = (req) => {
    if (new URL(req.url()).pathname.startsWith('/api/')) requested.push(req.url())
  }
  page.on('request', observe)

  for (const [code, coach, staff, licensed] of [
    ['CHI', 'Tiago Splitter', 'Taj Gibson', true],
    ['LAL', 'JJ Redick', 'Nate McMillan', true],
    ['MIN', 'Chris Finch', 'Pablo Prigioni', true],
    ['POR', 'Micah Nori', 'Jay Triano', false],
  ]) {
    await page.goto(teamPath(code, '?tab=coaches'))
    await title.waitFor()
    const lead = page.getByRole('region', { name: coach, exact: true })
    await lead.getByRole('heading', { name: coach, exact: true }).waitFor()
    await page
      .getByRole('region', { name: 'Штаб и руководство' })
      .getByText(staff, { exact: true })
      .waitFor()
    assert.equal(await coaches.getAttribute('aria-current'), 'page')
    assert.equal(await overview.getAttribute('aria-current'), null)
    assert.equal(await history.getAttribute('aria-current'), null)
    const photos = page.getByRole('complementary', { name: 'Портреты тренера' })
    if (licensed) {
      const photo = photos.locator('img')
      assert.equal(await photo.getAttribute('loading'), 'lazy')
      await photo.scrollIntoViewIfNeeded()
      await photo.evaluate((img) => img.decode())
      await photos.getByRole('link', { name: 'Файл на Wikimedia Commons' }).waitFor()
      await photos.getByRole('link', { name: /CC BY-SA/ }).waitFor()
    } else {
      await lead.getByText('Портрет с проверенной лицензией пока недоступен.').waitFor()
    }
    await page.getByText('Результаты скрыты режимом «Без спойлеров».').waitFor()
    assert.equal(await page.locator('.coach-stats').count(), 0)
    await page.evaluate(() => window.scrollTo(0, 0))
    await capture(`team-coaches-${code.toLowerCase()}`)
  }

  const timeline = page.getByRole('region', { name: 'История назначений' })
  const phase = timeline.getByRole('combobox', { name: 'Период', exact: true })
  const type = timeline.getByRole('combobox', { name: 'Тип назначения', exact: true })
  const order = timeline.getByRole('combobox', { name: 'Порядок', exact: true })
  assert.equal(await timeline.locator('select').count(), 0)
  assert.equal(await timeline.getByRole('combobox').count(), 3)
  await page.mouse.move(0, 0)
  await phase.focus()
  await phase.press('ArrowDown')
  await assertMenuFits(page)
  await page.keyboard.press('Escape')
  await assertFocused(phase)
  await page.keyboard.press('Tab')
  await assertFocused(type)
  await chooseOption(page, phase, 'Бывшие тренеры')
  await chooseOption(page, type, 'Временные')
  await timeline.getByRole('heading', { name: 'Tiago Splitter' }).waitFor()
  await timeline.getByText('Сезон 2025/26').waitFor()
  assert.equal(await timeline.locator('li').count(), 1)
  assert.deepEqual(requested, [], 'The coaching section must work without sports API requests')
  page.off('request', observe)

  await page.goto(teamPath('MIN', '?tab=coaches'))
  await title.waitFor()
  await page.reload()
  await title.waitFor()
  assert.equal(new URL(page.url()).searchParams.get('tab'), 'coaches')
  await chooseOption(page, order, 'Сначала ранние')
  assert.match(await timeline.locator('li').first().innerText(), /Tom Thibodeau|Ryan Saunders/)
  await chooseOption(page, order, 'Сначала новые')
  assert.match(await timeline.locator('li').first().innerText(), /Chris Finch/)

  await coaches.focus()
  await page.keyboard.press('Shift+Tab')
  assert.ok(await history.evaluate((link) => link === document.activeElement))
  await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: 'История франшизы' }).waitFor()
  await page.goBack()
  await title.waitFor()
  await page.goForward()
  await page.getByRole('heading', { name: 'История франшизы' }).waitFor()
  await history.focus()
  await page.keyboard.press('Tab')
  assert.ok(await coaches.evaluate((link) => link === document.activeElement))
  await page.keyboard.press('Enter')
  await title.waitFor()

  const favorite = page.locator('.teams-profile-favorite')
  const before = await favorite.getAttribute('aria-pressed')
  await favorite.click()
  assert.equal(await favorite.getAttribute('aria-pressed'), String(before !== 'true'))
  await favorite.click()
  assert.equal(await favorite.getAttribute('aria-pressed'), before)

  // PRO-203's local browser fixture returns cache_miss for the Lakers overview.
  await page.route('**/media/encyclopedia/coaches/jj-redick.jpg', (request) => request.abort())
  await page.goto(teamPath('LAL'))
  await page.getByText('Профиль ещё не кэширован').waitFor()
  await coaches.click()
  await title.waitFor()
  const failed = page.locator('.coach-portraits figure')
  await failed.scrollIntoViewIfNeeded()
  await failed.getByText('Изображение временно недоступно').waitFor()
  await failed.getByRole('link', { name: 'Файл на Wikimedia Commons' }).waitFor()
  await page.getByRole('button', { name: 'Без спойлеров', exact: true }).click()
  await page.getByText('Для расчёта нужен подтверждённый период', { exact: false }).waitFor()
  assert.equal(await page.locator('.coach-stats').count(), 0)
  await page.getByRole('heading', { name: 'JJ Redick', exact: true }).first().waitFor()
}
