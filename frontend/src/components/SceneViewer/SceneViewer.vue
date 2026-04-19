<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCameraStore } from "@/stores/cameraStore";
import { useScene, type ControlMode } from "@/composables/useScene";
import { SENSORS } from "@/data/sensors";
import { LENSES } from "@/data/lenses";

const store = useCameraStore();
const { sceneUrl, panelOpacity, aperture, iso, focalLength, focusDepth, shootingMode } =
  storeToRefs(store);

const scene = useScene();

const containerRef = ref<HTMLElement | null>(null);

// ── Draggable panel ───────────────────────────────────────────────────────────
const dragOffsetX = ref(0);
const dragOffsetY = ref(0);
let dragActive = false;
let dragStartClientX = 0;
let dragStartClientY = 0;
let dragStartOffsetX = 0;
let dragStartOffsetY = 0;

function onPanelDragStart(e: MouseEvent) {
  dragActive = true;
  dragStartClientX = e.clientX;
  dragStartClientY = e.clientY;
  dragStartOffsetX = dragOffsetX.value;
  dragStartOffsetY = dragOffsetY.value;
  window.addEventListener("mousemove", onPanelDragMove);
  window.addEventListener("mouseup", onPanelDragEnd);
}
function onPanelDragMove(e: MouseEvent) {
  if (!dragActive) return;
  dragOffsetX.value = dragStartOffsetX + (e.clientX - dragStartClientX);
  dragOffsetY.value = dragStartOffsetY - (e.clientY - dragStartClientY);
}
function onPanelDragEnd() {
  dragActive = false;
  window.removeEventListener("mousemove", onPanelDragMove);
  window.removeEventListener("mouseup", onPanelDragEnd);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  if (!containerRef.value || !sceneUrl.value) return;
  await scene.init(containerRef.value, sceneUrl.value);
});

onUnmounted(() => {
  scene.dispose();
  window.removeEventListener("mousemove", onPanelDragMove);
  window.removeEventListener("mouseup", onPanelDragEnd);
});

// Reload if scene URL changes (e.g., user uploads a new video)
watch(sceneUrl, async (url) => {
  if (!url || !containerRef.value) return;
  scene.dispose();
  await scene.init(containerRef.value, url);
});

// ── Control mode helpers ──────────────────────────────────────────────────────

function setMode(mode: ControlMode) {
  scene.setControlMode(mode);
}

// ── Shutter / ISO stop grids (same as Viewfinder) ────────────────────────────
type Stop = { value: number; label: string };

const SHUTTER_ROW1: Stop[] = [
  { value: 1 / 4000, label: "4000" },
  { value: 1 / 2000, label: "2000" },
  { value: 1 / 1000, label: "1000" },
  { value: 1 / 500, label: "500" },
  { value: 1 / 250, label: "250" },
  { value: 1 / 125, label: "125" },
  { value: 1 / 60, label: "60" },
  { value: 1 / 30, label: "30" },
  { value: 1 / 15, label: "15" },
];
const SHUTTER_ROW2: Stop[] = [
  { value: 1 / 8, label: '8"' },
  { value: 1 / 4, label: '4"' },
  { value: 1 / 2, label: '2"' },
  { value: 1, label: '1"' },
  { value: 2, label: "2s" },
  { value: 4, label: "4s" },
  { value: 8, label: "8s" },
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
];
const ISO_ROW1: Stop[] = [100, 200, 400, 800, 1600].map((v) => ({ value: v, label: String(v) }));
const ISO_ROW2: Stop[] = [3200, 6400, 12800, 25600].map((v) => ({ value: v, label: String(v) }));

function isShutterActive(v: number): boolean {
  const t = store.shutterSpeed;
  return Math.abs(t - v) / Math.max(t, v) < 0.05;
}
</script>

<template>
  <div class="sv-root">
    <!-- 3DGS rendering container (GaussianSplats3D appends its canvas here) -->
    <div ref="containerRef" class="sv-canvas" />

    <!-- Loading overlay -->
    <Transition name="fade">
      <div v-if="scene.isLoading.value" class="sv-overlay">
        <div class="sv-spinner" />
        <p class="sv-loading-text">載入場景… {{ Math.round(scene.loadProgress.value * 100) }}%</p>
        <div class="sv-progress-track">
          <div class="sv-progress-fill" :style="{ width: scene.loadProgress.value * 100 + '%' }" />
        </div>
      </div>
    </Transition>

    <!-- Error overlay -->
    <div v-if="scene.error.value" class="sv-error">
      <span>⚠ 場景載入失敗：{{ scene.error.value }}</span>
    </div>

    <!-- Control mode toggle (top-right corner) -->
    <div v-if="scene.isLoaded.value" class="sv-mode-toggle">
      <button
        class="mode-btn"
        :class="{ 'mode-btn--active': scene.controlMode.value === 'orbit' }"
        title="Orbit — 拖動旋轉，滾輪縮放"
        @click="setMode('orbit')"
      >
        Orbit
      </button>
      <button
        class="mode-btn"
        :class="{ 'mode-btn--active': scene.controlMode.value === 'fps' }"
        title="FPS — 點擊鎖定滑鼠，WASD 移動，Space / Shift 升降"
        @click="setMode('fps')"
      >
        FPS
      </button>
    </div>

    <!-- FPS pointer-lock hint -->
    <Transition name="fade">
      <div
        v-if="scene.controlMode.value === 'fps' && !scene.isFpsLocked.value && scene.isLoaded.value"
        class="sv-fps-hint"
      >
        點擊畫面以啟動 FPS 模式 &nbsp;|&nbsp; Esc 退出
      </div>
    </Transition>

    <!-- Floating camera control panel (same glassmorphism style as Viewfinder) -->
    <div
      v-if="scene.isLoaded.value"
      class="ctrl-panel"
      :style="{
        '--panel-alpha': panelOpacity,
        bottom: `${16 + dragOffsetY}px`,
        transform: `translateX(calc(-50% + ${dragOffsetX}px))`,
      }"
    >
      <!-- Header row: drag handle + EV + mode -->
      <div class="panel-row panel-row--header" @mousedown.prevent="onPanelDragStart">
        <span class="drag-handle">⠿</span>
        <span class="ev-label">
          EV {{ store.evAdjusted.toFixed(1) }}
          <span
            class="ev-delta"
            :class="{ over: store.exposureDelta > 0.5, under: store.exposureDelta < -0.5 }"
          >
            {{ store.exposureDelta > 0 ? "+" : "" }}{{ store.exposureDelta.toFixed(1) }}
          </span>
        </span>
        <div class="mode-btns">
          <button
            v-for="m in ['M', 'A', 'S', 'P'] as const"
            :key="m"
            class="mode-chip"
            :class="{ 'mode-chip--active': store.shootingMode === m }"
            @click="
              store.shootingMode = m;
              store.autoComputeExposure();
            "
          >
            {{ m }}
          </button>
        </div>
      </div>

      <div class="row-sep" />

      <!-- Main row: sensor / lens / aperture / shutter / ISO -->
      <div class="panel-row panel-row--main">
        <!-- Sensor + Lens -->
        <div class="main-cell main-cell--equip">
          <label class="cell-label">感光元件</label>
          <select v-model="store.selectedSensorId" class="dark-select">
            <option v-for="s in SENSORS" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <label class="cell-label" style="margin-top: 6px">鏡頭</label>
          <select v-model="store.selectedLensId" class="dark-select">
            <option v-for="l in LENSES" :key="l.id" :value="l.id">{{ l.name }}</option>
          </select>
        </div>

        <!-- Aperture -->
        <div class="main-cell main-cell--aperture">
          <label class="cell-label">光圈</label>
          <p class="aperture-val">f/{{ store.aperture.toFixed(1) }}</p>
          <input
            type="range"
            class="param-slider"
            :min="store.lens.maxAperture"
            :max="store.lens.minAperture"
            step="0.1"
            v-model.number="store.aperture"
            @input="store.autoComputeExposure()"
          />
        </div>

        <!-- Shutter -->
        <div class="main-cell main-cell--shutter">
          <label class="cell-label">快門</label>
          <div class="stop-grid">
            <button
              v-for="s in SHUTTER_ROW1"
              :key="s.label"
              class="stop-btn"
              :class="{ active: isShutterActive(s.value) }"
              @click="
                store.shutterSpeed = s.value;
                store.autoComputeExposure();
              "
            >
              {{ s.label }}
            </button>
          </div>
          <div class="stop-grid">
            <button
              v-for="s in SHUTTER_ROW2"
              :key="s.label"
              class="stop-btn"
              :class="{ active: isShutterActive(s.value) }"
              @click="
                store.shutterSpeed = s.value;
                store.autoComputeExposure();
              "
            >
              {{ s.label }}
            </button>
          </div>
        </div>

        <!-- ISO -->
        <div class="main-cell main-cell--iso">
          <label class="cell-label">ISO</label>
          <div class="stop-grid">
            <button
              v-for="s in ISO_ROW1"
              :key="s.label"
              class="stop-btn"
              :class="{ active: store.iso === s.value }"
              @click="
                store.iso = s.value;
                store.autoComputeExposure();
              "
            >
              {{ s.label }}
            </button>
          </div>
          <div class="stop-grid">
            <button
              v-for="s in ISO_ROW2"
              :key="s.label"
              class="stop-btn"
              :class="{ active: store.iso === s.value }"
              @click="
                store.iso = s.value;
                store.autoComputeExposure();
              "
            >
              {{ s.label }}
            </button>
          </div>
        </div>
      </div>

      <div class="row-sep" />

      <!-- Comp row: focal length + focus depth -->
      <div class="panel-row panel-row--comp">
        <div class="comp-cell">
          <label class="cell-label"
            >焦距 {{ store.focalLength }}mm（等效
            {{ store.equivalentFocalLength.toFixed(0) }}mm）</label
          >
          <input
            type="range"
            class="param-slider"
            min="14"
            max="200"
            step="1"
            v-model.number="store.focalLength"
          />
        </div>
        <div class="comp-cell">
          <label class="cell-label">對焦距離 {{ store.focusDepth.toFixed(1) }}m</label>
          <input
            type="range"
            class="param-slider"
            min="0.3"
            max="30"
            step="0.1"
            v-model.number="store.focusDepth"
          />
        </div>
      </div>

      <div class="row-sep" />

      <!-- Footer: post-process + reset -->
      <div class="panel-row panel-row--footer">
        <div class="footer-cell">
          <label class="cell-label">對比 {{ store.contrast.toFixed(2) }}</label>
          <input
            type="range"
            class="param-slider"
            min="0.5"
            max="2"
            step="0.05"
            v-model.number="store.contrast"
          />
        </div>
        <div class="footer-cell">
          <label class="cell-label">飽和度 {{ store.saturation.toFixed(2) }}</label>
          <input
            type="range"
            class="param-slider"
            min="0"
            max="2"
            step="0.05"
            v-model.number="store.saturation"
          />
        </div>
        <div class="footer-cell">
          <label class="cell-label">色溫 {{ store.colorTemp.toFixed(2) }}</label>
          <input
            type="range"
            class="param-slider"
            min="-1"
            max="1"
            step="0.05"
            v-model.number="store.colorTemp"
          />
        </div>
        <div class="footer-cell">
          <label class="cell-label">暗角 {{ store.vignetteStrength.toFixed(2) }}</label>
          <input
            type="range"
            class="param-slider"
            min="0"
            max="1"
            step="0.05"
            v-model.number="store.vignetteStrength"
          />
        </div>
        <button class="reset-btn" @click="store.resetCameraParams()">重設</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────────────────── */
.sv-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0a0a0e;
}
.sv-canvas {
  width: 100%;
  height: 100%;
}
/* GaussianSplats3D appends a <canvas> as direct child — make it fill the div */
.sv-canvas :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
}

/* ── Overlays ────────────────────────────────────────────────────────────── */
.sv-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(10, 10, 14, 0.72);
  backdrop-filter: blur(6px);
  z-index: 10;
}
.sv-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.sv-loading-text {
  font-size: 14px;
  color: var(--text);
}
.sv-progress-track {
  width: 240px;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}
.sv-progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.3s ease;
}
.sv-error {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  background: var(--danger);
  color: #fff;
  border-radius: 6px;
  font-size: 13px;
  z-index: 20;
}

/* ── Control mode toggle ─────────────────────────────────────────────────── */
.sv-mode-toggle {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 2px;
  background: rgba(10, 10, 14, 0.7);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px;
  z-index: 30;
  backdrop-filter: blur(8px);
}
.mode-btn {
  padding: 4px 14px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}
.mode-btn--active {
  background: var(--surface);
  color: var(--accent);
}
.mode-btn:hover:not(.mode-btn--active) {
  color: var(--text);
}

/* ── FPS hint ────────────────────────────────────────────────────────────── */
.sv-fps-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 10px 20px;
  background: rgba(10, 10, 14, 0.8);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-dim);
  font-size: 13px;
  pointer-events: none;
  z-index: 25;
}

/* ── Floating camera control panel ───────────────────────────────────────── */
.ctrl-panel {
  position: absolute;
  left: 50%;
  width: min(1020px, calc(100% - 32px));
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 14, var(--panel-alpha, 0.88));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  backdrop-filter: blur(24px) saturate(1.6);
  z-index: 20;
  overflow: hidden;
  cursor: default;
}

.panel-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  flex-shrink: 0;
}
.row-sep {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

/* Header */
.panel-row--header {
  cursor: grab;
  gap: 10px;
}
.panel-row--header:active {
  cursor: grabbing;
}
.drag-handle {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.2);
  cursor: grab;
  user-select: none;
}
.ev-label {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  font-weight: 600;
  flex-shrink: 0;
}
.ev-delta {
  font-size: 11px;
  margin-left: 4px;
  color: var(--text-dim);
}
.ev-delta.over {
  color: #ff7b7b;
}
.ev-delta.under {
  color: #7ba8ff;
}
.mode-btns {
  display: flex;
  gap: 2px;
  margin-left: auto;
}
.mode-chip {
  padding: 3px 10px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
}
.mode-chip--active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(255, 153, 51, 0.1);
}

/* Main row */
.panel-row--main {
  align-items: flex-start;
  gap: 0;
  padding: 10px 0;
}
.main-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 14px;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}
.main-cell:last-child {
  border-right: none;
}
.main-cell--equip {
  width: 190px;
  flex-shrink: 0;
}
.main-cell--aperture {
  width: 155px;
  flex-shrink: 0;
}
.main-cell--shutter {
  flex: 1;
  min-width: 230px;
}
.main-cell--iso {
  width: 200px;
  flex-shrink: 0;
}

.cell-label {
  font-size: 10px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.dark-select {
  width: 100%;
  background: #1a1a1e;
  color: #e8e8e8;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  padding: 4px 6px;
  font-size: 11px;
  cursor: pointer;
  color-scheme: dark;
}
.aperture-val {
  font-size: 22px;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  margin: 2px 0;
}
.param-slider {
  width: 100%;
  accent-color: var(--accent);
  cursor: pointer;
  height: 4px;
}
.stop-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.stop-btn {
  padding: 2px 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-dim);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    border-color 0.1s,
    background 0.1s,
    color 0.1s;
}
.stop-btn:hover {
  color: var(--text);
}
.stop-btn.active {
  border-color: var(--accent);
  background: rgba(255, 153, 51, 0.14);
  color: var(--accent);
}

/* Comp row */
.panel-row--comp {
  gap: 20px;
}
.comp-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Footer */
.panel-row--footer {
  flex-wrap: wrap;
  gap: 12px;
}
.footer-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
  flex: 1;
}
.reset-btn {
  padding: 5px 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 5px;
  background: transparent;
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    color 0.15s;
  align-self: center;
}
.reset-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* ── Transitions ─────────────────────────────────────────────────────────── */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
