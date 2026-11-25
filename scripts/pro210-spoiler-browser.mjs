import assert from 'node:assert/strict'

export async function checkSpoilerMode({
  page,
  today,
  shift,
  games,
  meta,
  syntheticBoxScore,
  playerMeta,
  syntheticPlayers,
  standings,
  capture,
}) {
  const origin = 'http://127.0.0.1:4186'
  const yesterday = shift(-1)
  const older = shift(-2)
  const tomorrow = shift(1)
  const newGame = (index, date, status, away, home, hour = '00') => ({
    ...games[index],
    id: 'bbs:game:' + games[index].providerId,
    provider: 'bbs',
    nbaGameDate: date,
    status,
    startsAt: `${date}T${hour}:30:00-05:00`,
    score: { away, home },
    scoreByPeriod: status === 'final' ? [{ period: 1, away: 31, home: 42 }] : null,
  })
  const first = newGame(0, yesterday, 'final', 137, 149)
  const second = newGame(1, yesterday, 'final', 122, 141, '01')
  const old = newGame(2, older, 'final', 97, 109)
  const live = newGame(3, today, 'live', 51, 47)
  const upcoming = newGame(4, today, 'scheduled', null, null, '23')
  const future = newGame(5, tomorrow, 'final', 148, 154)
  const records = [first, second, old, live, upcoming, future]
  const player = syntheticPlayers[1]
  const protectedPlayer = {
    ...player,
    averageUpdatedAt: `${today}T15:00:00.000Z`,
    stats: { ...player.stats, pts: 63.2 },
  }
  const teams =
    'ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split(
      ' ',
    )
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
  }
  const directory = teams.map((code, i) => ({
    code,
    name: code === 'BOS' ? 'Boston Celtics' : code,
    conference: i < 15 ? 'east' : 'west',
    division: 'Atlantic',
    team: { id: 'nba:team:' + code, providerId: null, abbreviation: code, displayName: code },
    season: { ...season, wins: code === 'BOS' ? 31 : 1, overallRank: i + 1, isStale: false },
  }))
  const fixtures = {
    '/api/players': {
      ...playerMeta,
      players: [protectedPlayer],
      coverage: { total: 1, providerRows: 1, checked: 1, averages: 1, enriched: 1, boxLinks: 2 },
    },
    '/api/teams': { data: directory, coverage: { total: 30, available: 30 }, meta },
    '/api/teams/BOS': {
      meta,
      data: {
        ...season,
        team: directory[1].team,
        seasonEndYear: 2027,
        conferenceRank: 1,
        streak: 'W13',
        home: null,
        away: null,
        nextGame: null,
        leaders: [
          {
            playerId: player.id,
            displayName: 'Hidden team leader',
            statLabel: 'PTS',
            statValue: 127.3,
          },
        ],
        lastTen: [
          {
            gameId: first.id,
            nbaGameDate: yesterday,
            opponentCode: 'PHI',
            result: 'W',
            pointsFor: 149,
            pointsAgainst: 137,
            venue: 'home',
          },
          {
            gameId: old.id,
            nbaGameDate: older,
            opponentCode: 'CLE',
            result: 'L',
            pointsFor: 97,
            pointsAgainst: 109,
            venue: 'away',
          },
        ],
      },
    },
    '/api/standings': {
      data: standings,
      meta: { ...meta, source: 'bbs', isStale: false, rejectedRecords: 0, refreshError: null },
    },
  }
  fixtures['/api/players/' + encodeURIComponent(player.id)] = {
    ...fixtures['/api/players'],
    player: protectedPlayer,
    detail: {
      birthDate: null,
      currentTeam: 'BOS',
      profileAt: meta.fetchedAt,
      logAt: meta.fetchedAt,
      games: [
        { date: yesterday, gameId: first.id, opponent: 'PHI', pts: 59, reb: 31, ast: 22, min: 45 },
        { date: older, gameId: old.id, opponent: 'CLE', pts: 19, reb: 5, ast: 2, min: 31 },
      ],
    },
  }
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== origin || route.request().method() !== 'GET') return route.abort()
      if (url.pathname === '/api/games')
        return route.fulfill({
          json: {
            meta,
            data: records.filter((game) => game.nbaGameDate === url.searchParams.get('date')),
          },
        })
      if (url.pathname.startsWith('/api/games/')) {
        const game = records.find(
          (item) =>
            item.id === decodeURIComponent(url.pathname.split('/').at(-1)) &&
            item.nbaGameDate === url.searchParams.get('date'),
        )
        if (game)
          return route.fulfill({
            json: {
              data: { game, boxScore: game.status === 'final' ? syntheticBoxScore(game) : null },
              meta,
              boxScoreMeta: game.status === 'final' ? meta : null,
              boxScoreAvailability: game.status === 'final' ? 'available' : 'unavailable',
            },
          })
      }
      const fixture = fixtures[url.pathname]
      return fixture ? route.fulfill({ json: fixture }) : route.abort()
    },
  )
  await page.clock.setFixedTime(new Date(`${today}T15:00:00Z`))
  const visit = (resource) => page.goto(origin + resource)
  const button = (name) => page.getByRole('button', { name, exact: true })
  const toggle = button('Без спойлеров')
  const rows = page.locator('.gc-score-row')
  const visibleResult = (row, value) =>
    row.locator(`[aria-label^="Счёт"]`).filter({ hasText: value })
  const noResult = async (root, values) => {
    const html = await root.evaluate((el) => el.outerHTML)
    for (const value of values)
      assert.ok(!html.includes(value), `Leaked ${value} in ${html.slice(0, 260)}`)
    assert.equal(
      await root
        .locator('.gc-match-team--winner, .gc-winner-marker, .game-detail-side--winner')
        .count(),
      0,
    )
  }
  const fixturesPath = '/games?date=' + yesterday
  const details = (game) => '/games/' + encodeURIComponent(game.id) + '?date=' + game.nbaGameDate

  await visit('/standings')
  await page.locator('.standings-table tbody tr').last().waitFor()
  assert.equal(await page.locator('.standings-table tbody tr').count(), 15)
  await page.locator('.gc-source-details summary').click()
  await page.getByText('Big Balls Sports Data').waitFor()

  await visit(fixturesPath)
  await visibleResult(rows.first(), '149').first().waitFor({ state: 'attached' })
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false')
  const matchFavorite = rows.first().locator('.gc-favorite')
  if ((await matchFavorite.getAttribute('aria-pressed')) !== 'true') await matchFavorite.click()
  await toggle.focus()
  await page.keyboard.press('Space')
  await rows.last().getByText('Результат скрыт').waitFor()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true')
  await noResult(rows.first(), ['Счёт 137', '>149<', '>137<', 'Победитель'])
  assert.equal(await page.locator('.gc-insights').count(), 0)
  await capture('spoilers-games')
  await visit('/games?date=' + older)
  await visibleResult(rows.first(), '109').first().waitFor({ state: 'attached' })
  await visit('/games?date=' + today)
  await rows.first().getByText('Результат скрыт').waitFor()
  await rows.last().getByText('Ожидается').waitFor()
  await visit('/games?date=' + tomorrow)
  await rows.first().getByText('Ожидается').waitFor()
  await noResult(rows.first(), ['>148<', '>154<', 'Завершён'])

  await page.addInitScript(() => {
    if (!location.pathname.startsWith('/games/') || !location.pathname.includes('synthetic-0'))
      return
    if (!JSON.parse(localStorage.getItem('buzzerboard:spoilers:v1') || '{}').enabled) return
    window.spoilerFlash = false
    const sensitive = '.game-detail-side > strong, .game-detail-leaders, .game-detail-periods'
    new MutationObserver((mutations) => {
      for (const { addedNodes } of mutations)
        for (const node of addedNodes)
          if (node instanceof Element && (node.matches(sensitive) || node.querySelector(sensitive)))
            window.spoilerFlash = true
    }).observe(document, { subtree: true, childList: true })
  })
  await visit(details(first))
  await button('Показать результат').waitFor()
  const detail = page.locator('.game-details-view')
  assert.equal(await detail.locator('h1').innerText(), 'Карточка матча')
  await noResult(detail, ['>149<', '>137<', 'Победитель', 'Synthetic scorer'])
  assert.equal(await page.evaluate(() => window.spoilerFlash), false)
  await capture('spoilers-game-detail')
  await button('Показать результат').click()
  await page.locator('.game-detail-side > strong').first().waitFor()
  await page.reload()
  await page.locator('.game-detail-periods').waitFor()
  await visit(fixturesPath)
  await rows.last().getByText('Результат скрыт').waitFor()
  await visibleResult(rows.first(), '149').first().waitFor({ state: 'attached' })
  await toggle.click()
  await visibleResult(rows.last(), '141').first().waitFor({ state: 'attached' })
  await toggle.click()
  await rows.first().getByText('Результат скрыт').waitFor()

  await visit('/?date=' + yesterday)
  await page.getByText('Картина сезона скрыта').waitFor()
  await rows.first().getByText('Результат скрыт').waitFor()
  assert.equal(await page.locator('.overview-mini-row').count(), 0)
  assert.equal(await page.getByText('Завершено', { exact: true }).count(), 0)
  assert.equal(
    await rows
      .first()
      .locator('.gc-scoreboard-result--hidden button')
      .evaluate((node) => {
        const button = node.getBoundingClientRect()
        return [
          ...node.closest('.gc-scoreboard-row').querySelectorAll('.gc-scoreboard-team'),
        ].every((team) => {
          const rect = team.getBoundingClientRect()
          return (
            button.right <= rect.left ||
            button.left >= rect.right ||
            button.bottom <= rect.top ||
            button.top >= rect.bottom
          )
        })
      }),
    true,
  )
  await capture('spoilers-home')

  await visit('/standings')
  await page.getByText('Турнирная таблица скрыта').waitFor()
  assert.equal(await page.locator('.standings-table, .standings-comparison').count(), 0)
  await button('Показать статистику').click()
  await page.locator('.standings-table tbody tr').first().waitFor()
  const teamFavorite = page.locator('.standings-table .favorite-button').first()
  if ((await teamFavorite.getAttribute('aria-pressed')) !== 'true') await teamFavorite.click()
  await visit('/favorites')
  await page.getByText('Показатели избранных команд скрыты').waitFor()
  assert.equal(await page.locator('.favorite-team-card dl').count(), 0)
  await visit('/favorites?tab=games&date=' + yesterday)
  await rows.first().getByText('Результат скрыт').waitFor()

  await visit('/teams')
  await page.getByText('Сезонные показатели команд скрыты').waitFor()
  assert.equal(await page.locator('.teams-card-stats').count(), 0)
  await page.getByRole('link', { name: 'Открыть профиль Boston Celtics' }).click()
  await page.getByText('Сезонная статистика скрыта').waitFor()
  const teamRows = page.locator('.teams-result-row')
  await teamRows.first().getByText('Результат скрыт').waitFor()
  await noResult(teamRows.first(), ['149–137', 'teams-result-outcome--w'])
  assert.ok((await teamRows.last().innerText()).includes('97–109'))
  assert.equal(await page.locator('.teams-leaders').count(), 0)
  await capture('spoilers-team')

  await visit('/players?gp=99&group=advanced')
  await page.getByText('Сезонные показатели игроков скрыты').waitFor()
  await page.getByRole('link', { name: player.name, exact: true }).waitFor()
  assert.equal(await page.getByRole('spinbutton').count(), 0)
  assert.equal(await page.locator('.players-table tbody td').count(), 0)
  await toggle.click()
  await page.getByText('Игроки по этим условиям не найдены.').waitFor()
  assert.equal(await page.getByRole('spinbutton').first().inputValue(), '99')
  await toggle.click()
  await page.getByRole('button', { name: 'Избранное: ' + player.name }).click()
  await visit('/favorites?tab=players')
  await page.getByText('Сезонные показатели игроков скрыты').waitFor()
  await page.getByRole('link', { name: player.name, exact: true }).click()
  await page.getByText('Сезонная статистика скрыта').waitFor()
  await noResult(page.locator('.player-center'), ['63,2', '>59<', ': 59</title>'])
  await page.locator('.player-chart title').first().waitFor({ state: 'attached' })
  assert.equal(await page.locator('.player-chart title').count(), 1)
  assert.ok((await page.locator('.player-chart title').textContent()).includes(': 19'))
  const fullyVisible = await button('Показать результат').evaluate((node) => {
    const bounds = node.getBoundingClientRect()
    const table = node.closest('table').parentElement.getBoundingClientRect()
    return bounds.left >= table.left && bounds.right <= Math.min(table.right, innerWidth)
  })
  assert.equal(fullyVisible, true)
  await capture('spoilers-player')
  await button('Показать результат').click()
  await page.getByRole('cell', { name: '59', exact: true }).waitFor()
  assert.equal(await page.getByText('Сезонная статистика скрыта').count(), 1)
  await visit(fixturesPath)
  await visibleResult(rows.first(), '149').first().waitFor({ state: 'attached' })
  await rows.last().getByText('Результат скрыт').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Без спойлеров' }).count(), 1)
}
