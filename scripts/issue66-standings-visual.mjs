import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.resolve(process.env.STANDINGS_OUTPUT ?? path.join(root, 'artifacts/issue-66'))
const baseline = process.env.STANDINGS_BASELINE_ROOT
const full = JSON.parse(
  await readFile(new URL('./fixtures/standings-a.synthetic.json', import.meta.url)),
)
const viewports = [
  ['desktop', 1440, 900],
  ['mobile', 375, 812],
  ['narrow', 320, 600],
  ['tablet', 768, 1024],
]
const pairs = [
  ['BOS', 'Boston Celtics', 'LAL', 'Los Angeles Lakers'],
  ['CHI', 'Chicago Bulls', 'MIN', 'Minnesota Timberwolves'],
]

function error(code) {
  return {
    code,
    message: 'Synthetic fixture',
    retryable: true,
    provider: null,
    upstreamStatus: null,
  }
}

function withTeam(code, change) {
  const snapshot = structuredClone(full)
  change(snapshot.data.find((row) => row.team.abbreviation === code))
  return snapshot
}

const fixtures = {
  full,
  partial: { ...full, data: [...full.data.slice(0, 8), ...full.data.slice(15)] },
  ties: withTeam('CLE', (row) => {
    Object.assign(row.record, { wins: 15, losses: 4, awayWins: 7, awayLosses: 2 })
    row.winPercentage = 15 / 19
  }),
  conflict: withTeam('NYK', (row) => (row.winPercentage = 0.515)),
  null: withTeam('BOS', (row) => {
    row.winPercentage = null
    for (const field of ['lastTenWins', 'homeWins', 'awayWins', 'conferenceWins', 'averageMargin'])
      row.record[field] = null
  }),
  official: withTeam('BOS', (row) => (row.officialRank = 1)),
  stale: { ...full, meta: { ...full.meta, isStale: true, fetchedAt: '2026-11-23T17:20:00.000Z' } },
  refreshError: { ...full, meta: { ...full.meta, refreshError: error('storage_unavailable') } },
  empty: { ...full, data: [] },
}

const measurements = { baseline: {}, implementation: {}, journeys: {} }
const failedRequests = []
const pageErrors = []
const region = (page) => page.locator('.standings-scroll')
const table = (page) => page.locator('.standings-table')
const rows = (page) => table(page).locator('tbody tr')
const compareMode = (page) => page.getByRole('button', { name: 'Режим сравнения' })
const compareSubmit = (page) => page.getByRole('button', { name: 'Сравнить команды', exact: true })
const compareBox = (page, name) =>
  table(page).getByRole('checkbox', { name: 'Сравнить ' + name, exact: true })
const dialog = (page) => page.getByRole('dialog', { name: 'Сравнение команд' })
const search = (page) => page.getByRole('searchbox', { name: 'Поиск команды в таблице' })
const sort = (page) => page.getByRole('combobox', { name: 'Сортировка турнирной таблицы' })
const direction = (page) => page.getByRole('button', { name: /^Порядок сортировки:/ })
const west = (page) => page.getByRole('button', { name: 'Запад', exact: true })
const east = (page) => page.getByRole('button', { name: 'Восток', exact: true })
const refresh = (page) => page.getByRole('button', { name: 'Обновить данные', exact: true })
const capture = (page, name, fullPage = false) =>
  page.screenshot({ path: path.join(output, name + '.png'), fullPage, animations: 'disabled' })
const crop = (locator, name) =>
  locator.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' })

async function runServer(appRoot, port) {
  const deps = await realpath(path.join(appRoot, 'node_modules'))
  const server = await createServer({
    root: appRoot,
    configFile: path.join(appRoot, 'vite.config.ts'),
    cacheDir: path.join(output, '.vite-' + port),
    logLevel: 'error',
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      ws: false,
      fs: { allow: [appRoot, deps] },
    },
  })
  await server.listen()
  return server
}

async function contextFor(browser, width, height, port) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: 'ru-RU',
    timezoneId: 'Asia/Nicosia',
  })
  const origin = 'http://127.0.0.1:' + port
  let state = 'full'
  let requests = 0
  let release
  await context.addInitScript(() => {
    if (!localStorage.getItem('buzzerboard.favorite-teams.v1')) {
      localStorage.setItem(
        'buzzerboard.favorite-teams.v1',
        JSON.stringify(['nba:team:NYK', 'nba:team:LAL']),
      )
    }
  })
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) {
      if (route.request().resourceType() !== 'image') failedRequests.push(url.origin)
      return route.abort()
    }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (
      url.pathname !== '/api/standings' ||
      url.search !== '?seasonEndYear=2027' ||
      route.request().method() !== 'GET'
    ) {
      failedRequests.push(url.pathname)
      return route.abort()
    }
    requests++
    const mode = state
    if (mode === 'loading')
      await new Promise((resolve) => {
        release = resolve
      })
    if (mode === 'error' || mode === 'cache_miss') {
      return route.fulfill({
        status: 503,
        json: { error: error(mode === 'error' ? 'storage_unavailable' : mode) },
      })
    }
    return route.fulfill({ json: fixtures[mode] ?? full })
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  return {
    page,
    open: () => page.goto(origin + '/standings', { waitUntil: 'domcontentloaded' }),
    setState: (value) => {
      state = value
    },
    requests: () => requests,
    doneLoading: () => release?.(),
    close: () => context.close(),
  }
}

async function ready(page) {
  await rows(page).first().waitFor()
  await page.locator('.gc-team-fallback').first().waitFor({ state: 'attached' })
  await page.evaluate(() => document.fonts.ready)
}

async function measure(page) {
  return page.evaluate(() => {
    const round = (n) => Math.round(n * 10) / 10
    const rect = (target) => document.querySelector(target)?.getBoundingClientRect()
    const height = (target) => Math.round(rect(target)?.height ?? 0)
    const scroll = document.querySelector('.standings-scroll')
    const first = document.querySelector('.standings-table tbody tr')
    const cols = [
      first.querySelector('.team-cell'),
      first.querySelector('.record-cell'),
      first.querySelector('.pct-cell'),
      first.querySelector('.pct-cell').nextElementSibling,
    ]
    const fold = Math.min(
      innerHeight,
      rect('.gc-mobile-nav')?.top || innerHeight,
      scroll.getBoundingClientRect().bottom,
    )
    const viewportRight = scroll.getBoundingClientRect().left + scroll.clientWidth
    return {
      width: innerWidth,
      height: innerHeight,
      fold: round(fold),
      firstRowY: round(first.getBoundingClientRect().top),
      fullVisibleRows: [...first.parentElement.rows].filter(
        (row) => row.getBoundingClientRect().bottom <= fold,
      ).length,
      blockHeights: {
        shell: height('.gc-topbar'),
        title: height('.standings-title, .standings-center .gc-page-heading'),
        conference: height('.standings-topline'),
        controls: height('.standings-filters'),
        sectionHeading: height('.standings-section-heading'),
        tableHead: height('.standings-table thead'),
      },
      primaryWidths: cols.map((col) => round(col.getBoundingClientRect().width)),
      primaryFonts: [first.querySelector('.table-team-name'), ...cols.slice(1)].map(
        (col) => getComputedStyle(col).fontSize,
      ),
      fitsThrough: cols.map((col) => col.getBoundingClientRect().right <= viewportRight + 1),
      tableClient: [scroll.clientWidth, scroll.clientHeight],
      tableContent: [scroll.scrollWidth, scroll.scrollHeight],
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      loadedManropeFaces: [...document.fonts].filter(
        (font) => font.family.includes('Manrope') && font.status === 'loaded',
      ).length,
    }
  })
}

async function compareJourney(run, key, data, isBaseline, browsing) {
  const { page } = run
  const [left, leftName, right, rightName] = data
  await run.open()
  await ready(page)
  const steps = []
  const coordinates = async () =>
    page.evaluate(() => {
      const scroll = document.querySelector('.standings-scroll')
      return { x: scroll?.scrollLeft ?? 0, tableY: scroll?.scrollTop ?? 0, pageY: scrollY }
    })
  const step = async (label, action) => {
    const before = await coordinates()
    await action()
    steps.push({ label, before, after: await coordinates() })
  }
  if (!isBaseline) await step('Режим сравнения', () => compareMode(page).press('Enter'))
  if (!browsing) await step('Найти ' + left, () => search(page).fill(left))
  const pick = (name) => async () => compareBox(page, name).check()
  await step('Выбрать ' + left, pick(leftName))
  await step('Запад', () => west(page).click())
  if (!browsing) await step('Найти ' + right, () => search(page).fill(right))
  await step('Выбрать ' + right, pick(rightName))
  if (!isBaseline) {
    const bar = page.getByRole('complementary', { name: 'Выбранные команды' })
    assert.match(await bar.getByRole('status').textContent(), /2 \/ 2/)
    await bar.getByRole('button', { name: 'Убрать ' + leftName + ' из сравнения' }).waitFor()
    await bar.getByRole('button', { name: 'Убрать ' + rightName + ' из сравнения' }).waitFor()
    assert(steps.every(({ before, after }) => before.x === 0 && after.x === 0))
    if (browsing && left === 'BOS') {
      await capture(page, 'a-' + key + '-selection')
      await crop(bar, 'a-' + key + '-selection-crop')
    }
  }
  await step('Сравнить', () => compareSubmit(page).click())
  await dialog(page).waitFor()
  assert.equal(await dialog(page).locator('tbody tr').count(), 7)
  await dialog(page).getByText(leftName, { exact: true }).waitFor()
  await dialog(page).getByText(rightName, { exact: true }).waitFor()
  if (browsing && left === 'BOS') {
    const prefix = (isBaseline ? 'baseline-' : 'a-') + key + '-comparison'
    await capture(page, prefix)
    await crop(dialog(page), prefix + '-crop')
  }
  if (!isBaseline) {
    for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key)
      assert(await dialog(page).evaluate((el) => el.contains(document.activeElement)))
    }
  }
  await page.keyboard.press('Escape')
  await dialog(page).waitFor({ state: 'hidden' })
  assert(await compareSubmit(page).evaluate((el) => el === document.activeElement))
  measurements.journeys[
    [isBaseline ? 'baseline' : 'a', key, left, right, browsing ? 'list' : 'search'].join('-')
  ] = steps
}

async function takeViewports(browser, appRoot, isBaseline, port) {
  const server = await runServer(appRoot, port)
  const kind = isBaseline ? 'baseline' : 'implementation'
  const prefix = isBaseline ? 'baseline-' : 'a-'
  try {
    for (const [key, width, height] of viewports) {
      const run = await contextFor(browser, width, height, port)
      const { page } = run
      try {
        await run.open()
        await ready(page)
        assert.equal(await rows(page).count(), 15)
        const metrics = await measure(page)
        measurements[kind][key] = metrics
        assert.equal(metrics.pageOverflow, 0)
        assert(metrics.loadedManropeFaces >= 2)
        if (!isBaseline) {
          assert(metrics.fitsThrough.every(Boolean), JSON.stringify(metrics))
          assert(metrics.fullVisibleRows >= { desktop: 9, mobile: 5, narrow: 2, tablet: 9 }[key])
        }
        await capture(page, prefix + key)
        await capture(page, prefix + key + '-full', true)
        if (!isBaseline) {
          const renderExpanded = await page.addStyleTag({
            content: '.standings-scroll { max-height: none } .gc-mobile-nav { position: static }',
          })
          await capture(page, prefix + key + '-all-rows', true)
          await renderExpanded.evaluate((el) => el.remove())
        }
        if (key === 'desktop' || key === 'mobile') {
          await crop(table(page).locator('thead'), prefix + key + '-headers')
          for (const pair of pairs) {
            for (const browsing of [true, false])
              await compareJourney(run, key, pair, isBaseline, browsing)
          }
        }
      } finally {
        await run.close()
      }
    }
    if (!isBaseline) await checkStates(browser, port)
  } finally {
    await server.close()
  }
}

async function checkStates(browser, port) {
  const run = await contextFor(browser, 375, 812, port)
  const { page } = run
  try {
    for (const state of [
      'partial',
      'ties',
      'conflict',
      'null',
      'official',
      'stale',
      'refreshError',
    ]) {
      run.setState(state)
      await run.open()
      await ready(page)
      if (['partial', 'ties', 'conflict', 'null'].includes(state)) {
        const gb = table(page).getByRole('button', { name: /расчётному отставанию/ })
        assert(await gb.isDisabled())
        assert(await page.locator('.standings-table-notice').isVisible())
        await sort(page).click()
        assert(await page.getByRole('option', { name: /Отставание/ }).isDisabled())
        await page.keyboard.press('Escape')
      }
      if (state === 'partial') assert.equal(await rows(page).count(), 8)
      if (state === 'null') {
        for (const key of [
          'winPercentage',
          'homeWins',
          'awayWins',
          'conferenceWins',
          'lastTenWins',
          'averageMargin',
        ]) {
          const label = {
            winPercentage: 'Процент побед',
            homeWins: 'Победы дома',
            awayWins: 'Победы в гостях',
            conferenceWins: 'Победы в конференции',
            lastTenWins: 'Победы в последних 10',
            averageMargin: 'Средняя разница очков',
          }[key]
          await sort(page).click()
          await page.getByRole('option', { name: label, exact: true }).click()
          for (let i = 0; i < 2; i++) {
            assert.match(await rows(page).last().innerText(), /Boston Celtics/)
            await direction(page).press('Enter')
          }
        }
        await search(page).fill('BOS')
      }
      if (state === 'official') {
        assert.equal(await table(page).locator('.rank-cell').first().innerText(), '1')
        assert.equal(await table(page).locator('.rank-cell').last().innerText(), '—')
        assert((await measure(page)).fitsThrough.every(Boolean))
      } else assert.equal(await table(page).locator('.rank-cell').count(), 0)
      await capture(page, 'a-state-' + state)
    }

    run.setState('full')
    await run.open()
    await ready(page)
    const originalTime = await page.locator('time').getAttribute('datetime')
    const count = run.requests()
    run.setState('error')
    await refresh(page).click()
    await page
      .getByText('Не удалось обновить данные. Показана последняя загруженная таблица.')
      .waitFor()
    assert.equal(run.requests() - count, 1)
    assert.equal(await page.locator('time').getAttribute('datetime'), originalTime)
    assert.equal(await rows(page).count(), 15)
    await capture(page, 'a-state-refetch-error')

    for (const [state, label] of [
      ['empty', 'Данные таблицы отсутствуют'],
      ['cache_miss', 'Таблица пока не загружена'],
      ['error', 'Не удалось загрузить таблицу'],
      ['loading', null],
    ]) {
      run.setState(state)
      await run.open()
      if (label) await page.getByRole('heading', { name: label }).waitFor()
      else await page.locator('.gc-skeleton-list').waitFor()
      await capture(page, 'a-state-' + state)
      run.doneLoading()
    }

    run.setState('full')
    await run.open()
    await ready(page)
    assert.equal(await table(page).locator('th[aria-sort]').count(), 1)
    for (const label of [
      'победам',
      'проценту побед',
      'расчётному отставанию от лидера',
      'победам дома',
      'победам в гостях',
      'победам в конференции',
      'победам в последних десяти матчах',
      'средней разнице очков',
    ]) {
      const header = table(page).getByRole('button', { name: new RegExp('«' + label + '»') })
      await header.press('Enter')
      const active = table(page).locator('th[aria-sort]')
      assert.equal(await active.count(), 1)
      const before = await active.getAttribute('aria-sort')
      await header.press('Enter')
      assert.notEqual(await active.getAttribute('aria-sort'), before)
    }
    await region(page).evaluate((el) => el.scrollTo(el.scrollWidth, 145))
    const sticky = await region(page).evaluate((el) => {
      const body = el.getBoundingClientRect()
      const head = el.querySelector('.team-heading').getBoundingClientRect()
      return { dx: Math.abs(body.x - head.x), dy: Math.abs(body.y - head.y) }
    })
    assert(sticky.dx < 2 && sticky.dy < 2)
    await crop(region(page), 'a-mobile-advanced')
    await west(page).click()
    assert.equal(await region(page).evaluate((el) => el.scrollLeft), 0)
    await sort(page).click()
    await page.getByRole('option', { name: 'Процент побед', exact: true }).click()
    if ((await table(page).locator('th[aria-sort]').getAttribute('aria-sort')) === 'ascending') {
      await direction(page).press('Enter')
    }
    await page.evaluate(() => scrollTo(0, 0))
    await capture(page, 'a-mobile-west-long-names')
    await east(page).click()
    await page.getByRole('button', { name: 'Добавить Boston Celtics в избранное' }).click()
    await page.getByRole('button', { name: 'Избранные', exact: true }).click()
    assert.equal(await rows(page).count(), 2)
    await capture(page, 'a-state-favorites')
    await search(page).fill('ZZ0')
    assert.equal(await rows(page).count(), 0)
    await capture(page, 'a-state-no-results')
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    assert.equal(await rows(page).count(), 15)
    assert.equal(
      await table(page).getByRole('link', { name: 'Boston Celtics' }).getAttribute('href'),
      '/teams/BOS',
    )

    await compareMode(page).click()
    await compareBox(page, 'Boston Celtics').focus()
    await page.keyboard.press('Space')
    await compareBox(page, 'Cleveland Cavaliers').check()
    assert(await compareBox(page, 'New York Knicks').isDisabled())
    await page.getByRole('button', { name: 'Убрать Boston Celtics из сравнения' }).click()
    assert(await compareBox(page, 'New York Knicks').isEnabled())
    await page.getByRole('button', { name: 'Сбросить выбор команд' }).click()
    assert(await compareSubmit(page).isDisabled())
    await page.getByRole('button', { name: 'Закрыть режим сравнения' }).click()
    assert(await compareMode(page).evaluate((el) => el === document.activeElement))
    assert(
      await page.getByRole('button', { name: 'Убрать Boston Celtics из избранного' }).isVisible(),
    )

    await compareMode(page).click()
    await compareBox(page, 'Boston Celtics').check()
    await compareBox(page, 'Cleveland Cavaliers').check()
    await compareSubmit(page).click()
    await dialog(page).waitFor()
    // Emulate enabling Spoiler Mode in another tab while Reka keeps the current dialog modal.
    await page.evaluate(() => {
      const key = 'buzzerboard:spoilers:v1'
      const newValue = JSON.stringify({ enabled: true })
      localStorage.setItem(key, newValue)
      window.dispatchEvent(new StorageEvent('storage', { key, newValue }))
    })
    await page.getByText('Турнирная таблица скрыта').waitFor()
    assert.equal(await dialog(page).count(), 0)
    assert(await east(page).evaluate((el) => el === document.activeElement))
    const html = await page.locator('body').innerHTML()
    for (const forbidden of [
      '15–4',
      '.789',
      'aria-sort',
      'standings-compare-bar',
      'Boston Celtics',
      '<time',
    ]) {
      assert(!html.includes(forbidden), forbidden)
    }
    await capture(page, 'a-state-spoiler')
    await page.getByRole('button', { name: 'Показать статистику' }).click()
    await ready(page)
    assert.equal(await rows(page).count(), 15)
    assert.equal(await page.getByRole('complementary', { name: 'Выбранные команды' }).count(), 0)
  } finally {
    await run.close()
  }
}

await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PW_EXECUTABLE_PATH || undefined,
})
try {
  await takeViewports(browser, root, false, 4194)
  if (baseline) await takeViewports(browser, path.resolve(baseline), true, 4193)
  assert.deepEqual(failedRequests, [])
  assert.deepEqual(pageErrors, [])
  measurements.head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  await writeFile(
    path.join(output, 'measurements.json'),
    JSON.stringify(measurements, null, 2) + '\n',
  )
  await writeFile(
    path.join(output, 'README.md'),
    [
      '# Standings A · GitHub #66',
      '',
      'Снимки реального Vue /standings в Chromium. Часовой пояс Asia/Nicosia. Один набор из 30 синтетических команд Terra, избранные NYK/LAL, внешние запросы заблокированы.',
      '',
      'Файлы baseline-* показывают main b4dfd416. Файлы a-* показывают реализацию. Варианты *-all-rows раскрывают размер внутренней таблицы для QA-снимка. Обычные PNG сохраняют реальные высоты и навигацию.',
      '',
      'В measurements.json сохранены y первой строки, количество полных строк до fold, размеры и шрифт четырёх основных колонок, overflow и координаты после действий для пар BOS–LAL и CHI–MIN.',
      '',
      'HEAD ' + measurements.head,
    ].join('\n') + '\n',
  )
  console.log('Standings viewports, A comparison, states and protected DOM verified.')
} finally {
  await browser.close()
}
