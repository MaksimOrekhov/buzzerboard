import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_FILE_BYTES = 2_000_000
export const MAX_IMAGE_DIMENSION = 2_000
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

export function readJpegDimensions(bytes) {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  )
    return null
  let offset = 2
  while (offset < bytes.length - 4) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    const segmentLength = bytes.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null
    if (SOF_MARKERS.has(marker)) {
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) }
    }
    offset += segmentLength
  }
  return null
}

export function validateLocalMediaFiles(manifest, publicRoot) {
  const errors = []
  if (!manifest || !Array.isArray(manifest.assets)) return ['manifest.assets must be an array']
  let root
  try {
    root = realpathSync(publicRoot)
  } catch {
    return [`public directory does not exist: ${publicRoot}`]
  }

  for (const [index, asset] of manifest.assets.entries()) {
    const label = `assets[${index}]`
    if (
      !asset ||
      typeof asset.publicPath !== 'string' ||
      !asset.publicPath.startsWith('/media/encyclopedia/')
    ) {
      errors.push(`${label}.publicPath is outside /media/encyclopedia/`)
      continue
    }
    const pathOnDisk = path.resolve(root, `.${asset.publicPath}`)
    if (!pathOnDisk.startsWith(`${root}${path.sep}`)) {
      errors.push(`${label}.publicPath escapes the public directory`)
      continue
    }
    try {
      const linkStats = lstatSync(pathOnDisk)
      const actualPath = realpathSync(pathOnDisk)
      if (
        linkStats.isSymbolicLink() ||
        !linkStats.isFile() ||
        !actualPath.startsWith(`${root}${path.sep}`)
      ) {
        errors.push(`${label}.publicPath must resolve to a regular file inside public`)
        continue
      }
      const stats = statSync(actualPath)
      const bytes = readFileSync(actualPath)
      const dimensions = readJpegDimensions(bytes)
      if (stats.size !== asset.bytes)
        errors.push(`${label}.bytes does not match the local file size`)
      if (stats.size <= 0 || stats.size > MAX_FILE_BYTES)
        errors.push(`${label} exceeds the local byte limit`)
      if (!dimensions) errors.push(`${label} is not a decodable JPEG`)
      else {
        if (dimensions.width !== asset.width || dimensions.height !== asset.height)
          errors.push(`${label} dimensions do not match the local JPEG`)
        if (dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION)
          errors.push(`${label} exceeds the local dimension limit`)
      }
    } catch {
      errors.push(`${label}.publicPath is missing from the local public directory`)
    }
  }
  return errors
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'src/entities/nba/teamMediaManifest.json'), 'utf8'),
  )
  const errors = validateLocalMediaFiles(manifest, path.join(root, 'public'))
  if (errors.length) {
    console.error(
      `PRO-202 media validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    )
    process.exitCode = 1
    return
  }
  console.log(`PRO-202 media validation passed (${manifest.assets.length} reviewed local images).`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
