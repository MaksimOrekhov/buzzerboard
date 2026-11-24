import assert from 'node:assert/strict'

const origin = 'http://127.0.0.1:4186'

export async function checkFavoritesNavigation({ page, today, shift, capture }) {
  const selected = (value) => page.getByRole('button', { name: new RegExp(`^${value}`) })
  const isTab = async (value) =>
    assert.equal(await selected(value).getAttribute('aria-pressed'), 'true')
  const assertQuery = async (tab, date) => {
    await page.waitForURL(
      (url) =>
        url.pathname === '/favorites' &&
        url.searchParams.get('tab') === tab &&
        url.searchParams.get('date') === date &&
        url.searchParams.get('group') === 'shooting',
    )
  }

  await page.goto(`${origin}/favorites?tab=games&date=${today}&group=shooting`)
  await page.locator('.favorite-game-group .gc-score-row').first().waitFor()
  await isTab('Матчи')
  await page.reload()
  await page.locator('.favorite-game-group .gc-score-row').first().waitFor()
  await isTab('Матчи')
  await capture('pro221-favorites-before-date', { fullPage: false })

  await page.getByRole('button', { name: 'Выбрать игровую дату NBA' }).click()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  await assertQuery('games', shift(-1))
  await selected('Игроки').click()
  await assertQuery('players', shift(-1))
  await isTab('Игроки')
  await page.goBack()
  await assertQuery('games', shift(-1))
  await isTab('Матчи')
  await page.goForward()
  await assertQuery('players', shift(-1))
  await isTab('Игроки')
  await page.reload()
  await isTab('Игроки')

  await page.goto(`${origin}/favorites?tab=games&date=${today}&group=shooting`)
  await page.locator('.favorite-game-group .gc-score-row').first().waitFor()
  await page.getByRole('link', { name: 'Открыть карточку матча' }).first().click()
  await page.getByRole('heading', { name: 'Сравнение команд' }).waitFor()
  await page.getByRole('link', { name: 'К избранным матчам' }).click()
  await assertQuery('games', today)
  await page.locator('.favorite-game-group .gc-score-row').first().waitFor()
  await isTab('Матчи')

  await page.goto(`${origin}/favorites?tab=invalid&date=not-a-date`)
  await isTab('Команды')
  await selected('Матчи').click()
  await page.getByRole('button', { name: 'Выбрать игровую дату NBA' }).click()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  await page.waitForURL(
    (url) => url.pathname === '/favorites' && url.searchParams.get('date') === shift(-1),
  )
  await isTab('Матчи')
}
