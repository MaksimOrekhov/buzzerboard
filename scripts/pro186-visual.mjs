import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'artifacts/pro-186/synthetic')
const checks = []
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())
const shift = (days) => {
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
const team = (id, name) => ({
  id: `test:team:${id}`,
  providerId: id,
  abbreviation: id,
  displayName: name,
})
const games = Array.from({ length: 15 }, (_, index) => ({
  id: `dunkapi:game:synthetic-${index}`,
  provider: 'dunkapi',
  providerId: `synthetic-${index}`,
  seasonEndYear: 2027,
  nbaGameDate: today,
  startsAt: `${today}T${String(10 + Math.floor(index / 2)).padStart(2, '0')}:00:00Z`,
  status: index < 12 ? 'final' : 'scheduled',
  awayTeam: team(
    `A${index}`,
    index === 0
      ? 'Synthetic exceptionally long basketball team name'
      : `Away Test Club ${index + 1}`,
  ),
  homeTeam: team(`H${index}`, `Home Test Club ${index + 1}`),
  score: index < 12 ? { away: 101 + index, home: 110 + index * 2 } : { away: null, home: null },
  scoreByPeriod: index === 0 ? [{ period: 1, away: 20, home: 30 }] : null,
  venue: index === 0 ? 'Synthetic Arena' : null,
}))
const meta = {
  source: 'dunkapi',
  fetchedAt: `${today}T08:00:00Z`,
  providerUpdatedAt: null,
  isStale: false,
  rejectedRecords: 0,
  refreshError: null,
}
const error = {
  error: {
    code: 'cache_miss',
    message: 'Synthetic cache miss',
    retryable: true,
    provider: null,
    upstreamStatus: null,
  },
  requestId: null,
}
await mkdir(output, { recursive: true })
const server = await createServer({
  cacheDir: path.join(root, 'node_modules/.vite-pro186'),
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 4186, strictPort: true },
})
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || undefined })
  for (const width of [375, 620, 768, 1024, 1280, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      locale: 'ru-RU',
      timezoneId: 'Asia/Nicosia',
    })
    let mode = 'ready'
    const calls = []
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.hostname !== '127.0.0.1') return route.abort()
      if (!url.pathname.startsWith('/api/')) return route.continue()
      calls.push({ path: url.pathname, method: request.method() })
      if (mode === 'loading') await new Promise((resolve) => setTimeout(resolve, 1200))
      if (mode === 'error') return route.fulfill({ status: 503, json: error })
      const date = url.searchParams.get('date')
      const records =
        mode === 'empty'
          ? []
          : date === today
            ? games
            : games.slice(10).map((game) => ({ ...game, nbaGameDate: date }))
      return route.fulfill({
        json: { data: records, meta: { ...meta, isStale: mode === 'stale' } },
      })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const visit = async () => {
      await page.goto(`http://127.0.0.1:4186/games?date=${today}`)
      await page.evaluate(() => document.fonts.ready)
    }
    const capture = async (label) => {
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      assert.ok(documentWidth <= width, `${width} ${label}: overflow ${documentWidth}`)
      await page.screenshot({
        path: path.join(output, `${width}-${label}.png`),
        fullPage: true,
        animations: 'disabled',
      })
    }
    await visit()
    await page.locator('.gc-score-row').last().waitFor()
    assert.equal(await page.locator('.gc-score-row').count(), 15)
    await capture('ready')
    // Search, team filter, date reset, status, sort, and persisted favorites.
    await page.getByRole('searchbox', { name: 'Поиск команды' }).fill('exceptionally')
    assert.equal(await page.locator('.gc-score-row').count(), 1)
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await page.getByRole('combobox', { name: 'Фильтр по команде' }).click()
    await capture('select-open')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.getByRole('combobox', { name: 'Фильтр по команде' }).click()
    await page.getByRole('option', { name: 'Home Test Club 1', exact: true }).click()
    assert.equal(await page.locator('.gc-score-row').count(), 1)
    await page.getByRole('button', { name: 'Предыдущий день', exact: true }).click()
    await page.waitForURL(`**date=${shift(-1)}`)
    assert.equal(
      await page.getByRole('combobox', { name: 'Фильтр по команде' }).innerText(),
      'Все команды',
    )
    await page.getByRole('button', { name: 'Сегодня', exact: true }).click()
    await page.waitForURL(`**date=${today}`)
    await page.locator('.gc-score-row').last().waitFor()
    await page.getByRole('button', { name: 'Предстоящие', exact: false }).click()
    assert.equal(await page.locator('.gc-score-row').count(), 3)
    await page.getByRole('button', { name: 'Все матчи', exact: false }).click()
    const first = await page.locator('.gc-score-row').first().getAttribute('aria-label')
    await page.getByRole('button', { name: 'Сначала ранние. Изменить порядок' }).click()
    assert.notEqual(await page.locator('.gc-score-row').first().getAttribute('aria-label'), first)
    await page.getByRole('button', { name: 'Сначала поздние. Изменить порядок' }).click()
    await page.getByRole('button', { name: 'Добавить матч в избранное' }).first().click()
    await page.getByRole('button', { name: 'Только избранные', exact: true }).click()
    assert.equal(await page.locator('.gc-score-row').count(), 1)
    await page.reload()
    await page.getByRole('button', { name: 'Только избранные', exact: true }).click()
    assert.equal(await page.locator('.gc-score-row').count(), 1)
    await page.getByRole('button', { name: 'Детали матча', exact: true }).click()
    assert.equal(await page.getByText('Synthetic Arena', { exact: true }).isVisible(), true)
    assert.equal(await page.getByRole('table').isVisible(), true)
    await page.getByRole('button', { name: 'Выбрать игровую дату NBA' }).click()
    await capture('calendar-open')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')
    await page.waitForURL(`**date=${shift(-1)}`)
    await page.getByRole('button', { name: 'Сегодня', exact: true }).click()
    await page.waitForURL(`**date=${today}`)
    await page.getByRole('button', { name: 'Выбрать игровую дату NBA' }).click()
    await page.keyboard.press('Escape')
    assert.equal(
      await page
        .getByRole('button', { name: 'Выбрать игровую дату NBA' })
        .evaluate((node) => document.activeElement === node),
      true,
    )
    await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
    await page.getByRole('button', { name: 'Убрать матч из избранного' }).click()
    await page.getByRole('button', { name: 'Только избранные', exact: true }).click()
    assert.equal(await page.getByText('Матчи не найдены', { exact: true }).isVisible(), true)
    for (const state of ['loading', 'empty', 'error', 'stale']) {
      mode = state
      await page.reload({ waitUntil: 'domcontentloaded' })
      if (state === 'loading') await page.locator('[aria-busy="true"]').waitFor()
      else if (state === 'empty')
        await page.getByText('В этот день матчей нет', { exact: true }).waitFor()
      else if (state === 'error')
        await page.getByText('За этот день пока нет данных', { exact: true }).waitFor()
      else await page.getByText('Данные устарели', { exact: false }).waitFor()
      await capture(state)
    }
    assert.ok(calls.every((call) => call.method === 'GET' && call.path === '/api/games'))
    assert.deepEqual(errors, [])
    checks.push({
      width,
      states: 8,
      interactions: 'search, filters, sort, favorites, details, date reset, keyboard, GET-only',
    })
    await context.close()
  }
  await writeFile(path.join(output, 'checks.json'), JSON.stringify(checks, null, 2))
  console.info(
    `Game Center: ${checks.length} viewports passed; only synthetic GET responses, no upstream`,
  )
} finally {
  await browser?.close()
  await server.close()
}
