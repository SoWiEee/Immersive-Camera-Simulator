<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCameraStore } from "@/stores/cameraStore";
import { useImageFX } from "@/composables/useImageFX";
import { SENSORS } from "@/data/sensors";
import { LENSES } from "@/data/lenses";
import DialWheel, { type DialStop } from "@/components/DialWheel/DialWheel.vue";
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

// ---- Dial stops ----
const SHUTTER_STOPS: DialStop[] = [
  { value: 1 / 4000, label: "1/4000" },
  { value: 1 / 2000, label: "1/2000" },
  { value: 1 / 1000, label: "1/1000" },
  { value: 1 / 500, label: "1/500" },
  { value: 1 / 250, label: "1/250" },
  { value: 1 / 125, label: "1/125" },
  { value: 1 / 60, label: "1/60" },
  { value: 1 / 30, label: "1/30" },
  { value: 1 / 15, label: "1/15" },
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

const ISO_STOPS: DialStop[] = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600].map((v) => ({
  value: v,
  label: String(v),
}));

const FL_PRESETS = [24, 35, 50, 85, 135, 200];

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

// ---- Advanced panel toggle ----
const showAdvanced = ref(false);

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

      <!-- ── Horizontal bottom panel ── -->
      <aside
        v-if="appState === 'ready'"
        class="controls"
        :style="{ '--panel-alpha': panelOpacity }"
      >
        <!-- Advanced row (expands above main row when toggled) -->
        <Transition name="adv-row">
          <div v-show="showAdvanced" class="controls__adv-row">
            <div class="ctrl-section">
              <span class="ctrl-sec-label"
                >對比 <span class="ctrl-val">{{ contrast.toFixed(2) }}</span></span
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
            <div class="ctrl-divider" />
            <div class="ctrl-section">
              <span class="ctrl-sec-label"
                >飽和度 <span class="ctrl-val">{{ saturation.toFixed(2) }}</span></span
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
            <div class="ctrl-divider" />
            <div class="ctrl-section">
              <span class="ctrl-sec-label">
                色溫
                <span class="ctrl-val"
                  >{{ colorTemp >= 0 ? "暖" : "冷" }}{{ Math.abs(colorTemp).toFixed(2) }}</span
                >
              </span>
              <input
                type="range"
                class="ctrl-slider"
                min="-1"
                max="1"
                step="0.05"
                v-model.number="colorTemp"
              />
            </div>
            <div class="ctrl-divider" />
            <div class="ctrl-section">
              <span class="ctrl-sec-label"
                >暗角 <span class="ctrl-val">{{ vignetteStrength.toFixed(2) }}</span></span
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
            <div class="ctrl-divider" />
            <div class="ctrl-section">
              <span class="ctrl-sec-label"
                >動態模糊 <span class="ctrl-val">{{ motionStrength.toFixed(2) }}</span></span
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
              <div class="ctrl-divider" />
              <div class="ctrl-section">
                <span class="ctrl-sec-label">
                  模糊方向
                  <span class="ctrl-val">{{ ((motionAngle * 180) / Math.PI).toFixed(0) }}°</span>
                </span>
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

        <!-- Main row -->
        <div class="controls__main-row">
          <!-- EV meter -->
          <div class="ctrl-section ctrl-section--ev">
            <span class="ctrl-sec-label">曝光 EV</span>
            <div class="ev-bar-track">
              <div
                class="ev-bar-fill"
                :style="{ width: evBarWidth + '%', background: evBarColor }"
              />
              <div class="ev-bar-center" />
            </div>
            <span class="ev-value" :style="{ color: evBarColor }">
              {{ exposureDelta >= 0 ? "+" : "" }}{{ exposureDelta.toFixed(1) }}
            </span>
            <span class="ctrl-hint">
              f/{{ aperture.toFixed(1) }} · {{ formatShutter(shutterSpeed) }} · ISO {{ iso }}
            </span>
          </div>

          <div class="ctrl-divider" />

          <!-- 拍攝模式 -->
          <div class="ctrl-section ctrl-section--mode">
            <span class="ctrl-sec-label">拍攝模式</span>
            <div class="mode-grid">
              <button
                v-for="m in ['M', 'A', 'S', 'P']"
                :key="m"
                class="mode-btn"
                :class="{ 'mode-btn--active': shootingMode === m }"
                @click="
                  shootingMode = m as any;
                  store.autoComputeExposure();
                "
              >
                {{ m }}
              </button>
            </div>
          </div>

          <div class="ctrl-divider" />

          <!-- 感光元件 -->
          <div class="ctrl-section ctrl-section--sensor">
            <span class="ctrl-sec-label">感光元件</span>
            <select class="ctrl-select" v-model="selectedSensorId">
              <option v-for="s in SENSORS" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>

          <div class="ctrl-divider" />

          <!-- 鏡頭 -->
          <div class="ctrl-section ctrl-section--lens">
            <span class="ctrl-sec-label">鏡頭</span>
            <select class="ctrl-select" v-model="selectedLensId">
              <option v-for="l in LENSES" :key="l.id" :value="l.id">{{ l.name }}</option>
            </select>
            <span class="ctrl-hint">{{ lens.brand }}</span>
          </div>

          <div class="ctrl-divider" />

          <!-- 光圈 -->
          <div
            class="ctrl-section ctrl-section--aperture"
            :class="{ 'ctrl-section--disabled': shootingMode === 'S' || shootingMode === 'P' }"
          >
            <span class="ctrl-sec-label"
              >光圈 <span class="ctrl-val">f/{{ aperture.toFixed(1) }}</span></span
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

          <div class="ctrl-divider" />

          <!-- 快門 -->
          <div
            class="ctrl-section ctrl-section--shutter"
            :class="{ 'ctrl-section--disabled': shootingMode === 'A' || shootingMode === 'P' }"
          >
            <span class="ctrl-sec-label"
              >快門 <span class="ctrl-val">{{ formatShutter(shutterSpeed) }}</span></span
            >
            <DialWheel
              :stops="SHUTTER_STOPS"
              v-model="shutterSpeed"
              :disabled="shootingMode === 'A' || shootingMode === 'P'"
              :log-scale="true"
              @update:model-value="
                (v) => {
                  shutterSpeed = v;
                  store.autoComputeExposure();
                }
              "
            />
          </div>

          <div class="ctrl-divider" />

          <!-- ISO -->
          <div class="ctrl-section ctrl-section--iso">
            <span class="ctrl-sec-label"
              >ISO <span class="ctrl-val">{{ iso }}</span></span
            >
            <DialWheel
              :stops="ISO_STOPS"
              v-model="iso"
              :log-scale="true"
              @update:model-value="
                (v) => {
                  iso = v;
                  store.autoComputeExposure();
                }
              "
            />
          </div>

          <div class="ctrl-divider" />

          <!-- 焦段 -->
          <div class="ctrl-section ctrl-section--focal">
            <span class="ctrl-sec-label">
              焦段
              <span class="ctrl-val"
                >{{ focalLength }}mm ≡{{ equivalentFocalLength.toFixed(0) }}mm</span
              >
            </span>
            <div class="preset-row">
              <button
                v-for="fl in FL_PRESETS"
                :key="fl"
                class="preset-btn"
                :class="{ 'preset-btn--active': focalLength === fl }"
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

          <div class="ctrl-divider" />

          <!-- 對焦距離 -->
          <div class="ctrl-section ctrl-section--focus">
            <span class="ctrl-sec-label"
              >對焦 <span class="ctrl-val">{{ (focusDepth * 100).toFixed(0) }}%</span></span
            >
            <input
              type="range"
              class="ctrl-slider"
              min="0"
              max="1"
              step="0.01"
              v-model.number="focusDepth"
            />
            <span class="ctrl-hint">或點擊畫面</span>
          </div>

          <div class="ctrl-divider" />

          <!-- 進階設定 toggle -->
          <div class="ctrl-section ctrl-section--adv">
            <span class="ctrl-sec-label">進階設定</span>
            <button class="adv-toggle-btn" @click="showAdvanced = !showAdvanced">
              {{ showAdvanced ? "▼ 收起" : "▲ 展開" }}
            </button>
          </div>

          <div class="ctrl-divider" />

          <!-- 動作 -->
          <div class="ctrl-section ctrl-section--actions">
            <button class="ctrl-btn ctrl-btn--reset" @click="onReset">重設參數</button>
            <button class="ctrl-btn" @click="onNewPhoto">換照片</button>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
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
  color: rgba(255, 255, 255, 0.4);
  pointer-events: none;
}

/* Teaching mode */
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

/* ── Horizontal bottom panel ── */
.controls {
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
  z-index: 10;

  background: rgba(10, 10, 14, var(--panel-alpha, 0.88));
  backdrop-filter: blur(24px) saturate(1.6);
  -webkit-backdrop-filter: blur(24px) saturate(1.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.07);

  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Advanced row */
.controls__adv-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}

.adv-row-enter-active,
.adv-row-leave-active {
  transition:
    max-height 0.22s ease,
    opacity 0.22s ease;
  max-height: 100px;
  overflow: hidden;
}
.adv-row-enter-from,
.adv-row-leave-to {
  max-height: 0;
  opacity: 0;
}

/* Main row */
.controls__main-row {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}

/* Sections */
.ctrl-section {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
  flex-shrink: 0;
}
.ctrl-section--disabled {
  opacity: 0.38;
  pointer-events: none;
}

/* Section label row */
.ctrl-sec-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.38);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.ctrl-val {
  font-size: 11px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  font-family: monospace;
  text-transform: none;
  letter-spacing: 0;
}

.ctrl-hint {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.28);
  white-space: nowrap;
}

/* Section divider */
.ctrl-divider {
  width: 1px;
  background: rgba(255, 255, 255, 0.07);
  flex-shrink: 0;
  align-self: stretch;
  margin: 8px 0;
}

/* EV section */
.ctrl-section--ev {
  min-width: 100px;
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
  background: rgba(255, 255, 255, 0.3);
  transform: translateX(-50%);
}
.ev-value {
  font-size: 18px;
  font-weight: 700;
  font-family: monospace;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

/* Mode section */
.ctrl-section--mode {
  min-width: 110px;
}
.mode-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
}
.mode-btn {
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 0.12s,
    color 0.12s,
    background 0.12s;
  white-space: nowrap;
  text-align: center;
}
.mode-btn--active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(255, 153, 51, 0.12);
}
.mode-btn:hover:not(.mode-btn--active) {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.75);
}

/* Sensor / Lens */
.ctrl-section--sensor {
  min-width: 140px;
}
.ctrl-section--lens {
  min-width: 170px;
}
.ctrl-select {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 4px 7px;
  font-size: 11px;
  width: 100%;
}

/* Aperture */
.ctrl-section--aperture {
  min-width: 150px;
  align-items: center;
}

/* Shutter / ISO */
.ctrl-section--shutter {
  min-width: 130px;
}
.ctrl-section--iso {
  min-width: 110px;
}

/* Focal length */
.ctrl-section--focal {
  min-width: 155px;
}
.preset-row {
  display: flex;
  gap: 2px;
  flex-wrap: nowrap;
}
.preset-btn {
  padding: 2px 5px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    border-color 0.1s,
    color 0.1s,
    background 0.1s;
  white-space: nowrap;
}
.preset-btn:hover {
  border-color: rgba(255, 153, 51, 0.4);
  color: rgba(255, 255, 255, 0.75);
}
.preset-btn--active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(255, 153, 51, 0.1);
}

.ctrl-slider {
  width: 100%;
  accent-color: var(--accent);
  cursor: pointer;
}

/* Focus */
.ctrl-section--focus {
  min-width: 120px;
}

/* Advanced toggle */
.ctrl-section--adv {
  min-width: 80px;
  align-items: center;
}
.adv-toggle-btn {
  padding: 5px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.12s,
    color 0.12s;
}
.adv-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
}

/* Action buttons */
.ctrl-section--actions {
  min-width: 130px;
  margin-left: auto;
  gap: 5px;
}
.ctrl-btn {
  width: 100%;
  padding: 6px 10px;
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
.ctrl-btn:hover {
  border-color: rgba(255, 153, 51, 0.4);
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.07);
}
.ctrl-btn--reset:hover {
  border-color: rgba(255, 107, 107, 0.5);
  color: #ff8080;
  background: rgba(255, 107, 107, 0.07);
}
</style>
