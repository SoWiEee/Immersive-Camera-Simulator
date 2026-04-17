<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useCameraStore } from "@/stores/cameraStore";
import { useCompare } from "@/composables/useCompare";
import type { CameraRenderParams } from "@/gpu/pipeline";

const store = useCameraStore();
const {
  depthResult,
  imageFile,
  focusDepth,
  exposureDelta,
  contrast,
  saturation,
  colorTemp,
  iso,
  sensor,
  lens,
  aperture,
  bokehScale,
  motionAngle,
  motionStrength,
  vignetteStrength,
} = storeToRefs(store);

const leftCanvas = ref<HTMLCanvasElement | null>(null);
const rightCanvas = ref<HTMLCanvasElement | null>(null);
const frameRef = ref<HTMLDivElement | null>(null);

const compare = useCompare();
const { splitX } = compare;

let rafId = 0;
let dirty = false;

function buildRightParams(): CameraRenderParams {
  return {
    exposureEv: exposureDelta.value,
    contrast: contrast.value,
    saturation: saturation.value,
    colorTemp: colorTemp.value,
    iso: iso.value,
    noiseCoeff: sensor.value.isoBaseNoise,
    aperture: aperture.value,
    focusDepth: focusDepth.value,
    bokehScale: bokehScale.value,
    motionAngle: motionAngle.value,
    motionStrength: motionStrength.value,
    vignetteStrength: vignetteStrength.value,
    bladeCount: lens.value.bladeCount,
    bladeRotation: lens.value.bladeRotation,
    swirlStrength: lens.value.swirlStrength,
    chromAberr: lens.value.chromAberrStrength,
  };
}

function scheduleRenderRight() {
  dirty = true;
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    if (dirty) {
      compare.renderRight(buildRightParams());
      dirty = false;
    }
  });
}

onMounted(async () => {
  if (!leftCanvas.value || !rightCanvas.value) return;
  try {
    await compare.init(leftCanvas.value, rightCanvas.value);
    if (imageFile.value && depthResult.value) {
      await compare.loadImageAndDepth(
        imageFile.value,
        depthResult.value.depthMapB64,
        focusDepth.value,
      );
      scheduleRenderRight();
    }
  } catch (e) {
    store.setAppState("error", `WebGPU compare pipeline error: ${e}`);
  }
});

// Re-init when a new depth result arrives
watch(depthResult, async (result) => {
  if (!result || !imageFile.value) return;
  await compare.loadImageAndDepth(imageFile.value, result.depthMapB64, focusDepth.value);
  scheduleRenderRight();
});

// Focus depth changes → re-render both pipelines
watch(focusDepth, (fd) => {
  compare.renderLeft(fd);
  scheduleRenderRight();
});

// User camera params → re-render right pipeline only
watch(
  [
    exposureDelta,
    contrast,
    saturation,
    colorTemp,
    iso,
    sensor,
    lens,
    aperture,
    bokehScale,
    motionAngle,
    motionStrength,
    vignetteStrength,
  ],
  scheduleRenderRight,
);

// Click on the canvas area → pick focus depth from right pipeline
function onCanvasClick(event: MouseEvent) {
  if (!rightCanvas.value) return;
  const rect = rightCanvas.value.getBoundingClientRect();
  const scaleX = rightCanvas.value.width / rect.width;
  const scaleY = rightCanvas.value.height / rect.height;
  const depth = compare.pickFocusDepth(
    (event.clientX - rect.left) * scaleX,
    (event.clientY - rect.top) * scaleY,
  );
  if (depth !== null) focusDepth.value = depth;
}

// ---- Split line drag ----
let dragging = false;

function onSplitPointerDown(e: PointerEvent) {
  dragging = true;
  (e.target as Element).setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e: PointerEvent) {
  if (!dragging || !frameRef.value) return;
  const rect = frameRef.value.getBoundingClientRect();
  splitX.value = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
}

function onPointerUp() {
  dragging = false;
}

// Frame aspect ratio from depth result
const frameStyle = computed(() => {
  if (!depthResult.value) return {};
  return { aspectRatio: `${depthResult.value.width} / ${depthResult.value.height}` };
});

// Clip path for the phone (left) canvas
const leftClip = computed(() => `inset(0 ${((1 - splitX.value) * 100).toFixed(2)}% 0 0)`);

// Label visibility: hide a label if splitX is too close to that edge
const showLeftLabel = computed(() => splitX.value > 0.12);
const showRightLabel = computed(() => splitX.value < 0.88);
</script>

<template>
  <div
    class="compare-root"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @click="onCanvasClick"
  >
    <!-- Outer wrapper centers the frame -->
    <div class="compare-frame" ref="frameRef" :style="frameStyle">
      <!-- Right canvas: user pipeline (full, behind) -->
      <canvas ref="rightCanvas" class="compare-canvas" />

      <!-- Left canvas: phone pipeline (clipped to left portion) -->
      <canvas
        ref="leftCanvas"
        class="compare-canvas compare-canvas--left"
        :style="{ clipPath: leftClip }"
      />

      <!-- Draggable split line -->
      <div
        class="compare-line"
        :style="{ left: `${splitX * 100}%` }"
        @pointerdown="onSplitPointerDown"
      >
        <div class="compare-line__handle">
          <span class="compare-line__arrow">◀</span>
          <span class="compare-line__arrow">▶</span>
        </div>
      </div>

      <!-- Labels -->
      <div v-show="showLeftLabel" class="compare-label compare-label--left">
        <span class="compare-label__icon">📱</span> 手機
      </div>
      <div v-show="showRightLabel" class="compare-label compare-label--right">
        <span class="compare-label__icon">📷</span> 單眼
      </div>

      <!-- Focus click hint -->
      <div class="compare-hint">點擊畫面選取對焦點</div>
    </div>
  </div>
</template>

<style scoped>
.compare-root {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  overflow: hidden;
  position: relative;
}

.compare-frame {
  position: relative;
  max-width: 100%;
  max-height: 100%;
  overflow: hidden;
  cursor: crosshair;
}

.compare-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
}

/* Split line */
.compare-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(255, 255, 255, 0.7);
  transform: translateX(-50%);
  cursor: ew-resize;
  z-index: 10;
  /* Wider hit area than visual width */
  &::before {
    content: "";
    position: absolute;
    inset: 0 -6px;
  }
}

.compare-line__handle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.9);
  border-radius: 10px;
  width: 28px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1px;
  pointer-events: none;
}

.compare-line__arrow {
  font-size: 8px;
  color: #333;
  line-height: 1;
}

/* Corner labels */
.compare-label {
  position: absolute;
  top: 10px;
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  pointer-events: none;
  z-index: 5;
  letter-spacing: 0.04em;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  color: #fff;
}
.compare-label--left {
  left: 10px;
}
.compare-label--right {
  right: 10px;
}
.compare-label__icon {
  font-size: 13px;
}

/* Bottom focus hint */
.compare-hint {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  pointer-events: none;
  z-index: 5;
}
</style>
