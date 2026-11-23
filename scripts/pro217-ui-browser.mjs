import assert from 'node:assert/strict'

const origin = 'http://127.0.0.1:4186'

export async function checkUiAudit({
  page,
  capture,
  today,
  game,
  player,
  teams,
  meta,
  baseline,
  setMode,
}) {
  const stats = {
    gamesPlayed: 33,
    pointsPerGame: 127.3,
    fieldGoalPercentage: 0.459,
    threePointPercentage: 0.352,
    reboundsPerGame: 43,
    assistsPerGame: 26,
    turnoversPerGame: 12,
  }
  const season = {
    wins: 31,
    losses: 2,
    winPercentage: 31 / 33,
    overallRank: 1,
    gamesBack: 0,
    stats,
    isStale: false,
  }
  const teamMeta = { ...meta, source: 'bbs' }
  const directory = teams.map((entry, index) => ({
    ...entry,
    season: { ...season, wins: 31 - index, overallRank: index + 1 },
  }))
  const teamApi = (url) => /^\/api\/teams(?:\/[^/]+)?$/.test(url.pathname)
  const serveTeam = (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin || route.request().method() !== 'GET') return route.abort()
    if (url.pathname === '/api/teams') {
      return route.fulfill({
        json: { data: directory, coverage: { total: 30, available: 30 }, meta: teamMeta },
      })
    }
    const entry = directory.find(({ code }) => url.pathname.endsWith('/' + code))
    if (!entry) return route.abort()
    return route.fulfill({
      json: {
        meta: teamMeta,
        data: {
          ...entry.season,
          team: entry.team,
          seasonEndYear: Number(url.searchParams.get('seasonEndYear')),
          conferenceRank: null,
          streak: null,
          home: null,
          away: null,
          nextGame: null,
          lastTen: null,
          leaders: [
            { playerId: player.id, displayName: player.name, statLabel: 'PTS', statValue: 127.3 },
          ],
        },
      },
    })
  }
  await page.route(teamApi, serveTeam)
  const visit = (route) => page.goto(origin + route)
  const screenshot = (label, fullPage = false) => capture('audit-' + label, { fullPage })
  const scrollTo = (selector) =>
    page
      .locator(selector)
      .first()
      .evaluate((node) => {
        node.scrollIntoView({ block: 'start' })
        window.scrollBy(0, -12)
      })

  try {
    for (const [name, route, ready] of [
      ['home', '/', '.overview-mini-row'],
      ['games', '/games?date=' + today, '.gc-score-row'],
      [
        'box-score',
        '/games/' + encodeURIComponent(game.id) + '?date=' + today,
        '.player-box-score',
      ],
      ['standings', '/standings', '.standings-table tbody tr'],
      ['teams', '/teams', '.teams-grid article'],
      ['players', '/players', '.players-table tbody tr'],
      ['player', '/players/' + encodeURIComponent(player.id), '.player-chart'],
      ['news', '/news', 'h1'],
      ['favorites', '/favorites', 'h1'],
      ['not-found', '/not-a-page', 'h1'],
    ]) {
      await visit(route)
      await page.locator(ready).first().waitFor()
      await screenshot(name)
      const controls = { teams: '.teams-toolbar', players: '.players-filters' }[name]
      if (controls) {
        await scrollTo(controls)
        await screenshot(name + '-filters')
      }
    }

    await visit('/standings')
    const table = page.locator('.standings-scroll')
    const checkboxes = table.getByRole('checkbox', { name: /Сравнить/ })
    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()
    await table.evaluate((node) => {
      node.scrollLeft = node.scrollWidth
    })
    await screenshot('standings-scrolled')
    await page.getByRole('button', { name: 'Сравнить команды', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Сравнение команд' })
    await dialog.waitFor()
    if (!baseline) await assertInViewport(page, dialog, 'Comparison dialog')
    await screenshot('comparison-open')
    await page.keyboard.press('Escape')

    const gamePath = '/games?date=' + today
    for (const [state, label] of [
      ['loading', null],
      ['empty', 'В этот день матчей нет'],
      ['error', 'За этот день пока нет данных'],
      ['stale', 'Данные устарели'],
    ]) {
      setMode(state)
      await visit(gamePath)
      if (label) await page.getByText(label).first().waitFor()
      else await page.locator('.gc-skeleton-list').waitFor()
      await screenshot('games-' + state)
    }
    setMode('ready')
    await visit(gamePath)
    await page.locator('.gc-score-row').first().waitFor()
    const spoiler = page.getByRole('button', { name: 'Без спойлеров', exact: true })
    await spoiler.click()
    const hiddenRows = page.locator('.gc-score-row').filter({ hasText: 'Результат скрыт' })
    await hiddenRows.first().waitFor()
    if (!baseline) {
      assert.equal(await hiddenRows.locator('[aria-label^="Счёт"]').count(), 0)
    }
    await screenshot('games-spoiler')
    await spoiler.click()
    await page.getByRole('button', { name: 'Выбрать игровую дату NBA' }).click()
    const calendar = page.locator('.gc-calendar-popover')
    await calendar.waitFor()
    if (!baseline) await assertInViewport(page, calendar, 'Calendar')
    await screenshot('calendar-open')
    await page.keyboard.press('Escape')
    const gameSelect = page.getByRole('combobox', { name: 'Фильтр по команде' })
    await gameSelect.click()
    const longOption = page.getByRole('option', { name: game.awayTeam.displayName })
    await longOption.waitFor()
    if (!baseline) await assertMenuFits(page)
    await screenshot('games-select-open')
    await longOption.click()
    await screenshot('games-select-value')

    for (const code of ['CHI', 'LAL', 'MIN', 'NYK', 'POR']) {
      await visit('/teams/' + code)
      await page.locator('.teams-profile-overview').waitFor()
      await screenshot(code.toLowerCase() + '-overview')
      if (code === 'MIN') {
        await scrollTo('.teams-leaders')
        await screenshot('min-overview-leaders')
      }
      for (const [tab, panel] of [
        ['history', '.team-history'],
        ['coaches', '.team-coaches'],
      ]) {
        await visit('/teams/' + code + '?tab=' + tab)
        await page.locator(panel).waitFor()
        const figures = page.locator(panel + ' figure img')
        for (const photo of await figures.all()) {
          await photo.scrollIntoViewIfNeeded()
          const image = await photo.evaluate(async (img) => {
            await img.decode()
            return { width: img.naturalWidth, height: img.naturalHeight }
          })
          const display = await photo.boundingBox()
          assert.ok(display.width > 0 && display.height > 0)
          if (!baseline && tab === 'coaches') {
            assert.ok(Math.abs(display.width / display.height - image.width / image.height) < 0.02)
          }
        }
        await scrollTo(panel)
        const name = code.toLowerCase() + '-' + tab
        await screenshot(name)
        await screenshot(name + '-full', true)
        const controls = tab === 'history' ? '.team-history-controls' : '.coach-controls'
        await scrollTo(controls)
        await screenshot(name + '-filters')
        if (!baseline && code === 'LAL' && tab === 'history') {
          await checkHistoryKeyboard(page)
          await screenshot(name + '-category-value')
        }
        if (code === 'LAL' || code === 'POR') {
          const filter = page.locator(controls).getByRole('combobox').last()
          if (!baseline) {
            await filter.click()
            await assertMenuFits(page)
            await screenshot(name + '-select-open')
            await page.keyboard.press('Escape')
            await assertFocused(filter)
            await chooseOption(
              page,
              filter,
              tab === 'history' ? 'Сначала поздние' : 'Сначала ранние',
            )
            await screenshot(name + '-select-value')
          }
        }
      }
    }
    if (page.viewportSize().height === 600) {
      const staleDate = new Date(today + 'T15:00:00Z')
      staleDate.setUTCDate(staleDate.getUTCDate() + 30)
      await page.clock.setFixedTime(staleDate)
      await visit('/teams/POR?tab=coaches')
      await page.getByText('Последнее подтверждённое назначение. Нужна повторная сверка.').waitFor()
      const phase = page.getByRole('combobox', { name: 'Период', exact: true })
      if (!baseline) {
        await phase.click()
        await assertMenuFits(page)
        await screenshot('por-coaches-stale-select-open')
        await page.keyboard.press('Escape')
        await chooseOption(page, phase, 'Последнее подтверждённое')
      }
      await scrollTo('.team-coaches')
      await screenshot('por-coaches-stale')
      await page.clock.setFixedTime(new Date())
    }
  } finally {
    setMode('ready')
    await page.unroute(teamApi, serveTeam)
  }
}

async function checkHistoryKeyboard(page) {
  const category = page.getByRole('combobox', { name: 'Категория', exact: true })
  await page.mouse.move(0, 0)
  await category.focus()
  await category.press('ArrowDown')
  await assertMenuFits(page)
  await assertFocused(page.getByRole('option', { name: 'Все события', exact: true }))
  await page.keyboard.press('ArrowDown')
  await assertFocused(page.getByRole('option', { name: 'История', exact: true }))
  await page.keyboard.press('ArrowDown')
  await assertFocused(page.getByRole('option', { name: 'Переезды и имена', exact: true }))
  await page.keyboard.press('Enter')
  await assertFocused(category)
  await category.getByText('Переезды и имена', { exact: true }).waitFor()
  await page.keyboard.press('Tab')
  await assertFocused(page.getByRole('combobox', { name: 'Порядок', exact: true }))
}

async function assertInViewport(page, locator, label) {
  const box = await locator.boundingBox()
  const { width, height } = page.viewportSize()
  assert.ok(
    box.x >= -1 && box.x + box.width <= width + 1,
    label + ' crosses the viewport horizontally: ' + JSON.stringify(box),
  )
  assert.ok(
    box.y >= -1 && box.y + box.height <= height + 1,
    label + ' crosses the viewport vertically: ' + JSON.stringify(box),
  )
}

export async function assertMenuFits(page) {
  const menu = page.getByRole('listbox')
  await menu.waitFor()
  await assertInViewport(page, menu, 'Dropdown')
  assert.equal(await menu.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), true)
  assert.equal(
    await menu.evaluate((node) => !node.closest('main')),
    true,
    'Dropdown must use the portal',
  )
}

export async function assertFocused(trigger) {
  await trigger.and(trigger.page().locator(':focus')).waitFor({ timeout: 3000 })
}

export async function chooseOption(page, trigger, label) {
  await trigger.click()
  await page.getByRole('option', { name: label, exact: true }).click()
  await trigger.getByText(label, { exact: true }).waitFor({ timeout: 3000 })
}
