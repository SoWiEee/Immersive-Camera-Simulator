<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCameraStore } from "@/stores/cameraStore";
import { useImageFX } from "@/composables/useImageFX";
import { SENSORS } from "@/data/sensors";
import { LENSES } from "@/data/lenses";
import ApertureRing from "@/components/ApertureRing/ApertureRing.vue";
import CompareView from "@/components/CompareView/CompareView.vue";
import TeachingHUD from "@/components/TeachingHUD/TeachingHUD.vue";

const store = useCameraStore();
const {
  appState,
  imageFile,
  depthResult,
  shootingMode,
  aperture,
  shutterSpeed,
  iso,
  focalLength,
  focusDepth,
  contrast,
  saturation,
  colorTemp,
  vignetteStrength,
  motionAngle,
  motionStrength,
  equivalentFocalLength,
  exposureDelta,
  selectedSensorId,
  selectedLensId,
  lens,
  compareMode,
  teachingMode,
  panelOpacity,
} = storeToRefs(store);

// ---- Single-view pipeline ----
const canvasRef = ref<HTMLCanvasElement | null>(null);
let fx: ReturnType<typeof useImageFX> | null = null;

onMounted(async () => {
  if (!canvasRef.value) return;
  await initSinglePipeline();
});

async function initSinglePipeline() {
  if (!canvasRef.value) return;
  try {
    fx = useImageFX(canvasRef.value);
    await fx.init();
    if (imageFile.value && depthResult.value) {
      await fx.loadImageAndDepth(imageFile.value, depthResult.value.depthMapB64);
    }
  } catch (e) {
    store.setAppState("error", `WebGPU pipeline error: ${e}`);
  }
}

watch(depthResult, async (result) => {
  if (compareMode.value || !fx || !result || !imageFile.value) return;
  await fx.loadImageAndDepth(imageFile.value, result.depthMapB64);
});

function onCanvasClick(event: MouseEvent) {
  if (!fx || !canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const depth = fx.pickFocusDepth(
    (event.clientX - rect.left) * (canvasRef.value.width / rect.width),
    (event.clientY - rect.top) * (canvasRef.value.height / rect.height),
  );
  if (depth !== null) focusDepth.value = depth;
}

watch(compareMode, async (isCompare) => {
  if (!isCompare && fx && imageFile.value && depthResult.value) {
    await fx.loadImageAndDepth(imageFile.value, depthResult.value.depthMapB64);
  }
});

// ---- Stop grids (two rows each) ----
type Stop = { value: number; label: string };

const SHUTTER_ROW1: Stop[] = [
  { value: 1 / 4000, label: "1/4000" },
  { value: 1 / 2000, label: "1/2000" },
  { value: 1 / 1000, label: "1/1000" },
  { value: 1 / 500, label: "1/500" },
  { value: 1 / 250, label: "1/250" },
  { value: 1 / 125, label: "1/125" },
  { value: 1 / 60, label: "1/60" },
  { value: 1 / 30, label: "1/30" },
  { value: 1 / 15, label: "1/15" },
];
const SHUTTER_ROW2: Stop[] = [
  { value: 1 / 8, label: "1/8" },
  { value: 1 / 4, label: "1/4" },
  { value: 1 / 2, label: '1/2"' },
  { value: 1, label: '1"' },
  { value: 2, label: '2"' },
  { value: 4, label: '4"' },
  { value: 8, label: '8"' },
  { value: 15, label: '15"' },
  { value: 30, label: '30"' },
];
const ISO_ROW1: Stop[] = [100, 200, 400, 800, 1600].map((v) => ({ value: v, label: String(v) }));
const ISO_ROW2: Stop[] = [3200, 6400, 12800, 25600].map((v) => ({ value: v, label: String(v) }));

const FL_PRESETS = [24, 35, 50, 85, 135, 200];

// Fuzzy match for shutter (floating-point values set by autoCompute may differ slightly)
function isShutterActive(v: number): boolean {
  return Math.abs(shutterSpeed.value - v) / Math.max(shutterSpeed.value, v) < 0.05;
}

// ---- EV display ----
const evBarWidth = computed(() => {
  const clamped = Math.max(-3, Math.min(3, exposureDelta.value));
  return ((clamped + 3) / 6) * 100;
});
const evBarColor = computed(() => {
  const d = exposureDelta.value;
  if (d > 1.5) return "#ff6b35";
  if (d < -1.5) return "#4a9eff";
  return "#52c41a";
});

function formatShutter(s: number): string {
  if (s >= 0.5) return `${s.toFixed(1)}s`;
  return `1/${Math.round(1 / s)}`;
}

const showAdvanced = ref(false);

// ---- Panel drag ----
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
  // Y is bottom-relative: dragging up increases the bottom offset
  dragOffsetY.value = dragStartOffsetY - (e.clientY - dragStartClientY);
}
function onPanelDragEnd() {
  dragActive = false;
  window.removeEventListener("mousemove", onPanelDragMove);
  window.removeEventListener("mouseup", onPanelDragEnd);
}
onUnmounted(() => {
  window.removeEventListener("mousemove", onPanelDragMove);
  window.removeEventListener("mouseup", onPanelDragEnd);
});

function onNewPhoto() {
  store.setAppState("idle");
}
function onReset() {
  store.resetCameraParams();
}
</script>

<template>
  <div class="viewfinder">
    <div class="viewfinder__canvas-wrap">
      <CompareView v-if="compareMode && appState === 'ready'" />

      <canvas
        ref="canvasRef"
        v-show="!compareMode && appState === 'ready'"
        class="viewfinder__canvas"
        :class="{ 'viewfinder__canvas--clickable': appState === 'ready' && !compareMode }"
        @click="onCanvasClick"
      />

      <div v-if="appState === 'loading'" class="viewfinder__overlay">
        <span class="viewfinder__spinner" />
        <p>景深推算中…</p>
      </div>

      <div v-if="appState === 'ready' && !compareMode && !teachingMode" class="viewfinder__hint">
        點擊畫面選取對焦點
      </div>

      <Transition name="teaching">
        <div v-if="teachingMode && appState === 'ready'" class="teaching-overlay" />
      </Transition>
      <Transition name="teaching-panel">
        <TeachingHUD v-if="teachingMode && appState === 'ready'" />
      </Transition>

      <!-- ════════════════════════════════════════
           Floating control panel — centred bottom
           ════════════════════════════════════════ -->
      <aside
        v-if="appState === 'ready'"
        class="cam-panel"
        :style="{
          '--panel-alpha': panelOpacity,
          bottom: `${16 + dragOffsetY}px`,
          transform: `translateX(calc(-50% + ${dragOffsetX}px))`,
        }"
      >
        <!-- Advanced row: slides in above main body -->
        <Transition name="adv-row">
          <div v-show="showAdvanced" class="cam-row cam-row--adv">
            <div class="adv-cell">
              <span class="cell-label"
                >對比 <em class="cell-val">{{ contrast.toFixed(2) }}</em></span
              >
              <input
                type="range"
                class="ctrl-slider"
                min="0.5"
                max="2"
                step="0.05"
                v-model.number="contrast"
              />
            </div>
            <div class="cell-sep" />
            <div class="adv-cell">
              <span class="cell-label"
                >飽和度 <em class="cell-val">{{ saturation.toFixed(2) }}</em></span
              >
              <input
                type="range"
                class="ctrl-slider"
                min="0"
                max="2"
                step="0.05"
                v-model.number="saturation"
              />
            </div>
            <div class="cell-sep" />
            <div class="adv-cell">
              <span class="cell-label"
                >色溫
                <em class="cell-val"
                  >{{ colorTemp >= 0 ? "暖" : "冷" }}{{ Math.abs(colorTemp).toFixed(2) }}</em
                ></span
              >
              <input
                type="range"
                class="ctrl-slider"
                min="-1"
                max="1"
                step="0.05"
                v-model.number="colorTemp"
              />
            </div>
            <div class="cell-sep" />
            <div class="adv-cell">
              <span class="cell-label"
                >暗角 <em class="cell-val">{{ vignetteStrength.toFixed(2) }}</em></span
              >
              <input
                type="range"
                class="ctrl-slider"
                min="0"
                max="1"
                step="0.05"
                v-model.number="vignetteStrength"
              />
            </div>
            <div class="cell-sep" />
            <div class="adv-cell">
              <span class="cell-label"
                >動態模糊 <em class="cell-val">{{ motionStrength.toFixed(2) }}</em></span
              >
              <input
                type="range"
                class="ctrl-slider"
                min="0"
                max="1"
                step="0.05"
                v-model.number="motionStrength"
              />
            </div>
            <template v-if="motionStrength > 0">
              <div class="cell-sep" />
              <div class="adv-cell">
                <span class="cell-label"
                  >模糊方向
                  <em class="cell-val">{{ ((motionAngle * 180) / Math.PI).toFixed(0) }}°</em></span
                >
                <input
                  type="range"
                  class="ctrl-slider"
                  min="0"
                  :max="Math.PI * 2"
                  step="0.1"
                  v-model.number="motionAngle"
                />
              </div>
            </template>
          </div>
        </Transition>

        <!-- ── ROW 1: EV status + Shooting mode (drag handle) ── -->
        <div class="cam-row cam-row--header" @mousedown.prevent="onPanelDragStart">
          <!-- EV status (left) -->
          <div class="header-ev">
            <div class="ev-bar-track">
              <div
                class="ev-bar-fill"
                :style="{ width: evBarWidth + '%', background: evBarColor }"
              />
              <div class="ev-bar-center" />
            </div>
            <div class="ev-readout">
              <span class="ev-value" :style="{ color: evBarColor }">
                {{ exposureDelta >= 0 ? "+" : "" }}{{ exposureDelta.toFixed(1) }} EV
              </span>
              <span class="ev-triangle">
                f/{{ aperture.toFixed(1) }} &nbsp;·&nbsp;
                {{ formatShutter(shutterSpeed) }} &nbsp;·&nbsp; ISO {{ iso }}
              </span>
            </div>
          </div>

          <div class="cell-sep cell-sep--v" />

          <!-- Shooting mode (right) -->
          <div class="header-mode">
            <span class="cell-label">拍攝模式</span>
            <div class="mode-group">
              <button
                v-for="m in ['M', 'A', 'S', 'P']"
                :key="m"
                class="mode-btn"
                :class="{ active: shootingMode === m }"
                @click="
                  shootingMode = m as any;
                  store.autoComputeExposure();
                "
              >
                {{ m }}
              </button>
            </div>
          </div>
        </div>

        <div class="row-sep" />

        <!-- ── ROW 2: Equipment · Aperture · Shutter · ISO ── -->
        <div class="cam-row cam-row--main">
          <!-- Equipment: sensor + lens -->
          <div class="main-cell main-cell--equip">
            <div class="equip-field">
              <span class="cell-label">感光元件</span>
              <select class="ctrl-select" v-model="selectedSensorId">
                <option v-for="s in SENSORS" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>
            <div class="equip-field">
              <span class="cell-label">鏡頭</span>
              <select class="ctrl-select" v-model="selectedLensId">
                <option v-for="l in LENSES" :key="l.id" :value="l.id">{{ l.name }}</option>
              </select>
              <span class="cell-dim">{{ lens.brand }}</span>
            </div>
          </div>

          <div class="cell-sep cell-sep--v" />

          <!-- Aperture -->
          <div
            class="main-cell main-cell--aperture"
            :class="{ 'main-cell--disabled': shootingMode === 'S' || shootingMode === 'P' }"
          >
            <span class="cell-label"
              >光圈 <em class="cell-val">f/{{ aperture.toFixed(1) }}</em></span
            >
            <ApertureRing
              v-model="aperture"
              :min="lens.maxAperture"
              :max="lens.minAperture"
              :disabled="shootingMode === 'S' || shootingMode === 'P'"
              @update:model-value="
                (v) => {
                  aperture = v;
                  store.autoComputeExposure();
                }
              "
            />
          </div>

          <div class="cell-sep cell-sep--v" />

          <!-- Shutter -->
          <div
            class="main-cell main-cell--shutter"
            :class="{ 'main-cell--disabled': shootingMode === 'A' || shootingMode === 'P' }"
          >
            <span class="cell-label"
              >快門 <em class="cell-val">{{ formatShutter(shutterSpeed) }}</em></span
            >
            <div class="stop-grid">
              <div class="stop-row">
                <button
                  v-for="s in SHUTTER_ROW1"
                  :key="s.label"
                  class="stop-btn"
                  :class="{ active: isShutterActive(s.value) }"
                  @click="
                    shutterSpeed = s.value;
                    store.autoComputeExposure();
                  "
                >
                  {{ s.label }}
                </button>
              </div>
              <div class="stop-row">
                <button
                  v-for="s in SHUTTER_ROW2"
                  :key="s.label"
                  class="stop-btn"
                  :class="{ active: isShutterActive(s.value) }"
                  @click="
                    shutterSpeed = s.value;
                    store.autoComputeExposure();
                  "
                >
                  {{ s.label }}
                </button>
              </div>
            </div>
          </div>

          <div class="cell-sep cell-sep--v" />

          <!-- ISO -->
          <div class="main-cell main-cell--iso">
            <span class="cell-label"
              >ISO <em class="cell-val">{{ iso }}</em></span
            >
            <div class="stop-grid">
              <div class="stop-row">
                <button
                  v-for="s in ISO_ROW1"
                  :key="s.value"
                  class="stop-btn"
                  :class="{ active: iso === s.value }"
                  @click="
                    iso = s.value;
                    store.autoComputeExposure();
                  "
                >
                  {{ s.label }}
                </button>
              </div>
              <div class="stop-row">
                <button
                  v-for="s in ISO_ROW2"
                  :key="s.value"
                  class="stop-btn"
                  :class="{ active: iso === s.value }"
                  @click="
                    iso = s.value;
                    store.autoComputeExposure();
                  "
                >
                  {{ s.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="row-sep" />

        <!-- ── ROW 3: Focal length · Focus depth ── -->
        <div class="cam-row cam-row--comp">
          <!-- Focal length -->
          <div class="comp-cell comp-cell--focal">
            <span class="cell-label">
              焦段
              <em class="cell-val"
                >{{ focalLength }}mm
                <span class="cell-dim">≡ {{ equivalentFocalLength.toFixed(0) }}mm</span></em
              >
            </span>
            <div class="preset-row">
              <button
                v-for="fl in FL_PRESETS"
                :key="fl"
                class="preset-btn"
                :class="{ active: focalLength === fl }"
                @click="focalLength = fl"
              >
                {{ fl }}
              </button>
            </div>
            <input
              type="range"
              class="ctrl-slider"
              min="14"
              max="600"
              step="1"
              v-model.number="focalLength"
            />
          </div>

          <div class="cell-sep cell-sep--v" />

          <!-- Focus depth -->
          <div class="comp-cell comp-cell--focus">
            <span class="cell-label"
              >對焦距離 <em class="cell-val">{{ (focusDepth * 100).toFixed(0) }}%</em></span
            >
            <input
              type="range"
              class="ctrl-slider"
              min="0"
              max="1"
              step="0.01"
              v-model.number="focusDepth"
            />
            <span class="cell-dim">或點擊畫面選取對焦點</span>
          </div>
        </div>

        <div class="row-sep" />

        <!-- ── ROW 4: Footer ── -->
        <div class="cam-row cam-row--footer">
          <button class="adv-toggle" @click="showAdvanced = !showAdvanced">
            {{ showAdvanced ? "▼ 收起進階" : "▲ 進階設定" }}
          </button>
          <span class="footer-spacer" />
          <button class="action-btn action-btn--reset" @click="onReset">重設參數</button>
          <button class="action-btn" @click="onNewPhoto">換照片</button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ── Canvas / viewfinder shell ── */
.viewfinder {
  flex: 1;
  overflow: hidden;
  position: relative;
}
.viewfinder__canvas-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  overflow: hidden;
}
.viewfinder__canvas {
  max-width: 100%;
  max-height: 100%;
  display: block;
}
.viewfinder__canvas--clickable {
  cursor: crosshair;
}
.viewfinder__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.6);
  color: var(--text-dim);
  font-size: 14px;
}
.viewfinder__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.viewfinder__hint {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  pointer-events: none;
}

/* ── Teaching mode ── */
.teaching-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 19;
  pointer-events: none;
}
.teaching-enter-active,
.teaching-leave-active {
  transition: opacity 0.25s ease;
}
.teaching-enter-from,
.teaching-leave-to {
  opacity: 0;
}
.teaching-panel-enter-active,
.teaching-panel-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.teaching-panel-enter-from,
.teaching-panel-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

/* ══════════════════════════════════════════════════
   CAMERA PANEL
   ══════════════════════════════════════════════════ */
.cam-panel {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: min(1020px, calc(100% - 32px));
  z-index: 10;

  background: rgba(10, 10, 14, var(--panel-alpha, 0.88));
  backdrop-filter: blur(28px) saturate(1.8);
  -webkit-backdrop-filter: blur(28px) saturate(1.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow:
    0 12px 48px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);

  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: 12px;
}

/* Row separator */
.row-sep {
  height: 1px;
  background: rgba(255, 255, 255, 0.07);
  flex-shrink: 0;
}

/* Vertical cell separator */
.cell-sep--v {
  width: 1px;
  background: rgba(255, 255, 255, 0.07);
  flex-shrink: 0;
  align-self: stretch;
  margin: 10px 0;
}

/* Shared label style */
.cell-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.09em;
  white-space: nowrap;
}
.cell-val {
  font-style: normal;
  font-size: 12px;
  font-weight: 700;
  font-family: monospace;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  letter-spacing: 0;
  text-transform: none;
}
.cell-dim {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.28);
}

/* ── Row: Advanced ── */
.cam-row--adv {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 10px 0;
  background: rgba(255, 255, 255, 0.02);
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.08) transparent;
}
.adv-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 16px;
  min-width: 140px;
  flex: 1;
}
.cell-sep {
  width: 1px;
  background: rgba(255, 255, 255, 0.07);
  align-self: stretch;
  flex-shrink: 0;
}
.adv-row-enter-active,
.adv-row-leave-active {
  transition:
    max-height 0.22s ease,
    opacity 0.2s ease;
  max-height: 80px;
  overflow: hidden;
}
.adv-row-enter-from,
.adv-row-leave-to {
  max-height: 0;
  opacity: 0;
}

/* ── Row 1: Header (drag handle) ── */
.cam-row--header {
  display: flex;
  align-items: center;
  padding: 10px 20px;
  gap: 0;
  cursor: grab;
  user-select: none;
}
.cam-row--header:active {
  cursor: grabbing;
}
.header-ev {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.ev-bar-track {
  position: relative;
  height: 5px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}
.ev-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition:
    width 0.15s,
    background 0.15s;
}
.ev-bar-center {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  background: rgba(255, 255, 255, 0.25);
  transform: translateX(-50%);
}
.ev-readout {
  display: flex;
  align-items: baseline;
  gap: 16px;
}
.ev-value {
  font-size: 20px;
  font-weight: 800;
  font-family: monospace;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.ev-triangle {
  font-size: 12px;
  font-family: monospace;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.45);
}
.header-mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-left: 20px;
}
.mode-group {
  display: flex;
  gap: 4px;
}
.mode-btn {
  width: 36px;
  height: 30px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 0.12s,
    color 0.12s,
    background 0.12s;
}
.mode-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(255, 153, 51, 0.14);
}
.mode-btn:hover:not(.active) {
  background: rgba(255, 255, 255, 0.09);
  color: rgba(255, 255, 255, 0.75);
}

/* ── Row 2: Main (Equipment + Exposure triangle) ── */
.cam-row--main {
  display: flex;
  align-items: center;
  padding: 0;
}
.main-cell {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 20px;
}
.main-cell--disabled {
  opacity: 0.35;
  pointer-events: none;
}

/* Equipment column */
.main-cell--equip {
  min-width: 190px;
  flex: 0 0 190px;
  gap: 10px;
}
.equip-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ctrl-select {
  background: #1a1a1e;
  color: #e8e8e8;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 11px;
  width: 100%;
  cursor: pointer;
  color-scheme: dark;
}

/* Aperture column */
.main-cell--aperture {
  align-items: center;
  flex: 0 0 155px;
}

/* Shutter / ISO columns */
.main-cell--shutter {
  flex: 1;
  min-width: 230px;
}
.main-cell--iso {
  flex: 0 0 200px;
}

/* Two-row stop grids */
.stop-grid {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.stop-row {
  display: flex;
  gap: 3px;
}
.stop-btn {
  flex: 1;
  min-width: 0;
  padding: 4px 0;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.42);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  white-space: nowrap;
  text-align: center;
  transition:
    border-color 0.1s,
    color 0.1s,
    background 0.1s;
}
.stop-btn:hover {
  background: rgba(255, 255, 255, 0.09);
  color: rgba(255, 255, 255, 0.8);
}
.stop-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(255, 153, 51, 0.14);
}

/* ── Row 3: Composition ── */
.cam-row--comp {
  display: flex;
  align-items: center;
  padding: 0;
}
.comp-cell {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 20px;
}
.comp-cell--focal {
  flex: 1;
  min-width: 0;
}
.comp-cell--focus {
  flex: 0 0 220px;
}

.preset-row {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
}
.preset-btn {
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.38);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    border-color 0.1s,
    color 0.1s,
    background 0.1s;
}
.preset-btn:hover {
  border-color: rgba(255, 153, 51, 0.4);
  color: rgba(255, 255, 255, 0.75);
}
.preset-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(255, 153, 51, 0.12);
}
.ctrl-slider {
  width: 100%;
  accent-color: var(--accent);
  cursor: pointer;
}

/* ── Row 4: Footer ── */
.cam-row--footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.15);
}
.footer-spacer {
  flex: 1;
}
.adv-toggle {
  padding: 5px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
  white-space: nowrap;
}
.adv-toggle:hover {
  background: rgba(255, 255, 255, 0.09);
  color: rgba(255, 255, 255, 0.8);
}
.action-btn {
  padding: 5px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    border-color 0.12s,
    color 0.12s,
    background 0.12s;
}
.action-btn:hover {
  border-color: rgba(255, 153, 51, 0.4);
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.07);
}
.action-btn--reset:hover {
  border-color: rgba(255, 107, 107, 0.5);
  color: #ff8080;
  background: rgba(255, 107, 107, 0.07);
}
</style>
