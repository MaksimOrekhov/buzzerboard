import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const port = Number(process.env.PRO195_PORT ?? 8795)
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535)
const origin = 'http://127.0.0.1:' + port
const output = 'artifacts/pro-195/review'
await mkdir(output, { recursive: true })
async function read(path) {
  const response = await fetch(origin + path)
  assert.ok(response.ok, `${response.status} at ${path}`)
  return response.json()
}
const directory = await read('/api/players')
assert.equal(directory.source, 'bbs')
assert.equal(directory.players.length, directory.coverage.total)
assert.equal(directory.coverage.checked, directory.coverage.total)
assert.equal(new Set(directory.players.map((player) => player.id)).size, directory.coverage.total)
const profiles = []
for (let offset = 0; offset < directory.players.length; offset += 16) {
  const batch = directory.players.slice(offset, offset + 16)
  profiles.push(
    ...(await Promise.all(
      batch.map(async ({ id }) => {
        const item = await read('/api/players/' + encodeURIComponent(id))
        assert.equal(item.player.id, id)
        return item
      }),
    )),
  )
}
const full = profiles.filter(({ detail }) => detail?.profileAt && detail?.games.length)
assert.ok(full.length >= 5)
assert.deepEqual((await read('/api/players')).coverage, directory.coverage)
const sample = full[0]
const linked = profiles.find(({ detail }) => detail?.games.some((row) => row.gameId))
assert.ok(sample && linked)
const samplePath = '/players/' + encodeURIComponent(sample.player.id)
const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE_PATH })
try {
  for (const width of [375, 768, 1024, 1280, 1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: 1060 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/*', (route) =>
      route
        .request()
        .url()
        .startsWith(origin + '/')
        ? route.continue()
        : route.abort(),
    )
    await page.goto(origin + '/players')
    const rows = page.locator('.players-table tbody tr')
    await rows.first().waitFor()
    assert.equal(await rows.count(), 25)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    if ([375, 768, 1440].includes(width))
      await page.screenshot({ path: `${output}/catalog-${width}.png`, fullPage: true })
    if ([375, 768, 1440].includes(width)) {
      const teamControl = page.getByRole('combobox', { name: 'Фильтр по команде' })
      await teamControl.focus()
      await page.keyboard.press('Enter')
      await page.getByRole('listbox').waitFor()
      await page.screenshot({ path: `${output}/filters-open-${width}.png` })
      await page.keyboard.press('Escape')
      const conference = page.getByRole('combobox', { name: 'Фильтр по конференции' })
      await conference.click()
      await page.getByRole('option', { name: 'Восточная', exact: true }).click()
      await page.waitForURL((url) => url.searchParams.get('conference') === 'east')
      await page.reload()
      assert.match(await conference.innerText(), /Восточная/)
      await conference.click()
      await page.getByRole('option', { name: 'Обе конференции', exact: true }).click()
      await page.waitForURL((url) => !url.searchParams.has('conference'))
      await page.getByRole('combobox', { name: 'Фильтр по позиции' }).click()
      await page.getByRole('listbox').waitFor()
      await page.keyboard.press('Escape')
    }
    await page.getByRole('searchbox', { name: 'Поиск игрока' }).fill(sample.player.name)
    const profileLink = page.locator(`a[href^="${samplePath}"]`).first()
    await profileLink.click()
    await page.locator('.player-chart').waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    if ([375, 768, 1440].includes(width))
      await page.screenshot({ path: `${output}/profile-${width}.png`, fullPage: true })
    if (width === 1440) {
      await page.getByRole('button', { name: 'Подборы', exact: true }).first().click()
      assert.ok(await page.locator('.player-chart circle').count())
      await page.goto(origin + '/players/' + encodeURIComponent(linked.player.id))
      await page.locator('.player-log tbody a').first().click()
      await page.locator('.player-box-score').first().waitFor()
      const back = page.getByRole('link', { name: 'К профилю игрока', exact: true })
      await back.click()
      await page.locator('.player-chart').waitFor()
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
} finally {
  await browser.close()
}
console.log({ ...directory.coverage, profiles: profiles.length, full: full.length, viewports: 6 })
