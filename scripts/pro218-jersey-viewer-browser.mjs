import assert from 'node:assert/strict'
import path from 'node:path'

const profile = (code) => 'http://127.0.0.1:4186/teams/' + code + '?tab=jerseys'
const getViewer = (page) => page.getByRole('region', { name: '3D-просмотр формы' })
const getStage = (viewer) => viewer.getByRole('img', { name: /^Майка / })
const button = (viewer, name) => viewer.getByRole('button', { name, exact: true })

async function checkViewport(page, viewer) {
  const width = page.viewportSize().width
  const box = await viewer.boundingBox()
  assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, 'Viewer fits the viewport')
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
}

async function assertSameView(page, actual, expected, message) {
  const changed = await page.evaluate(
    async (sources) => {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      const images = await Promise.all(
        sources.map(async (source) => {
          const image = new Image()
          image.src = 'data:image/png;base64,' + source
          await image.decode()
          return image
        }),
      )
      const [first, second] = images
      if (first.width !== second.width || first.height !== second.height) return 1
      canvas.width = first.width
      canvas.height = first.height
      const pixels = images.map((image) => {
        context.drawImage(image, 0, 0)
        return context.getImageData(0, 0, canvas.width, canvas.height).data
      })
      let differences = 0
      for (let i = 0; i < pixels[0].length; i += 4) {
        if (
          [0, 1, 2].some(
            (channel) => Math.abs(pixels[0][i + channel] - pixels[1][i + channel]) > 24,
          )
        ) {
          differences++
        }
      }
      return differences / (canvas.width * canvas.height)
    },
    [actual.toString('base64'), expected.toString('base64')],
  )
  assert.ok(changed < 0.01, message + ' (' + (100 * changed).toFixed(2) + '% changed pixels)')
}

async function touchDrag(context, page, stage) {
  await stage.scrollIntoViewIfNeeded()
  const box = await stage.boundingBox()
  const session = await context.newCDPSession(page)
  const send = (type, touchPoints) =>
    session.send('Input.dispatchTouchEvent', { type, touchPoints })
  const y = Math.round(box.y + box.height / 2)
  const x = Math.round(box.x + box.width / 4)
  try {
    await send('touchStart', [{ x, y }])
    await send('touchMove', [{ x: x + 60, y }])
    await send('touchMove', [{ x: x + 120, y }])
    await send('touchEnd', [])
  } finally {
    await session.detach()
  }
}

export async function checkJerseyViewer({ browser, output }) {
  for (const scenario of [
    { code: 'CHI', width: 1440, height: 1000 },
    { code: 'LAL', width: 375, height: 812, hasTouch: true },
    { code: 'MIN', width: 768, height: 900 },
    { code: 'MIN', width: 320, height: 650, fallback: true },
  ]) {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      hasTouch: scenario.hasTouch,
      isMobile: scenario.hasTouch,
    })
    try {
      const page = await context.newPage()
      const apiRequests = []
      await page.route(
        (url) => url.hostname !== '127.0.0.1' || url.pathname.startsWith('/api/'),
        (route) => {
          const url = new URL(route.request().url())
          if (url.pathname.startsWith('/api/')) apiRequests.push(url.href)
          return route.abort()
        },
      )
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      if (scenario.fallback) {
        await page.addInitScript(() => {
          const getContext = HTMLCanvasElement.prototype.getContext
          HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            if (type === 'webgl' || type === 'webgl2') return null
            return Reflect.apply(getContext, this, [type, ...args])
          }
        })
      }
      const viewer = getViewer(page)
      const stage = getStage(viewer)
      const front = button(viewer, 'Front')
      const back = button(viewer, 'Back')
      const auto = button(viewer, 'Auto rotate')
      const capture = (name) =>
        viewer.screenshot({ path: path.join(output, 'pro218-' + name + '.png') })

      await page.goto(profile(scenario.code))
      await stage.locator('canvas:visible').waitFor()
      await checkViewport(page, viewer)
      assert.equal(await front.getAttribute('aria-pressed'), 'true')
      assert.match(await stage.getAttribute('aria-label'), new RegExp(scenario.code))
      const frontImage = await stage.screenshot()
      await back.click()
      assert.equal(await back.getAttribute('aria-pressed'), 'true')
      const backImage = await stage.screenshot()
      assert.ok(!backImage.equals(frontImage), 'Front and back textures must look different')

      if (scenario.fallback) {
        await viewer.getByText('WebGL недоступен. Доступны два плоских вида.').waitFor()
        assert.equal(await auto.count(), 0)
        await capture('min-320-back-2d')
        await front.click()
        await assertSameView(
          page,
          await stage.screenshot(),
          frontImage,
          '2D Front restores the front texture',
        )
      } else if (scenario.hasTouch) {
        await auto.waitFor()
        await touchDrag(context, page, stage)
        assert.equal(await back.getAttribute('aria-pressed'), 'false')
        assert.ok(!(await stage.screenshot()).equals(backImage), 'Touch drag must change the view')
        await button(viewer, 'Увеличить').tap()
        await viewer.getByText('115%', { exact: true }).waitFor()
        await front.tap()
        await capture('lal-375-front')
      } else if (scenario.code === 'MIN') {
        await auto.waitFor()
        await front.click()
        await capture('min-768-front')
      } else {
        await auto.waitFor()
        await capture('chi-1440-back')

        await stage.scrollIntoViewIfNeeded()
        const box = await stage.boundingBox()
        await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + 0.42 * box.width, box.y + box.height / 2, { steps: 5 })
        await page.mouse.up()
        assert.equal(await back.getAttribute('aria-pressed'), 'false')
        assert.ok(!(await stage.screenshot()).equals(backImage), 'Mouse drag must change the view')
        await capture('chi-1440-angle')
        await front.click()
        await stage.focus()
        await stage.press('ArrowRight')
        assert.equal(await front.getAttribute('aria-pressed'), 'false')
        assert.ok(
          !(await stage.screenshot()).equals(frontImage),
          'Keyboard rotation must change the view',
        )
        for (let step = 1; step < 24; step++) await stage.press('ArrowRight')
        await assertSameView(
          page,
          await stage.screenshot(),
          frontImage,
          'One full keyboard turn restores the picture',
        )

        const larger = button(viewer, 'Увеличить')
        await larger.click()
        await viewer.getByText('115%', { exact: true }).waitFor()
        assert.equal(await larger.isDisabled(), true)
        assert.ok(!(await stage.screenshot()).equals(frontImage), 'Zoom must change the drawing')
        await stage.press('-')
        await viewer.getByText('100%', { exact: true }).waitFor()

        await auto.click()
        assert.equal(await auto.getAttribute('aria-pressed'), 'true')
        const rotatingImage = await stage.screenshot()
        const rotatedImage = await stage.screenshot()
        assert.ok(!rotatedImage.equals(rotatingImage), 'Auto rotate must change the picture')
        await back.click()
        assert.equal(await auto.getAttribute('aria-pressed'), 'false')

        await stage.locator('canvas:visible').evaluate((canvas) => {
          const extension = canvas.getContext('webgl')?.getExtension('WEBGL_lose_context')
          if (!extension) throw new Error('Expected the WebGL context loss extension')
          canvas.addEventListener('pro218-restore', () => extension.restoreContext(), {
            once: true,
          })
          extension.loseContext()
        })
        await viewer.getByText('WebGL недоступен. Доступны два плоских вида.').waitFor()
        assert.equal(await back.getAttribute('aria-pressed'), 'true')
        await stage.locator('canvas').first().dispatchEvent('pro218-restore')
        await auto.waitFor()
        await assertSameView(
          page,
          await stage.screenshot(),
          backImage,
          'Restoring WebGL redraws the current side',
        )

        await page.goto(profile('ORL'))
        await page.getByRole('region', { name: 'Подборка 2026/27' }).waitFor()
        assert.equal(await viewer.count(), 0)
      }
      assert.deepEqual(apiRequests, [])
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  }
  console.info(
    'PRO-218 jersey viewer: CHI desktop WebGL, LAL touch WebGL, MIN WebGL and 2D fallback.',
  )
}
