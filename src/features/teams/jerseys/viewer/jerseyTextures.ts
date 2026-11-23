import { jerseyOutline, jerseyX, jerseyY, type JerseySide } from './jerseyModel'
import type { JerseyPilot } from './jerseyPilots'

const width = 448
const height = 640

export function paintJerseyTexture(
  canvas: HTMLCanvasElement,
  pilot: JerseyPilot,
  side: JerseySide,
  flat = false,
) {
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return false

  const outline = new Path2D()
  for (const [x, y] of jerseyOutline(side)) {
    outline.lineTo(((1 + x / jerseyX) / 2) * width, ((1 - y / jerseyY) / 2) * height)
  }
  outline.closePath()

  if (flat) context.clip(outline)
  context.fillStyle = pilot.base
  context.fillRect(0, 0, width, height)

  const sideWidth = 36
  context.fillStyle = pilot.trim
  context.fillRect(0, 185, sideWidth, height)
  context.fillRect(width - sideWidth, 185, sideWidth, height)
  context.fillStyle = pilot.ink
  context.globalAlpha = 0.8
  context.fillRect(sideWidth, 187, 2, height)
  context.fillRect(width - sideWidth - 2, 187, 2, height)
  context.globalAlpha = 1

  context.lineJoin = 'round'
  context.strokeStyle = pilot.trim
  context.lineWidth = 18
  context.stroke(outline)
  context.strokeStyle = pilot.ink
  context.lineWidth = 3
  context.globalAlpha = 0.65
  context.stroke(outline)
  context.globalAlpha = 1

  context.fillStyle = pilot.ink
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = '900 47px system-ui, sans-serif'
  context.fillText(side === 'front' ? pilot.code : pilot.name, width / 2, 228, 294)
  context.font = '900 172px system-ui, sans-serif'
  context.fillText('00', width / 2, 348)

  context.globalAlpha = 0.45
  context.fillRect(width / 2 - 28, 507, 56, 2)
  context.globalAlpha = 1
  return true
}
