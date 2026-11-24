import assert from 'node:assert/strict'

// Runs against the real Game Details route after opening it from a filtered Game Center.
export async function checkGameDetailsAnchors(page) {
  const initial = new URL(page.url())
  const backLink = await page.getByRole('link', { name: 'К игровому дню' }).getAttribute('href')
  const nav = page.getByRole('navigation', { name: 'Разделы матча' })
  const anchors = [
    ['Обзор', 'game-overview'],
    ['Игроки', 'player-box-score-heading'],
    ['Лидеры', 'game-leaders-heading'],
    ['Сравнение', 'team-box-score-heading'],
    ['Арена', 'game-arena'],
  ]
  assert.equal(await page.locator('main h1').count(), 1)
  assert.equal(await page.locator('main h1').innerText(), 'Карточка матча')
  for (const [index, [label, id]] of anchors.entries()) {
    const link = nav.getByRole('link', { name: label, exact: true })
    if (index % 2) {
      await link.focus()
      await page.keyboard.press('Enter')
    } else {
      await link.click()
    }
    await page.waitForURL((url) => url.hash === `#${id}`)
    const target = page.locator(`[id="${id}"]`)
    await target.waitFor({ state: 'visible' })
    await page.waitForFunction((targetId) => {
      const rect = document.getElementById(targetId)?.getBoundingClientRect()
      return rect && rect.top >= -1 && rect.top < innerHeight - 64
    }, id)
    assert.equal(await target.evaluate((node) => document.activeElement === node), true, id)
    const now = new URL(page.url())
    assert.equal(now.pathname, initial.pathname)
    assert.equal(now.search, initial.search)
    assert.equal(
      await page.getByRole('link', { name: 'К игровому дню' }).getAttribute('href'),
      backLink,
    )
    await page.keyboard.press('Tab')
    assert.equal(
      await target.evaluate((node) => {
        const active = document.activeElement
        if (active && active !== document.body)
          return (
            active !== node &&
            Boolean(node.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING)
          )
        // At the end of the document Tab can move focus out to browser chrome.
        return ![
          ...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'),
        ].some((element) => {
          const style = getComputedStyle(element)
          return (
            element.tabIndex >= 0 &&
            !element.matches(':disabled') &&
            element.getClientRects().length > 0 &&
            style.visibility !== 'hidden' &&
            Boolean(node.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
          )
        })
      }),
      true,
      `Tab after ${id}`,
    )
  }
  await page.goBack()
  await page.waitForURL((url) => url.hash === '#team-box-score-heading')
  await page.waitForFunction(() => {
    const rect = document.getElementById('team-box-score-heading')?.getBoundingClientRect()
    return rect && rect.top >= -1 && rect.top < innerHeight - 64
  })
  await page.goForward()
  await page.waitForURL((url) => url.hash === '#game-arena')
  await page.waitForFunction(() => {
    const rect = document.getElementById('game-arena')?.getBoundingClientRect()
    return rect && rect.top >= -1 && rect.top < innerHeight - 64
  })
  assert.equal(new URL(page.url()).search, initial.search)
}

export async function checkGameDetailsHeadingStates({ context, detailUrl, setMode }) {
  const page = await context.newPage()
  const url = new URL(detailUrl)
  url.hash = ''
  try {
    setMode('loading')
    await page.goto(url.href, { waitUntil: 'domcontentloaded' })
    await page.locator('[aria-busy="true"]').waitFor()
    assert.equal(await page.locator('main h1').count(), 1)
    assert.equal(await page.locator('main h1').innerText(), 'Карточка матча')
    setMode('error')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page
      .getByRole('heading', { name: /Не удалось загрузить матч|Матч не найден в кеше/ })
      .waitFor()
    assert.equal(await page.locator('main h1').innerText(), 'Карточка матча')
    url.search = ''
    await page.goto(url.href)
    await page.getByRole('heading', { name: 'Не указан игровой день' }).waitFor()
    assert.equal(await page.locator('main h1').innerText(), 'Карточка матча')
  } finally {
    setMode('ready')
    await page.close()
  }
}
