<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCameraStore } from "@/stores/cameraStore";
import { useImageFX } from "@/composables/useImageFX";
import { SENSORS } from "@/data/sensors";

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
  ev100,
  evAdjusted,
  exposureDelta,
  selectedSensorId,
} = storeToRefs(store);

const canvasRef = ref<HTMLCanvasElement | null>(null);
let fx: ReturnType<typeof useImageFX> | null = null;

onMounted(async () => {
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
});

watch(depthResult, async (result) => {
  if (!fx || !result || !imageFile.value) return;
  await fx.loadImageAndDepth(imageFile.value, result.depthMapB64);
});

// Click canvas to set focus depth from depth map
function onCanvasClick(event: MouseEvent) {
  if (!fx || !canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const scaleX = canvasRef.value.width / rect.width;
  const scaleY = canvasRef.value.height / rect.height;
  const px = (event.clientX - rect.left) * scaleX;
  const py = (event.clientY - rect.top) * scaleY;
  const depth = fx.pickFocusDepth(px, py);
  if (depth !== null) focusDepth.value = depth;
}

// Shutter speed display helper
function formatShutter(s: number): string {
  if (s >= 0.5) return `${s.toFixed(1)}s`;
  const denom = Math.round(1 / s);
  return `1/${denom}`;
}

// EV bar width for histogram-style indicator
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

function onNewPhoto() {
  store.setAppState("idle");
}
</script>

<template>
  <div class="viewfinder">
    <!-- Canvas area -->
    <div class="viewfinder__canvas-wrap">
      <canvas
        ref="canvasRef"
        class="viewfinder__canvas"
        :class="{ 'viewfinder__canvas--clickable': appState === 'ready' }"
        @click="onCanvasClick"
      />
      <div v-if="appState === 'loading'" class="viewfinder__overlay">
        <span class="viewfinder__spinner" />
        <p>景深推算中…</p>
      </div>
      <!-- Focus depth click hint -->
      <div v-if="appState === 'ready'" class="viewfinder__hint">點擊畫面選取對焦點</div>
    </div>

    <!-- Controls sidebar -->
    <aside class="controls" v-if="appState === 'ready'">
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
        <p class="ctrl-hint">等效焦距：{{ equivalentFocalLength.toFixed(0) }} mm</p>
      </div>

      <!-- Aperture -->
      <div
        class="ctrl-group"
        :class="{ 'ctrl-group--disabled': shootingMode === 'S' || shootingMode === 'P' }"
      >
        <div class="ctrl-label">
          光圈 <span class="ctrl-value">f/{{ aperture.toFixed(1) }}</span>
        </div>
        <input
          type="range"
          class="ctrl-slider"
          min="1"
          max="32"
          step="0.1"
          :value="aperture"
          @input="
            aperture = +($event.target as HTMLInputElement).value;
            store.autoComputeExposure();
          "
        />
        <p class="ctrl-hint">小 f 值 → 淺景深・更大散景</p>
      </div>

      <!-- Shutter speed -->
      <div
        class="ctrl-group"
        :class="{ 'ctrl-group--disabled': shootingMode === 'A' || shootingMode === 'P' }"
      >
        <div class="ctrl-label">
          快門 <span class="ctrl-value">{{ formatShutter(shutterSpeed) }}</span>
        </div>
        <input
          type="range"
          class="ctrl-slider"
          min="-13"
          max="0"
          step="0.5"
          :value="Math.log2(shutterSpeed)"
          @input="
            shutterSpeed = Math.pow(2, +($event.target as HTMLInputElement).value);
            store.autoComputeExposure();
          "
        />
        <p class="ctrl-hint">慢快門 → 更多動態模糊・曝光增加</p>
      </div>

      <!-- ISO -->
      <div class="ctrl-group">
        <div class="ctrl-label">
          ISO <span class="ctrl-value">{{ iso }}</span>
        </div>
        <input
          type="range"
          class="ctrl-slider"
          min="100"
          max="25600"
          step="100"
          v-model.number="iso"
        />
        <p class="ctrl-hint">高 ISO → 更多雜訊・感光度提升</p>
      </div>

      <!-- Focal length -->
      <div class="ctrl-group">
        <div class="ctrl-label">
          焦段 <span class="ctrl-value">{{ focalLength }} mm</span>
        </div>
        <input
          type="range"
          class="ctrl-slider"
          min="12"
          max="200"
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

      <!-- ---- Advanced ---- -->
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
            <span class="ctrl-value"
              >{{ colorTemp >= 0 ? "暖" : "冷" }} {{ Math.abs(colorTemp).toFixed(2) }}</span
            >
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
            動態模糊強度 <span class="ctrl-value">{{ motionStrength.toFixed(2) }}</span>
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

      <button class="ctrl-btn" @click="onNewPhoto">換張照片</button>
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
  width: 260px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--surface);
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
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

.ctrl-label {
  display: flex;
  justify-content: space-between;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 11px;
}
.ctrl-value {
  color: var(--accent);
  font-variant-numeric: tabular-nums;
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
  padding: 5px 0;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.1s,
    color 0.1s,
    background 0.1s;
}
.mode-btn--active {
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

/* Advanced section */
.ctrl-details {
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.ctrl-summary {
  cursor: pointer;
  font-size: 11px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  list-style: none;
  margin-bottom: 10px;
}
.ctrl-summary::before {
  content: "▶ ";
}
details[open] .ctrl-summary::before {
  content: "▼ ";
}

.ctrl-group--info {
  color: var(--text-dim);
  line-height: 1.8;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.ctrl-group--info strong {
  color: var(--text);
}

.ctrl-btn {
  margin-top: auto;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    color 0.15s;
}
.ctrl-btn:hover {
  border-color: var(--accent-dim);
  color: var(--text);
}
</style>
