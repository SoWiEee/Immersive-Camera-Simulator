<script setup lang="ts">
import { ref } from 'vue'
import { useCameraStore } from '@/stores/cameraStore'
import { useDepthMap } from '@/composables/useDepthMap'

const store = useCameraStore()
const { processImage, isLoading, error } = useDepthMap()

const isDragging = ref(false)

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

async function handleFile(file: File) {
  if (!ACCEPTED.includes(file.type)) {
    store.setAppState('error', `不支援的格式：${file.type}。請上傳 JPEG、PNG 或 WebP。`)
    return
  }

  store.setImage(file)
  store.setAppState('loading')

  try {
    const result = await processImage(file)
    store.setDepthResult({
      depthMapB64: result.depthMapB64,
      focalLengthPx: result.focalLengthPx,
      width: result.width,
      height: result.height,
      inferenceMs: result.inferenceMs ?? 0,
    })
    store.setAppState('ready')
  } catch (e) {
    store.setAppState('error', String(e))
  }
}

function onFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleFile(file)
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleFile(file)
}
</script>

<template>
  <div
    class="upload-zone"
    :class="{ 'upload-zone--dragging': isDragging, 'upload-zone--loading': isLoading }"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop="onDrop"
  >
    <label class="upload-zone__inner" :for="isLoading ? '' : 'file-input'">
      <!-- Loading -->
      <template v-if="isLoading">
        <span class="upload-zone__spinner" />
        <p class="upload-zone__title">Depth Pro 推算景深中…</p>
        <p class="upload-zone__hint">首次上傳約需 1–2 秒，相同圖片之後會從快取讀取</p>
      </template>

      <!-- Idle -->
      <template v-else>
        <p class="upload-zone__icon">📷</p>
        <p class="upload-zone__title">拖放圖片，或點擊上傳</p>
        <p class="upload-zone__hint">支援 JPEG、PNG、WebP，最大 20 MB</p>
      </template>
    </label>

    <input
      id="file-input"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="upload-zone__input"
      :disabled="isLoading"
      @change="onFileInput"
    />

    <p v-if="error" class="upload-zone__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.upload-zone {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  position: relative;
}

.upload-zone__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  max-width: 480px;
  padding: 3rem 2rem;
  border: 2px dashed var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  text-align: center;
}

.upload-zone--dragging .upload-zone__inner {
  border-color: var(--accent);
  background: rgba(200, 169, 110, 0.05);
}

.upload-zone--loading .upload-zone__inner {
  cursor: default;
  border-style: solid;
  border-color: var(--accent-dim);
}

.upload-zone__icon { font-size: 3rem; }

.upload-zone__title {
  font-size: 16px;
  font-weight: 500;
  color: var(--text);
}

.upload-zone__hint {
  font-size: 12px;
  color: var(--text-dim);
}

.upload-zone__input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
}

.upload-zone__error {
  margin-top: 1rem;
  color: var(--danger);
  font-size: 13px;
}

/* Spinner */
.upload-zone__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
