import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const stage = process.argv[2]
assert.ok(['before', 'after'].includes(stage), 'Use before or after')
const output = `artifacts/pro-190/visual/${stage}`
await mkdir(output, { recursive: true })
const games = 'http://127.0.0.1:8787'
const teams = 'http://127.0.0.1:8788'
const date = '2026-11-16'
async function read(url) {
  const response = await fetch(url)
  assert.ok(response.ok, `${response.status}: ${url}`)
  return response.json()
}
const day = await read(`${games}/api/games?date=${date}`)
const game = day.data.find(
  ({ homeTeam, awayTeam }) =>
    [homeTeam.abbreviation, awayTeam.abbreviation].sort().join() === 'MEM,WAS',
)
assert.equal(day.meta.source, 'bbs')
assert.ok(game)
const gamePath = `/games/${encodeURIComponent(game.id)}?date=${date}`
assert.ok((await read(`${games}/api${gamePath}`)).data.boxScore)
assert.equal((await read(`${teams}/api/teams?seasonEndYear=2027`)).coverage.available, 30)
const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE_PATH })
const report = []
try {
  for (const width of [375, 768, 1024, 1280, 1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: 1040 }, deviceScaleFactor: 1 })
    const errors = []
    await page.route('**/*', (route) =>
      route
        .request()
        .url()
        .startsWith(games + '/') ||
      route
        .request()
        .url()
        .startsWith(teams + '/')
        ? route.continue()
        : route.abort(),
    )
    page.on('pageerror', (error) => errors.push(error.message))
    for (const [name, url, ready, fragments] of [
      [
        'game',
        games + gamePath,
        '.game-leader-card',
        ['.game-detail-hero', '.team-box-score-wrap', '.player-box-score'],
      ],
      [
        'profile',
        teams + '/teams/MEM',
        '.teams-leaders',
        ['.teams-stat-grid', '.teams-results-panel'],
      ],
      ['teams', teams + '/teams', '.teams-card', []],
    ]) {
      await page.goto(url)
      await page.locator(ready).first().waitFor()
      await page.evaluate(() => document.fonts.ready.then(() => undefined))
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        fonts: Object.fromEntries(
          [
            '.player-name',
            '.player-box-table td',
            '.player-sort',
            '.team-box-score td',
            '.game-leader-card > strong',
            '.teams-stat-grid span',
            '.teams-stat-grid strong',
          ].flatMap((selector) => {
            const element = document.querySelector(selector)
            return element ? [[selector, getComputedStyle(element).fontSize]] : []
          }),
        ),
      }))
      report.push({ name, width, ...layout })
      if (stage === 'after') assert.ok(layout.overflow <= 1, `${name} ${width}: page overflow`)
      if ([375, 1440].includes(width))
        await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true })
      if (width === 1440) {
        for (const selector of fragments)
          await page
            .locator(selector)
            .first()
            .screenshot({ path: `${output}/${name}-${selector.slice(1)}.png` })
      }
      if (stage === 'after' && width === 1440 && name === 'game') {
        const box = page.locator('.player-box-score').first()
        await box.getByRole('button', { name: 'Броски', exact: true }).click()
        await box.screenshot({ path: `${output}/game-shooting.png` })
        await box.getByRole('button', { name: 'Основное', exact: true }).click()
        await page.setViewportSize({ width: 720, height: 520 })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        await page
          .locator('.player-box-score')
          .first()
          .getByRole('button', { name: 'Сортировать по: Очки' })
          .focus()
        await page.keyboard.press('Enter')
        assert.equal(await box.locator('[aria-sort="ascending"]').count(), 1)
        await page.setViewportSize({ width, height: 1040 })
      }
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
} finally {
  await browser.close()
}
await writeFile(`${output}/measurements.json`, JSON.stringify(report, null, 2))
console.log(`${stage}: six viewports, real local cache, ${report.length} page checks`)
