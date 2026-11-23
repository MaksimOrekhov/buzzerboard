import { onBeforeUnmount, onMounted, shallowRef, watch, type ShallowRef } from 'vue'
import type { JerseySide } from './jerseyModel'
import type { JerseyPilot } from './jerseyPilots'
import { createJerseyRenderer } from './jerseyRenderer'
import { paintJerseyTexture } from './jerseyTextures'

const fullTurn = 2 * Math.PI
export const jerseyZoom = { min: 85, max: 115 } as const

export function useJerseyViewer(
  stage: Readonly<ShallowRef<HTMLDivElement | null>>,
  canvas: Readonly<ShallowRef<HTMLCanvasElement | null>>,
  fallback: Readonly<ShallowRef<HTMLCanvasElement | null>>,
  pilot: JerseyPilot,
) {
  const mode = shallowRef<'loading' | '3d' | '2d'>('loading')
  const side = shallowRef<JerseySide | null>('front')
  const autoRotate = shallowRef(false)
  const zoom = shallowRef(100)
  const dragging = shallowRef(false)
  let angle = 0
  let frame: number | undefined
  let lastFrame: number | undefined
  let pointer: { id: number; x: number } | undefined
  let renderer: ReturnType<typeof createJerseyRenderer> = null
  let resizeObserver: ResizeObserver | undefined

  function scheduleDraw() {
    if (renderer && frame === undefined) frame = requestAnimationFrame(draw)
  }

  function draw(now: number) {
    frame = undefined
    if (autoRotate.value && lastFrame !== undefined) {
      angle = (angle + Math.min(now - lastFrame, 50) * 0.00075) % fullTurn
    }
    lastFrame = autoRotate.value ? now : undefined
    renderer?.draw(angle, zoom.value / 100)
    if (autoRotate.value) scheduleDraw()
  }

  function stopRotation() {
    autoRotate.value = false
    lastFrame = undefined
  }

  function rotateBy(delta: number) {
    stopRotation()
    angle = (angle + delta) % fullTurn
    side.value = null
    scheduleDraw()
  }

  function selectSide(next: JerseySide) {
    stopRotation()
    side.value = next
    angle = next === 'front' ? 0 : Math.PI
    scheduleDraw()
  }

  function toggleAutoRotate() {
    if (autoRotate.value) {
      stopRotation()
    } else {
      side.value = null
      autoRotate.value = true
      scheduleDraw()
    }
  }

  function adjustZoom(delta: number) {
    zoom.value = Math.max(jerseyZoom.min, Math.min(jerseyZoom.max, zoom.value + 15 * delta))
    scheduleDraw()
  }

  function startDrag(event: PointerEvent) {
    if (mode.value !== '3d' || pointer || event.button !== 0) return
    const element = stage.value
    if (!element) return
    pointer = { id: event.pointerId, x: event.clientX }
    element.focus({ preventScroll: true })
    element.setPointerCapture(event.pointerId)
    dragging.value = true
  }

  function drag(event: PointerEvent) {
    if (pointer?.id !== event.pointerId) return
    const delta = event.clientX - pointer.x
    if (delta) rotateBy(delta * 0.014)
    pointer.x = event.clientX
  }

  function finishDrag(event: PointerEvent) {
    if (pointer?.id !== event.pointerId) return
    pointer = undefined
    dragging.value = false
  }

  function handleKey(event: KeyboardEvent) {
    if (mode.value !== '3d') return
    switch (event.key) {
      case 'ArrowLeft':
        rotateBy(-Math.PI / 12)
        break
      case 'ArrowRight':
        rotateBy(Math.PI / 12)
        break
      case '+':
      case '=':
        adjustZoom(1)
        break
      case '-':
        adjustZoom(-1)
        break
      default:
        return
    }
    event.preventDefault()
  }

  function handleWheel(event: WheelEvent) {
    if (mode.value !== '3d' || document.activeElement !== stage.value || !event.deltaY) return
    event.preventDefault()
    adjustZoom(-Math.sign(event.deltaY))
  }

  function showFallback() {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
    stopRotation()
    pointer = undefined
    dragging.value = false
    selectSide(side.value ?? (Math.cos(angle) < 0 ? 'back' : 'front'))
    mode.value = '2d'
  }

  function initialize() {
    try {
      renderer = canvas.value ? createJerseyRenderer(canvas.value, pilot) : null
    } catch {
      renderer = null
    }
    if (renderer) {
      mode.value = '3d'
      scheduleDraw()
    } else {
      showFallback()
    }
  }

  function handleContextLoss(event: Event) {
    event.preventDefault()
    renderer?.dispose()
    renderer = null
    showFallback()
  }

  watch([mode, side], ([nextMode, nextSide]) => {
    if (nextMode === '2d' && fallback.value) {
      paintJerseyTexture(fallback.value, pilot, nextSide ?? 'front', true)
    }
  })

  onMounted(() => {
    canvas.value?.addEventListener('webglcontextlost', handleContextLoss)
    canvas.value?.addEventListener('webglcontextrestored', initialize)
    stage.value?.addEventListener('wheel', handleWheel, { passive: false })
    resizeObserver = new ResizeObserver(scheduleDraw)
    if (stage.value) resizeObserver.observe(stage.value)
    initialize()
  })

  onBeforeUnmount(() => {
    canvas.value?.removeEventListener('webglcontextlost', handleContextLoss)
    canvas.value?.removeEventListener('webglcontextrestored', initialize)
    stage.value?.removeEventListener('wheel', handleWheel)
    resizeObserver?.disconnect()
    if (frame !== undefined) cancelAnimationFrame(frame)
    renderer?.dispose()
  })

  return {
    mode,
    side,
    autoRotate,
    dragging,
    zoom,
    selectSide,
    toggleAutoRotate,
    adjustZoom,
    startDrag,
    drag,
    finishDrag,
    handleKey,
  }
}
