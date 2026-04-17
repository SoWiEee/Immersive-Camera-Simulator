<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useCameraStore } from '@/stores/cameraStore'
import { useImageFX } from '@/composables/useImageFX'

const store = useCameraStore()
const { appState, depthResult, imageFile, blurRadius } = storeToRefs(store)

const canvasRef = ref<HTMLCanvasElement | null>(null)
let fx: ReturnType<typeof useImageFX> | null = null

onMounted(async () => {
  if (!canvasRef.value) return

  try {
    fx = useImageFX(canvasRef.value)
    await fx.init()

    // If image + depth already available (e.g. navigating back to viewfinder)
    if (imageFile.value && depthResult.value) {
      await fx.loadImageAndDepth(imageFile.value, depthResult.value.depthMapB64)
    }
  } catch (e) {
    store.setAppState('error', `WebGPU pipeline error: ${e}`)
  }
})

// Load when depthResult arrives (after upload)
watch(depthResult, async (result) => {
  if (!fx || !result || !imageFile.value) return
  await fx.loadImageAndDepth(imageFile.value, result.depthMapB64)
})

function onNewPhoto() {
  store.setAppState('idle')
}
</script>

<template>
  <div class="viewfinder">
    <!-- Canvas -->
    <div class="viewfinder__canvas-wrap">
      <canvas ref="canvasRef" class="viewfinder__canvas" />

      <!-- Loading overlay -->
      <div v-if="appState === 'loading'" class="viewfinder__overlay">
        <span class="viewfinder__spinner" />
        <p>景深推算中…</p>
      </div>
    </div>

    <!-- Controls panel -->
    <aside class="viewfinder__controls" v-if="appState === 'ready'">
      <div class="ctrl-group">
        <label class="ctrl-label">
          模糊強度
          <span class="ctrl-value">{{ blurRadius }}px</span>
        </label>
        <input
          type="range"
          min="0"
          max="32"
          step="1"
          v-model.number="store.blurRadius"
          class="ctrl-slider"
        />
        <p class="ctrl-hint">Phase 1：純 Gaussian blur，驗證管道通暢</p>
      </div>

      <div v-if="depthResult" class="ctrl-group ctrl-group--info">
        <p>焦距估算：<strong>{{ depthResult.focalLengthPx.toFixed(0) }} px</strong></p>
        <p>圖片尺寸：<strong>{{ depthResult.width }} × {{ depthResult.height }}</strong></p>
        <p v-if="depthResult.inferenceMs">
          推論耗時：<strong>{{ depthResult.inferenceMs }} ms</strong>
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
  gap: 0;
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
@keyframes spin { to { transform: rotate(360deg); } }

/* Controls sidebar */
.viewfinder__controls {
  width: 240px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--surface);
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.ctrl-group { display: flex; flex-direction: column; gap: 8px; }

.ctrl-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
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
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.5;
}

.ctrl-group--info {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.8;
}
.ctrl-group--info strong { color: var(--text); }

.ctrl-btn {
  margin-top: auto;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-dim);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.ctrl-btn:hover {
  border-color: var(--accent-dim);
  color: var(--text);
}
</style>
