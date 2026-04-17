<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCameraStore } from "@/stores/cameraStore";
import { useImageFX } from "@/composables/useImageFX";
import { SENSORS } from "@/data/sensors";
import DialWheel, { type DialStop } from "@/components/DialWheel/DialWheel.vue";
import LensSelector from "@/components/LensSelector/LensSelector.vue";
import ApertureRing from "@/components/ApertureRing/ApertureRing.vue";
import CompareView from "@/components/CompareView/CompareView.vue";

const store = useCameraStore();
const {
  appState,
  depthResult,
  imageFile,
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
  sensor,
  compareMode,
} = storeToRefs(store);

// ---- Single-view pipeline (used when compareMode = false) ----
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

// Click on single canvas for focus picking
function onCanvasClick(event: MouseEvent) {
  if (!fx || !canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const depth = fx.pickFocusDepth(
    (event.clientX - rect.left) * (canvasRef.value.width / rect.width),
    (event.clientY - rect.top) * (canvasRef.value.height / rect.height),
  );
  if (depth !== null) focusDepth.value = depth;
}

// Reload image into single pipeline when switching to single mode
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

const FL_PRESETS = [24, 28, 35, 50, 58, 85, 135, 200];

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

// ---- Teaching HUD physics calculations ----

// Equivalent full-frame aperture (same DoF on FF)
const ffEquivAperture = computed(() => aperture.value * sensor.value.cropFactor);

// DoF feel classification based on effective aperture
const dofFeel = computed(() => {
  const ne = ffEquivAperture.value;
  if (ne < 2) return "極淺景深";
  if (ne < 4) return "淺景深";
  if (ne < 8) return "中景深";
  return "深景深";
});

// Hyperfocal distance in meters: H = f² / (N × c)  (f in mm, c in mm)
const hyperfocalM = computed(() => {
  const f = focalLength.value;
  const N = aperture.value;
  const c = sensor.value.cocMm;
  return (f * f) / (N * c) / 1000; // mm → m
});

// Sensor noise SNR estimate (dB)
const snrDb = computed(() => {
  const isoStops = Math.log2(iso.value / 100 + 1);
  const intensity = sensor.value.isoBaseNoise * isoStops * 1.8;
  if (intensity <= 0) return 99;
  return Math.round(20 * Math.log10(1 / intensity));
});

// Safe shutter speed (reciprocal rule): 1 / (focalLength × cropFactor)
const safeShutterS = computed(() => 1 / (focalLength.value * sensor.value.cropFactor));
const isShutterSafe = computed(() => shutterSpeed.value <= safeShutterS.value * 1.5);
const safeShutterLabel = computed(() => `1/${Math.round(1 / safeShutterS.value)}`);

function onNewPhoto() {
  store.setAppState("idle");
}

function onReset() {
  store.resetCameraParams();
}
</script>

<template>
  <div class="viewfinder">
    <!-- ---- Canvas area ---- -->
    <div class="viewfinder__canvas-wrap">
      <!-- Compare mode: two pipelines with split line -->
      <CompareView v-if="compareMode && appState === 'ready'" />

      <!-- Single-view canvas: always in DOM (v-show) so pipeline can be initialized -->
      <canvas
        ref="canvasRef"
        v-show="!compareMode && appState === 'ready'"
        class="viewfinder__canvas"
        :class="{ 'viewfinder__canvas--clickable': appState === 'ready' && !compareMode }"
        @click="onCanvasClick"
      />

      <!-- Loading overlay (shown in both modes) -->
      <div v-if="appState === 'loading'" class="viewfinder__overlay">
        <span class="viewfinder__spinner" />
        <p>景深推算中…</p>
      </div>

      <!-- Focus click hint -->
      <div v-if="appState === 'ready' && !compareMode" class="viewfinder__hint">
        點擊畫面選取對焦點
      </div>
    </div>

    <!-- ---- Controls sidebar ---- -->
    <aside class="controls" v-if="appState === 'ready'">
      <!-- Compare mode toggle -->
      <div class="ctrl-group ctrl-group--row">
        <button
          class="mode-btn"
          :class="{ 'mode-btn--active': compareMode }"
          @click="compareMode = true"
        >
          ⊟ 對比模式
        </button>
        <button
          class="mode-btn"
          :class="{ 'mode-btn--active': !compareMode }"
          @click="compareMode = false"
        >
          ◻ 單畫面
        </button>
      </div>

      <!-- EV meter -->
      <div class="ctrl-group">
        <div class="ctrl-label">
          曝光 EV
          <span class="ctrl-value" :style="{ color: evBarColor }">
            {{ exposureDelta >= 0 ? "+" : "" }}{{ exposureDelta.toFixed(1) }} EV
          </span>
        </div>
        <div class="ev-bar-track">
          <div class="ev-bar-fill" :style="{ width: evBarWidth + '%', background: evBarColor }" />
          <div class="ev-bar-center" />
        </div>
        <p class="ctrl-hint">
          f/{{ aperture.toFixed(1) }} · {{ formatShutter(shutterSpeed) }} · ISO {{ iso }}
        </p>
      </div>

      <!-- Shooting mode -->
      <div class="ctrl-group">
        <div class="ctrl-label">拍攝模式</div>
        <div class="mode-row">
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

      <!-- Sensor -->
      <div class="ctrl-group">
        <div class="ctrl-label">感光元件</div>
        <select class="ctrl-select" v-model="selectedSensorId">
          <option v-for="s in SENSORS" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <p class="ctrl-physics">等效焦距 × {{ sensor.cropFactor }} · CoC {{ sensor.cocMm }}mm</p>
      </div>

      <!-- Lens selector -->
      <details class="ctrl-details">
        <summary class="ctrl-summary">鏡頭 — {{ lens.name }}</summary>
        <LensSelector v-model="selectedLensId" />
      </details>

      <!-- Aperture ring + f-stop presets -->
      <div
        class="ctrl-group"
        :class="{ 'ctrl-group--disabled': shootingMode === 'S' || shootingMode === 'P' }"
      >
        <div class="ctrl-label">
          光圈 <span class="ctrl-value">f/{{ aperture.toFixed(1) }}</span>
        </div>
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
        <p class="ctrl-physics">
          {{ dofFeel }} · 等效全幅 f/{{ ffEquivAperture.toFixed(1) }} · 超焦距
          {{ hyperfocalM.toFixed(0) }}m
        </p>
      </div>

      <!-- Shutter speed dial -->
      <div
        class="ctrl-group"
        :class="{ 'ctrl-group--disabled': shootingMode === 'A' || shootingMode === 'P' }"
      >
        <div class="ctrl-label">
          快門 <span class="ctrl-value">{{ formatShutter(shutterSpeed) }}</span>
        </div>
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
        <p class="ctrl-physics" :class="{ 'ctrl-physics--warn': !isShutterSafe }">
          安全快門 {{ safeShutterLabel }}s
          {{ isShutterSafe ? "✓" : "▲ 可能手震" }}
        </p>
      </div>

      <!-- ISO dial -->
      <div class="ctrl-group">
        <div class="ctrl-label">
          ISO <span class="ctrl-value">{{ iso }}</span>
        </div>
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
        <p class="ctrl-physics">訊雜比 ≈ {{ snrDb }} dB</p>
      </div>

      <!-- Focal length presets -->
      <div class="ctrl-group">
        <div class="ctrl-label">
          焦段
          <span class="ctrl-value"
            >{{ focalLength }}mm (≡{{ equivalentFocalLength.toFixed(0) }}mm)</span
          >
        </div>
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

      <!-- Focus depth -->
      <div class="ctrl-group">
        <div class="ctrl-label">
          對焦距離 <span class="ctrl-value">{{ (focusDepth * 100).toFixed(0) }}%</span>
        </div>
        <input
          type="range"
          class="ctrl-slider"
          min="0"
          max="1"
          step="0.01"
          v-model.number="focusDepth"
        />
        <p class="ctrl-hint">或點擊畫面選取對焦點</p>
      </div>

      <!-- Advanced settings -->
      <details class="ctrl-details">
        <summary class="ctrl-summary">進階設定</summary>

        <div class="ctrl-group">
          <div class="ctrl-label">
            對比 <span class="ctrl-value">{{ contrast.toFixed(2) }}</span>
          </div>
          <input
            type="range"
            class="ctrl-slider"
            min="0.5"
            max="2"
            step="0.05"
            v-model.number="contrast"
          />
        </div>
        <div class="ctrl-group">
          <div class="ctrl-label">
            飽和度 <span class="ctrl-value">{{ saturation.toFixed(2) }}</span>
          </div>
          <input
            type="range"
            class="ctrl-slider"
            min="0"
            max="2"
            step="0.05"
            v-model.number="saturation"
          />
        </div>
        <div class="ctrl-group">
          <div class="ctrl-label">
            色溫
            <span class="ctrl-value">
              {{ colorTemp >= 0 ? "暖" : "冷" }} {{ Math.abs(colorTemp).toFixed(2) }}
            </span>
          </div>
          <input
            type="range"
            class="ctrl-slider"
            min="-1"
            max="1"
            step="0.05"
            v-model.number="colorTemp"
          />
        </div>
        <div class="ctrl-group">
          <div class="ctrl-label">
            暗角 <span class="ctrl-value">{{ vignetteStrength.toFixed(2) }}</span>
          </div>
          <input
            type="range"
            class="ctrl-slider"
            min="0"
            max="1"
            step="0.05"
            v-model.number="vignetteStrength"
          />
        </div>
        <div class="ctrl-group">
          <div class="ctrl-label">
            動態模糊 <span class="ctrl-value">{{ motionStrength.toFixed(2) }}</span>
          </div>
          <input
            type="range"
            class="ctrl-slider"
            min="0"
            max="1"
            step="0.05"
            v-model.number="motionStrength"
          />
        </div>
        <div class="ctrl-group" v-if="motionStrength > 0">
          <div class="ctrl-label">
            模糊方向
            <span class="ctrl-value">{{ ((motionAngle * 180) / Math.PI).toFixed(0) }}°</span>
          </div>
          <input
            type="range"
            class="ctrl-slider"
            min="0"
            :max="Math.PI * 2"
            step="0.1"
            v-model.number="motionAngle"
          />
        </div>
      </details>

      <!-- Depth result info -->
      <div v-if="depthResult" class="ctrl-group ctrl-group--info">
        <p>
          景深推論：<strong>{{ depthResult.inferenceMs }} ms</strong>
        </p>
        <p>
          圖片尺寸：<strong>{{ depthResult.width }} × {{ depthResult.height }}</strong>
        </p>
        <p>
          估算焦距：<strong>{{ depthResult.focalLengthPx.toFixed(0) }} px</strong>
        </p>
      </div>

      <!-- Action buttons -->
      <div class="ctrl-actions">
        <button class="ctrl-btn ctrl-btn--reset" @click="onReset" title="重設相機參數">
          重設參數
        </button>
        <button class="ctrl-btn" @click="onNewPhoto">換張照片</button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.viewfinder {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Canvas area */
.viewfinder__canvas-wrap {
  flex: 1;
  position: relative;
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

/* Controls sidebar */
.controls {
  width: 270px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--surface);
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  font-size: 12px;
}

.ctrl-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ctrl-group--disabled {
  opacity: 0.4;
  pointer-events: none;
}
.ctrl-group--row {
  flex-direction: row;
  gap: 6px;
}

.ctrl-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 10px;
}
.ctrl-value {
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
}

.ctrl-slider {
  width: 100%;
  accent-color: var(--accent);
  cursor: pointer;
}

.ctrl-hint {
  font-size: 10px;
  color: var(--text-dim);
  line-height: 1.5;
  margin: 0;
}

/* Physics teaching hint (cyan tint) */
.ctrl-physics {
  font-size: 10px;
  color: #5bc4d8;
  line-height: 1.5;
  margin: 0;
}
.ctrl-physics--warn {
  color: #ff9933;
}

.ctrl-select {
  width: 100%;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 11px;
}

/* Shooting mode buttons */
.mode-row {
  display: flex;
  gap: 4px;
}
.mode-btn {
  flex: 1;
  padding: 5px 4px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.1s,
    color 0.1s,
    background 0.1s;
  white-space: nowrap;
}
.mode-btn--active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(255, 153, 51, 0.08);
}

/* Preset button rows */
.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.preset-btn {
  padding: 3px 6px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--text-dim);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    border-color 0.1s,
    color 0.1s,
    background 0.1s;
}
.preset-btn:hover {
  border-color: var(--accent-dim);
  color: var(--text);
}
.preset-btn--active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(255, 153, 51, 0.08);
}

/* EV meter */
.ev-bar-track {
  position: relative;
  height: 6px;
  background: var(--border);
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

/* Collapsible sections */
.ctrl-details {
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.ctrl-summary {
  cursor: pointer;
  font-size: 10px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  list-style: none;
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ctrl-summary::before {
  content: "▶ ";
}
details[open] .ctrl-summary::before {
  content: "▼ ";
}

/* Info block */
.ctrl-group--info {
  color: var(--text-dim);
  line-height: 1.8;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.ctrl-group--info strong {
  color: var(--text);
}

/* Action buttons */
.ctrl-actions {
  display: flex;
  gap: 6px;
  margin-top: auto;
}
.ctrl-btn {
  flex: 1;
  padding: 7px 10px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    color 0.15s;
}
.ctrl-btn:hover {
  border-color: var(--accent-dim);
  color: var(--text);
}
.ctrl-btn--reset:hover {
  border-color: #ff6b6b;
  color: #ff6b6b;
}
</style>
