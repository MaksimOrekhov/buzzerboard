import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readJpegDimensions, validateLocalMediaFiles } from './pro202-media-assets.mjs'

function minimalJpeg(width, height) {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xd9,
  ])
}

test('reads JPEG dimensions from the image frame header', () => {
  assert.deepEqual(readJpegDimensions(minimalJpeg(64, 48)), { width: 64, height: 48 })
  assert.equal(readJpegDimensions(Buffer.from('not a jpeg')), null)
})

test('validates local file existence, content dimensions, byte metadata and delivery limits', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'pro202-media-'))
  const publicRoot = path.join(temp, 'public')
  const directory = path.join(publicRoot, 'media/encyclopedia')
  mkdirSync(directory, { recursive: true })
  try {
    const image = minimalJpeg(64, 48)
    const filePath = path.join(directory, 'pilot.jpg')
    writeFileSync(filePath, image)
    const asset = {
      publicPath: '/media/encyclopedia/pilot.jpg',
      width: 64,
      height: 48,
      bytes: image.length,
    }
    assert.deepEqual(validateLocalMediaFiles({ assets: [asset] }, publicRoot), [])

    assert.match(
      validateLocalMediaFiles(
        { assets: [{ ...asset, width: 65, bytes: image.length + 1 }] },
        publicRoot,
      ).join(' '),
      /bytes does not match.*dimensions do not match/,
    )
    assert.match(
      validateLocalMediaFiles(
        { assets: [{ ...asset, publicPath: '/media/encyclopedia/missing.jpg' }] },
        publicRoot,
      ).join(' '),
      /missing from the local public directory/,
    )
    assert.match(
      validateLocalMediaFiles(
        { assets: [{ ...asset, publicPath: '/media/../../outside.jpg' }] },
        publicRoot,
      ).join(' '),
      /outside \/media\/encyclopedia\//,
    )
    assert.match(
      validateLocalMediaFiles({ assets: [{ ...asset, width: 2_001 }] }, publicRoot).join(' '),
      /dimensions do not match/,
    )

    const tooWide = minimalJpeg(2_001, 48)
    writeFileSync(path.join(directory, 'too-wide.jpg'), tooWide)
    assert.match(
      validateLocalMediaFiles(
        {
          assets: [
            {
              publicPath: '/media/encyclopedia/too-wide.jpg',
              width: 2_001,
              height: 48,
              bytes: tooWide.length,
            },
          ],
        },
        publicRoot,
      ).join(' '),
      /exceeds the local dimension limit/,
    )

    const tooLarge = Buffer.concat([minimalJpeg(64, 48), Buffer.alloc(2_000_000)])
    writeFileSync(path.join(directory, 'too-large.jpg'), tooLarge)
    assert.match(
      validateLocalMediaFiles(
        {
          assets: [
            {
              publicPath: '/media/encyclopedia/too-large.jpg',
              width: 64,
              height: 48,
              bytes: tooLarge.length,
            },
          ],
        },
        publicRoot,
      ).join(' '),
      /exceeds the local byte limit/,
    )
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
