import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { chromium } from 'playwright'
import { createServer } from 'vite'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(projectRoot, 'artifacts', 'pro-168')
const viewports = [
  { width: 375, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
]
const routes = [
  { name: 'overview', path: '/' },
  { name: 'games', path: '/games' },
  { name: 'standings', path: '/standings' },
  { name: 'news', path: '/news' },
  { name: 'favorites', path: '/favorites' },
]
const checks = []

function rgbChannels(color) {
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]
  if (hex) {
    const normalized = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex
    return normalized.match(/.{2}/g).map((channel) => Number.parseInt(channel, 16))
  }

  const rgb = color.match(/^rgba?\(([^)]+)\)$/i)?.[1]
  assert.ok(rgb, `Unsupported computed color: ${color}`)
  return rgb
    .split(/[\s,/]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((channel) => Number.parseFloat(channel))
}

function luminance(color) {
  const [red, green, blue] = rgbChannels(color).map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error(`Vite preview did not become ready at ${url}`)
}

await mkdir(outputDirectory, { recursive: true })

const server = await createServer({
  cacheDir: path.join(projectRoot, 'node_modules/.vite-pro168'),
  configFile: path.join(projectRoot, 'vite.config.ts'),
  root: projectRoot,
  logLevel: 'warn',
  server: { host: '127.0.0.1', port: 4179, strictPort: true },
})

let browser

try {
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  await waitForServer(baseUrl)
  browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || undefined })

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport,
      locale: 'ru-RU',
      timezoneId: 'Europe/Nicosia',
      deviceScaleFactor: 1,
    })

    // Keep public review artifacts synthetic even when a local Worker is running.
    await context.route(
      (url) => url.pathname.startsWith('/api/'),
      (route) =>
        route.fulfill({
          status: 503,
          json: {
            error: {
              code: 'cache_miss',
              message: 'No synthetic snapshot',
              retryable: true,
              provider: null,
              upstreamStatus: null,
            },
            requestId: null,
          },
        }),
    )
    for (const route of routes) {
      const page = await context.newPage()
      const pageErrors = []
      page.on('pageerror', (error) => pageErrors.push(error.message))

      await page.goto(new URL(route.path, baseUrl).href, { waitUntil: 'networkidle' })
      await page.locator('main').waitFor()
      await page.evaluate(() => document.fonts.ready.then(() => true))

      assert.equal(await page.locator('html').getAttribute('lang'), 'ru')
      assert.equal(await page.locator('h1').count(), 1, `${route.path} must have one main heading`)
      const isGameCenter = route.name === 'games'
      const mobile = viewport.width <= (isGameCenter ? 620 : 760)
      const currentNavigation = isGameCenter
        ? page.locator(mobile ? '.gc-mobile-nav' : '.gc-primary-nav')
        : viewport.width <= 760
          ? page.locator('.mobile-nav')
          : page.locator('.primary-nav')
      const activeClass = isGameCenter
        ? mobile
          ? 'gc-mobile-nav--active'
          : 'gc-nav-link--active'
        : viewport.width <= 760
          ? 'mobile-nav-link--exact-active'
          : 'nav-link--exact-active'
      assert.equal(await currentNavigation.locator(`a.${activeClass}:visible`).count(), 1)
      assert.equal(await page.getByText('Boston Celtics', { exact: true }).count(), 0)

      const documentWidth = await page.evaluate(() =>
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      )
      assert.ok(
        documentWidth <= viewport.width,
        `${route.path} overflows at ${viewport.width}px (${documentWidth}px document width)`,
      )

      if (isGameCenter) {
        assert.equal(await page.locator('.gc-mobile-nav').isVisible(), mobile)
        assert.equal(await page.locator('.gc-sidebar').isVisible(), !mobile)
      } else if (viewport.width <= 760) {
        assert.equal(await page.locator('.mobile-nav').isVisible(), true)
        assert.equal(await page.locator('.sidebar').isVisible(), false)
      } else {
        assert.equal(await page.locator('.sidebar').isVisible(), true)
        assert.equal(await page.getByRole('link', { name: 'Матчи', exact: true }).count(), 1)
        assert.equal(
          await page.locator('.nav-link--muted').first().getAttribute('title'),
          'Команды — скоро',
        )
      }

      const screenshotPath = path.join(outputDirectory, `${viewport.width}-${route.name}.png`)
      await page.screenshot({
        path: screenshotPath,
        fullPage: viewport.width > 760,
        animations: 'disabled',
      })
      assert.deepEqual(pageErrors, [], `${route.path} emitted page errors`)
      checks.push({
        viewport: viewport.width,
        route: route.path,
        screenshot: path.basename(screenshotPath),
      })

      await page.close()
    }

    const overview = await context.newPage()
    await overview.goto(new URL('/', baseUrl).href, { waitUntil: 'networkidle' })

    if (viewport.width > 760 && viewport.width <= 1040) {
      const gamesLink = overview.getByRole('link', { name: 'Матчи', exact: true })
      await gamesLink.hover()
      await overview.waitForTimeout(150)
      assert.equal(
        await gamesLink.locator('.nav-tooltip').evaluate((node) => getComputedStyle(node).opacity),
        '1',
      )

      const futureItem = overview.locator('.nav-link--muted').first()
      await futureItem.hover()
      await overview.waitForTimeout(150)
      assert.equal(
        await futureItem.locator('.nav-tooltip').evaluate((node) => getComputedStyle(node).opacity),
        '1',
      )
    }

    await overview.keyboard.press('Tab')
    const keyboardFocus = await overview.evaluate(() => ({
      isSkipLink: document.activeElement?.classList.contains('skip-link') ?? false,
      outline: getComputedStyle(document.activeElement).outlineStyle,
    }))
    assert.equal(keyboardFocus.isSkipLink, true, 'The skip link must be first in keyboard order')
    assert.equal(keyboardFocus.outline, 'solid', 'Keyboard focus must have a visible outline')

    let navigationFocus
    for (let step = 0; step < 12; step += 1) {
      await overview.keyboard.press('Tab')
      navigationFocus = await overview.evaluate(() => ({
        label:
          document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.textContent?.trim(),
        outline: getComputedStyle(document.activeElement).outlineStyle,
        tooltipOpacity: document.activeElement?.querySelector('.nav-tooltip')
          ? getComputedStyle(document.activeElement.querySelector('.nav-tooltip')).opacity
          : null,
      }))
      if (navigationFocus.label === 'Матчи') break
    }
    assert.equal(
      navigationFocus.label,
      'Матчи',
      `Navigation at ${viewport.width}px must have a keyboard name`,
    )
    assert.equal(navigationFocus.outline, 'solid', 'Navigation keyboard focus must be visible')

    if (viewport.width > 760 && viewport.width <= 1040) {
      await overview.waitForTimeout(150)
      const focusedTooltipOpacity = await overview.evaluate(
        () => getComputedStyle(document.activeElement?.querySelector('.nav-tooltip')).opacity,
      )
      assert.ok(
        Number.parseFloat(focusedTooltipOpacity) > 0.95,
        'Icon-only navigation must reveal a focus tooltip',
      )
    }

    if (viewport.width <= 760) {
      await overview.getByRole('link', { name: 'Матчи', exact: true }).click()
      await overview.waitForURL('**/games')
      assert.equal(await overview.locator('h1').count(), 1)

      await overview.goto(new URL('/', baseUrl).href, { waitUntil: 'networkidle' })
      await overview.evaluate(() => window.scrollTo(0, Math.min(650, document.body.scrollHeight)))
      await overview.screenshot({
        path: path.join(outputDirectory, '375-overview-lower.png'),
        animations: 'disabled',
      })
    }

    const contrastTokens = await overview.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return {
        text: ['--subtle', '--muted', '--ink-soft'].map((token) =>
          style.getPropertyValue(token).trim(),
        ),
        surfaces: [
          '--canvas',
          '--surface-1',
          '--surface-2',
          '--surface-3',
          '#0b0e10',
          '#101416',
          '#171b1d',
        ].map((token) => (token.startsWith('--') ? style.getPropertyValue(token).trim() : token)),
      }
    })
    for (const foreground of contrastTokens.text) {
      for (const background of contrastTokens.surfaces) {
        assert.ok(
          contrastRatio(foreground, background) >= 4.5,
          `Text color ${foreground} falls below 4.5:1 on ${background}`,
        )
      }
    }
    checks.push({ viewport: viewport.width, route: '/', keyboardFocus, contrast: '4.5:1 minimum' })

    await overview.close()

    const fixture = await context.newPage()
    await fixture.goto(new URL('/tests/visual/ready-fixture.html', baseUrl).href, {
      waitUntil: 'networkidle',
    })
    await fixture.locator('article.match-card').waitFor()
    if (viewport.width <= 620) {
      await fixture.locator('.mobile-list').waitFor({ state: 'visible' })
      assert.ok(await fixture.locator('.mobile-list .team-card').count())
    } else {
      await fixture.getByRole('table').waitFor({ state: 'visible' })
    }
    assert.equal(await fixture.locator('h1').count(), 1)
    assert.match(
      await fixture.getByText('Тестовый стенд · синтетические данные').textContent(),
      /синтетические данные/,
    )

    const fixtureWidth = await fixture.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    )
    assert.ok(
      fixtureWidth <= viewport.width,
      `Ready-state fixture overflows at ${viewport.width}px`,
    )

    const readyScreenshot = path.join(outputDirectory, `${viewport.width}-ready-components.png`)
    await fixture.screenshot({
      path: readyScreenshot,
      fullPage: true,
      animations: 'disabled',
    })
    checks.push({
      viewport: viewport.width,
      route: '/tests/visual/ready-fixture.html',
      screenshot: path.basename(readyScreenshot),
    })
    await context.close()
  }

  await writeFile(
    path.join(outputDirectory, 'checks.json'),
    `${JSON.stringify({ viewports, checks }, null, 2)}\n`,
  )
  console.info(
    `Playwright visual review passed: ${checks.length} checks; screenshots: ${outputDirectory}`,
  )
} finally {
  await browser?.close()
  await server.close()
}
