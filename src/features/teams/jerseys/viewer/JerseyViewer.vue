<script setup lang="ts">
import { computed, useId, useTemplateRef } from 'vue'
import AppButton from '@/shared/components/AppButton.vue'
import type { JerseyPilot } from './jerseyPilots'
import { jerseyZoom, useJerseyViewer } from './useJerseyViewer'

const props = defineProps<{ pilot: JerseyPilot }>()
const headingId = useId()
const hintId = useId()
const stage = useTemplateRef<HTMLDivElement>('stage')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const fallback = useTemplateRef<HTMLCanvasElement>('fallback')
const {
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
} = useJerseyViewer(stage, canvas, fallback, props.pilot)

const stageLabel = computed(() => {
  const view =
    side.value === 'front' ? ' · вид спереди' : side.value === 'back' ? ' · вид сзади' : ''
  return 'Майка ' + props.pilot.code + view
})
</script>

<template>
  <section class="jersey-viewer" :aria-labelledby="headingId">
    <div class="viewer-copy">
      <header class="viewer-header">
        <h3 :id="headingId">3D-просмотр формы</h3>
        <p>Демонстрационная майка в цветах команды.</p>
      </header>
      <div class="viewer-controls" role="group" aria-label="Управление просмотром">
        <div class="viewer-buttons">
          <AppButton
            :variant="side === 'front' ? 'primary' : 'secondary'"
            :aria-pressed="side === 'front'"
            @click="selectSide('front')"
          >
            Спереди
          </AppButton>
          <AppButton
            :variant="side === 'back' ? 'primary' : 'secondary'"
            :aria-pressed="side === 'back'"
            @click="selectSide('back')"
          >
            Сзади
          </AppButton>
          <AppButton
            v-if="mode === '3d'"
            :variant="autoRotate ? 'primary' : 'secondary'"
            :aria-pressed="autoRotate"
            @click="toggleAutoRotate"
          >
            Автоповорот
          </AppButton>
        </div>
        <div v-if="mode === '3d'" class="viewer-zoom" role="group" aria-label="Масштаб">
          <AppButton
            aria-label="Уменьшить"
            :disabled="zoom === jerseyZoom.min"
            @click="adjustZoom(-1)"
            >−</AppButton
          >
          <output aria-label="Текущий масштаб">{{ zoom }}%</output>
          <AppButton
            aria-label="Увеличить"
            :disabled="zoom === jerseyZoom.max"
            @click="adjustZoom(1)"
            >+</AppButton
          >
        </div>
      </div>
      <p :id="hintId" class="viewer-hint">
        <template v-if="mode === '3d'"
          >Для поворота потяните майку влево или вправо либо используйте клавиши ← и →.</template
        >
        <template v-else-if="mode === '2d'">WebGL недоступен. Доступны два плоских вида.</template>
      </p>
    </div>

    <div
      ref="stage"
      class="viewer-stage"
      :class="{ 'viewer-stage--interactive': mode === '3d', 'viewer-stage--dragging': dragging }"
      :style="{ '--viewer-tint': pilot.base }"
      role="img"
      :aria-label="stageLabel"
      :aria-describedby="hintId"
      :tabindex="mode === '3d' ? 0 : undefined"
      @keydown="handleKey"
      @pointerdown="startDrag"
      @pointermove="drag"
      @pointerup="finishDrag"
      @pointercancel="finishDrag"
      @lostpointercapture="finishDrag"
    >
      <canvas v-show="mode === '3d'" ref="canvas" class="viewer-canvas" aria-hidden="true" />
      <canvas
        v-show="mode === '2d'"
        ref="fallback"
        class="viewer-canvas viewer-canvas--flat"
        aria-hidden="true"
      />
    </div>
  </section>
</template>

<style scoped>
.jersey-viewer {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  min-width: 0;
  border: 1px solid var(--gc-line);
  border-radius: var(--gc-radius);
  background: var(--gc-panel);
}

.viewer-copy {
  display: grid;
  min-width: 0;
  align-content: center;
  gap: 18px;
  padding: clamp(14px, 3vw, 32px);
}

.viewer-header {
  display: grid;
  gap: 6px;
}

.viewer-header h3 {
  color: var(--gc-text);
  font-size: clamp(1.25rem, 2.5vw, 2rem);
  line-height: 1.15;
  letter-spacing: -0.03em;
}

.viewer-header p,
.viewer-hint {
  color: var(--gc-secondary);
  font-size: 0.875rem;
  line-height: 1.5;
}

.viewer-controls,
.viewer-buttons,
.viewer-zoom {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.viewer-zoom :is(button, output) {
  min-width: 44px;
  text-align: center;
}

.viewer-zoom output {
  color: var(--gc-text);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}

.viewer-stage {
  position: relative;
  min-width: 0;
  min-height: clamp(250px, 34vw, 390px);
  border-radius: inherit;
  background:
    radial-gradient(ellipse at 50% 85%, #080b1280 0%, transparent 31%),
    radial-gradient(
      ellipse at 50% 39%,
      color-mix(in srgb, var(--viewer-tint) 28%, transparent),
      transparent 74%
    ),
    var(--gc-bg);
}

.viewer-stage--interactive {
  cursor: grab;
  touch-action: pan-y pinch-zoom;
  user-select: none;
}

.viewer-stage--dragging {
  cursor: grabbing;
}

.viewer-canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.viewer-canvas--flat {
  inset: 10%;
  width: 80%;
  height: 80%;
  object-fit: contain;
}

@media (max-width: 760px) {
  .jersey-viewer {
    grid-template-columns: minmax(0, 1fr);
  }

  .viewer-copy {
    gap: 12px;
  }

  .viewer-controls button {
    min-height: 44px;
  }
}
</style>
