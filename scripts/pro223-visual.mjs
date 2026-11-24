import assert from 'node:assert/strict'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

// All API responses below are synthetic; external requests are blocked.
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.resolve(process.env.PRO223_OUTPUT || path.join(workspace, 'artifacts/pro-223'))
const roots = {
  main: process.env.PRO223_MAIN_ROOT,
  before: process.env.PRO223_BEFORE_ROOT,
  after: workspace,
}
const phases = (process.env.PRO223_PHASES || 'main,before,after').split(',')
const date = '2026-11-23'
const futureDate = '2026-11-25'
const names = [
  ['MIN', 'Minnesota Timberwolves', 'GSW', 'Golden State Warriors', 112, 108, 'final'],
  ['BKN', 'Brooklyn Nets', 'CHI', 'Chicago Bulls', 107, 109, 'final'],
  ['DEN', 'Denver Nuggets', 'SAC', 'Sacramento Kings', null, 101, 'final'],
  ['BOS', 'Boston Celtics', 'NYK', 'New York Knicks', null, null, 'scheduled'],
  ['LAL', 'Los Angeles Lakers', 'PHX', 'Phoenix Suns', null, null, 'postponed'],
  ['MIL', 'Milwaukee Bucks', 'MIA', 'Miami Heat', null, null, 'unknown'],
  ['DAL', 'Dallas Mavericks', 'HOU', 'Houston Rockets', null, null, 'live'],
  ['PHI', 'Philadelphia 76ers', 'TOR', 'Toronto Raptors', 104, 110, 'final'],
  ['CLE', 'Cleveland Cavaliers', 'ATL', 'Atlanta Hawks', 117, 113, 'final'],
  ['IND', 'Indiana Pacers', 'ORL', 'Orlando Magic', 101, 106, 'final'],
  ['MEM', 'Memphis Grizzlies', 'NOP', 'New Orleans Pelicans', 119, 114, 'final'],
  ['OKC', 'Oklahoma City Thunder', 'SAS', 'San Antonio Spurs', 122, 115, 'final'],
  ['POR', 'Portland Trail Blazers', 'UTA', 'Utah Jazz', 98, 99, 'final'],
  ['DET', 'Detroit Pistons', 'CHA', 'Charlotte Hornets', 104, 105, 'final'],
  ['LAC', 'Los Angeles Clippers', 'WAS', 'Washington Wizards', 104, 99, 'final'],
]
const team = (code, displayName) => ({
  id: `nba:team:${code}`,
  providerId: code,
  abbreviation: code,
  displayName,
})
const fixture = (future = false) =>
  names.map(([away, awayName, home, homeName, a, h, status], index) => ({
    id: `dunkapi:game:pro223-${index}`,
    provider: 'dunkapi',
    providerId: `pro223-${index}`,
    seasonEndYear: 2027,
    nbaGameDate: future ? futureDate : date,
    startsAt: new Date(
      Date.parse(future ? '2026-11-26T00:00:00Z' : '2026-11-24T00:00:00Z') + index * 900000,
    ).toISOString(),
    status: future ? 'scheduled' : status,
    awayTeam: team(away, awayName),
    homeTeam: team(home, homeName),
    score: future ? { away: null, home: null } : { away: a, home: h },
    scoreByPeriod: null,
    venue: null,
  }))
const sizes = [
  [320, 600],
  [375, 812],
  [768, 1024],
  [1440, 900],
]
const results = {}
await mkdir(output, { recursive: true })
await writeFile(
  path.join(output, 'README.txt'),
  'PRO-223 synthetic visual comparison. main = 2650134, before = a240237, after = PR HEAD. External requests are blocked; logos show existing fallback. Scores, names and states are synthetic, not NBA results. Row PNGs are browser captures of real Vue components.\n',
)
const browser = await chromium.launch({ headless: true })
try {
  for (const phase of phases) {
    const root = roots[phase]
    assert.ok(root, `Set PRO223_${phase.toUpperCase()}_ROOT`)
    const dir = path.join(output, phase)
    await mkdir(dir, { recursive: true })
    const server = await createServer({
      root,
      configFile: path.join(root, 'vite.config.ts'),
      logLevel: 'error',
      server: {
        host: '127.0.0.1',
        port: 4293,
        strictPort: true,
        fs: { allow: [await realpath(workspace), await realpath(root)] },
      },
    })
    await server.listen()
    try {
      results[phase] = {}
      for (const [width, height] of sizes) {
        const states =
          width === 375 || width === 1440
            ? [
                'ready',
                'spoiler',
                'future',
                'filters',
                ...(width === 375 ? ['stale', 'error', 'empty', 'loading'] : []),
              ]
            : ['ready']
        for (const state of states) {
          const context = await browser.newContext({
            viewport: { width, height },
            locale: 'ru-RU',
            timezoneId: 'Asia/Nicosia',
            hasTouch: width <= 375,
          })
          await context.route('**/*', async (route) => {
            const url = new URL(route.request().url())
            if (url.hostname !== '127.0.0.1') return route.abort()
            if (!url.pathname.startsWith('/api/')) return route.continue()
            if (route.request().method() !== 'GET') return route.abort()
            if (url.pathname.startsWith('/api/games/')) {
              const game = fixture().find(
                (item) => item.id === decodeURIComponent(url.pathname.split('/').at(-1)),
              )
              if (!game) return route.abort()
              return route.fulfill({
                json: {
                  data: { game, boxScore: null },
                  meta: {
                    source: 'bbs',
                    fetchedAt: '2026-11-24T10:20:00Z',
                    providerUpdatedAt: null,
                    isStale: false,
                    rejectedRecords: 0,
                    refreshError: null,
                  },
                  boxScoreMeta: null,
                  boxScoreAvailability: 'unavailable',
                },
              })
            }
            if (url.pathname !== '/api/games') return route.abort()
            if (state === 'loading') await new Promise((resolve) => setTimeout(resolve, 5000))
            if (state === 'error')
              return route.fulfill({
                status: 503,
                json: { error: { code: 'unavailable', message: 'Unavailable' } },
              })
            return route.fulfill({
              json: {
                data: state === 'empty' ? [] : fixture(state === 'future'),
                meta: {
                  source: 'bbs',
                  fetchedAt: '2026-11-24T10:20:00Z',
                  providerUpdatedAt: null,
                  isStale: state === 'stale',
                  rejectedRecords: 0,
                  refreshError: null,
                },
              },
            })
          })
          const page = await context.newPage()
          const failedFonts = []
          page.on('response', (response) => {
            if (/\.woff2(?:\?|$)/.test(response.url()) && !response.ok())
              failedFonts.push(response.status())
          })
          await page.clock.setFixedTime(new Date('2026-11-24T12:00:00Z'))
          if (state === 'spoiler' || state === 'future')
            await page.addInitScript(() =>
              localStorage.setItem(
                'buzzerboard:spoilers:v1',
                JSON.stringify({ enabled: true, day: '2026-11-24', games: [], aggregates: [] }),
              ),
            )
          await page.goto(
            `http://127.0.0.1:4293/games?date=${state === 'future' ? futureDate : date}`,
            { waitUntil: 'domcontentloaded' },
          )
          if (state === 'loading') await page.locator('.gc-skeleton-list').waitFor()
          else if (state === 'error') await page.getByText('Не удалось загрузить матчи').waitFor()
          else if (state === 'empty') await page.getByText('В этот день матчей нет').waitFor()
          else await page.locator('.gc-score-row').nth(14).waitFor()
          await page.evaluate(() => document.fonts.ready)
          assert.deepEqual(
            failedFonts,
            [],
            'Local Manrope fonts must load for comparable screenshots',
          )
          if (state === 'filters') {
            if (phase !== 'main') await page.getByRole('button', { name: /^Фильтры/ }).click()
            if (phase === 'after' && width === 1440) {
              const labelFits = await page
                .getByRole('combobox', { name: 'Порядок матчей' })
                .locator('span')
                .first()
                .evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
              assert.equal(labelFits, true, 'Sort selection must not be truncated')
            }
          }
          const isOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          )
          assert.equal(isOverflow, false, `${phase} ${state} ${width}: horizontal overflow`)
          await page.screenshot({ path: path.join(dir, `${state}-${width}.png`) })
          if (state === 'ready') {
            const row = page.locator('.gc-score-row').first()
            const score = row
              .locator(
                phase === 'main'
                  ? width <= 620
                    ? '.gc-mobile-score'
                    : '.gc-score'
                  : '.gc-scoreboard-numbers',
              )
              .first()
            results[phase][width] = {
              rowTop: (await row.boundingBox()).y,
              scoreTop: (await score.boundingBox()).y,
              rowHeight: (await row.boundingBox()).height,
            }
            await page.screenshot({
              path: path.join(dir, `ready-${width}-full.png`),
              fullPage: true,
            })
            if (width === 375 || width === 1440)
              for (let index = 0; index < 5; index++)
                await page
                  .locator('.gc-score-row')
                  .nth(index)
                  .screenshot({ path: path.join(dir, `row-${index + 1}-${width}.png`) })
          }
          if ((state === 'spoiler' || state === 'future') && (width === 375 || width === 1440))
            await page
              .locator('.gc-score-row')
              .first()
              .screenshot({ path: path.join(dir, `row-${state}-${width}.png`) })
          if (phase === 'after' && state === 'ready') {
            const row = page.locator('.gc-score-row').first()
            assert.equal(
              await row.getByRole('link', { name: /Открыть матч:.*Счёт 112 : 108/ }).count(),
              1,
            )
            assert.equal(await row.locator('.gc-winner-marker').count(), 1)
            assert.equal(
              await row
                .getByRole('link', { name: 'Minnesota Timberwolves', description: 'Победитель' })
                .count(),
              1,
            )
            assert.equal(
              await page
                .locator('.gc-score-row')
                .nth(1)
                .getByRole('link', { name: 'Chicago Bulls', description: 'Победитель' })
                .count(),
              1,
            )
            assert.equal(
              await page
                .locator('.gc-score-row')
                .nth(2)
                .getByRole('link', { name: /Счёт неизвестен : 101/ })
                .count(),
              1,
            )
            assert.equal(
              await page
                .locator('.gc-score-row')
                .nth(3)
                .getByRole('link', { name: /Счёт неизвестен : неизвестен.*Ожидается/ })
                .count(),
              1,
            )
            assert.equal(
              await page.locator('.gc-score-row').nth(2).locator('.gc-winner-marker').count(),
              0,
            )
            assert.equal(
              await page.locator('.gc-score-row').nth(3).locator('.gc-winner-marker').count(),
              0,
            )
            assert.equal(
              await page.locator('.gc-score-row').nth(4).locator('.gc-winner-marker').count(),
              0,
            )
            assert.equal(await row.locator('a a, a button, button a').count(), 0)
            const contrast = await row.evaluate((el) => {
              const ratio = (foreground, background) => {
                const channels = (color) =>
                  color
                    .match(/\d+/g)
                    .slice(0, 3)
                    .map(Number)
                    .map((v) => {
                      const c = v / 255
                      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
                    })
                const luminance = (color) =>
                  channels(color).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
                const a = luminance(foreground),
                  b = luminance(background)
                return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
              }
              const background = getComputedStyle(el.closest('.gc-scoreboard')).backgroundColor
              return [
                '.gc-scoreboard-score--winner',
                '.gc-scoreboard-score--loser',
                '.gc-scoreboard-team--loser .gc-team-name',
              ].map((selector) =>
                ratio(getComputedStyle(el.querySelector(selector)).color, background),
              )
            })
            assert.ok(
              contrast.every((value) => value >= 4.5),
              `Text contrast: ${contrast}`,
            )
            if (width === 375) {
              const link = row.getByRole('link', { name: /Открыть матч:.*Счёт 112 : 108/ })
              const box = await link.boundingBox()
              assert.ok(box.width >= 44 && box.height >= 44, 'Match target must support touch')
              await link.focus()
              assert.equal(await link.evaluate((el) => el.matches(':focus-visible')), true)
              await row.getByRole('button', { name: 'Добавить матч в избранное' }).tap()
              assert.equal(
                await row.getByRole('button', { name: 'Убрать матч из избранного' }).count(),
                1,
              )
              const tab = page
                .getByRole('group', { name: 'Статус матчей' })
                .getByRole('button', { name: /^Уточняются/ })
              assert.equal(await tab.count(), 1, 'Unknown and live share one neutral tab')
              await tab.click()
              assert.equal(await page.locator('.gc-score-row').count(), 2)
              const href = await page
                .locator('.gc-score-row')
                .first()
                .locator('.gc-scoreboard-result')
                .getAttribute('href')
              assert.equal(
                new URL(
                  new URL(href, 'http://127.0.0.1').searchParams.get('from'),
                  'http://127.0.0.1',
                ).searchParams.get('status'),
                'unknown',
              )
              await page.locator('.gc-score-row').first().locator('.gc-scoreboard-result').click()
              await page.getByRole('link', { name: 'К игровому дню' }).click()
              assert.equal(
                await page
                  .getByRole('group', { name: 'Статус матчей' })
                  .getByRole('button', { name: /^Уточняются/ })
                  .getAttribute('aria-pressed'),
                'true',
              )
              await page.getByRole('button', { name: 'Предыдущий день' }).click()
              await page.waitForURL(/status=unknown/)
              await page.goBack()
              assert.equal(
                await page
                  .getByRole('group', { name: 'Статус матчей' })
                  .getByRole('button', { name: /^Уточняются/ })
                  .getAttribute('aria-pressed'),
                'true',
              )
              await page.goForward()
              assert.equal(new URL(page.url()).searchParams.get('status'), 'unknown')
            }
          }
          if (phase === 'after' && state === 'spoiler') {
            const row = page.locator('.gc-score-row').first()
            const html = await row.evaluate((el) => el.outerHTML)
            assert.doesNotMatch(html, /112|108|Победитель|gc-scoreboard-score--winner/)
            assert.equal(await row.locator('.gc-winner-marker').count(), 0)
          }
          if (phase === 'after' && state === 'future') {
            const link = page
              .locator('.gc-score-row')
              .first()
              .getByRole('link', { name: /Открыть матч:.*Ожидается/ })
            assert.equal(await link.count(), 1)
            assert.doesNotMatch(await link.getAttribute('aria-label'), /112|108|Счёт/)
          }
          await context.close()
        }
      }
    } finally {
      await server.close()
    }
    console.info(`PRO-223 ${phase}: captured synthetic desktop, mobile, rows and states`)
  }
  await writeFile(path.join(output, 'measurements.json'), JSON.stringify(results, null, 2))
  if (phases.includes('before') && phases.includes('after')) {
    for (const width of [375, 1440]) {
      const rows = [
        ['Победа гостей', 'row-1'],
        ['Победа хозяев', 'row-2'],
        ['Неполный счёт', 'row-3'],
        ['Ожидается', 'row-4'],
        ['Перенесён', 'row-5'],
        ['Без спойлеров', 'row-spoiler'],
      ]
      const sections = []
      for (const [label, filename] of rows) {
        const pictures = await Promise.all(
          ['before', 'after'].map(async (phase) => {
            const bytes = await readFile(path.join(output, phase, `${filename}-${width}.png`))
            return `<figure><figcaption>${phase === 'before' ? 'До' : 'После'}</figcaption><img src="data:image/png;base64,${bytes.toString('base64')}" alt=""></figure>`
          }),
        )
        sections.push(`<section><h2>${label}</h2><div>${pictures.join('')}</div></section>`)
      }
      const page = await browser.newPage({
        viewport: { width: width === 375 ? 1100 : 2200, height: 900 },
        deviceScaleFactor: 1,
      })
      await page.setContent(
        `<style>body{margin:0;padding:28px;background:#0d1017;color:#f1f4fa;font:20px system-ui}h1{margin:0 0 8px;font-size:26px}p{color:#c4ccda}h2{font-size:20px;margin:24px 0 8px}section>div{display:flex;gap:20px}figure{margin:0;flex:1;min-width:0}figcaption{color:#c4ccda;margin-bottom:8px}img{display:block;width:100%;height:auto;border:1px solid #384657;border-radius:8px}</style><h1>PRO-223 · Строки матчей — до / после</h1><p>Синтетические данные · ${width}px</p>${sections.join('')}`,
      )
      await page.screenshot({
        path: path.join(output, `rows-comparison-${width}.png`),
        fullPage: true,
      })
      await page.close()
    }
  }
} finally {
  await browser.close()
}
