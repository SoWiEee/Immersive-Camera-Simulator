<script setup lang="ts">
import { ref, computed } from "vue";
import { useCameraStore } from "@/stores/cameraStore";
import { uploadAndReconstruct } from "@/composables/useReconstruct";

const store = useCameraStore();

const isDragging = ref(false);
const abortCtrl = ref<AbortController | null>(null);

const isActive = computed(
  () => store.appState === "uploading" || store.appState === "reconstructing",
);
const progressPct = computed(() => Math.round(store.reconstructionProgress * 100));

// ── File handling ─────────────────────────────────────────────────────────────

function onDragOver(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}
function onDragLeave() {
  isDragging.value = false;
}
function onDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) start(file);
}
function onFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) start(file);
}

async function start(file: File) {
  abortCtrl.value = new AbortController();
  store.setAppState("uploading");
  store.setReconstructionProgress("準備上傳", 0);

  try {
    const url = await uploadAndReconstruct(
      file,
      ({ stage, progress }) => {
        store.setReconstructionProgress(stage, progress);
        // Transition to 'reconstructing' once upload is done and polling starts
        if (store.appState === "uploading" && progress > 0) {
          store.setAppState("reconstructing");
        }
      },
      abortCtrl.value.signal,
    );
    store.setSceneUrl(url);
    store.setAppState("ready");
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      store.setAppState("idle");
    } else {
      store.setAppState("error", (e as Error).message);
    }
  } finally {
    abortCtrl.value = null;
  }
}

function cancel() {
  abortCtrl.value?.abort();
}
</script>

<template>
  <div class="upload-root">
    <!-- Drop zone (shown when idle / error) -->
    <div
      v-if="!isActive"
      class="drop-zone"
      :class="{ 'drop-zone--drag': isDragging, 'drop-zone--error': store.appState === 'error' }"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
      @click="($refs.fileInput as HTMLInputElement).click()"
    >
      <input
        ref="fileInput"
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-msvideo"
        class="file-input"
        @change="onFileInput"
      />
      <div class="drop-icon">🎬</div>
      <p class="drop-title">拖曳影片至此，或點擊選擇檔案</p>
      <p class="drop-sub">支援 MP4 / MOV / WebM，最大 500 MB</p>
      <p class="drop-sub">建議：繞行拍攝、每幀重疊約 70%、環境光充足</p>

      <div v-if="store.appState === 'error'" class="error-msg">⚠ {{ store.errorMessage }}</div>
    </div>

    <!-- Reconstruction progress (shown when uploading / reconstructing) -->
    <div v-else class="progress-panel">
      <div class="progress-icon">⚙️</div>

      <p class="progress-stage">{{ store.reconstructionStage }}</p>

      <div class="progress-bar-track">
        <div class="progress-bar-fill" :style="{ width: progressPct + '%' }" />
      </div>
      <p class="progress-pct">{{ progressPct }}%</p>

      <p class="progress-hint">
        場景重建需數分鐘，請勿關閉此頁面。<br />完成後可自由移動相機並模擬相機效果。
      </p>

      <button class="cancel-btn" @click="cancel">取消</button>
    </div>
  </div>
</template>

<style scoped>
.upload-root {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
}

/* ── Drop zone ───────────────────────────────────────────────────────────── */
.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 480px;
  padding: 3rem 2rem;
  border: 2px dashed var(--border);
  border-radius: 16px;
  background: var(--surface);
  cursor: pointer;
  transition:
    border-color 0.2s,
    background 0.2s;
  user-select: none;
}
.drop-zone:hover,
.drop-zone--drag {
  border-color: var(--accent);
  background: rgba(255, 153, 51, 0.06);
}
.drop-zone--error {
  border-color: var(--danger);
}

.file-input {
  display: none;
}
.drop-icon {
  font-size: 3rem;
  line-height: 1;
}
.drop-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.drop-sub {
  font-size: 12px;
  color: var(--text-dim);
  text-align: center;
  line-height: 1.6;
}
.error-msg {
  margin-top: 8px;
  font-size: 13px;
  color: var(--danger);
  text-align: center;
}

/* ── Progress panel ──────────────────────────────────────────────────────── */
.progress-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 420px;
}
.progress-icon {
  font-size: 2.5rem;
  animation: spin 3s linear infinite;
}
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.progress-stage {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  text-align: center;
  min-height: 1.4em;
}
.progress-bar-track {
  width: 100%;
  height: 6px;
  background: var(--surface);
  border-radius: 3px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.4s ease;
}
.progress-pct {
  font-size: 13px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.progress-hint {
  font-size: 12px;
  color: var(--text-dim);
  text-align: center;
  line-height: 1.7;
}
.cancel-btn {
  margin-top: 4px;
  padding: 6px 20px;
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
.cancel-btn:hover {
  border-color: var(--danger);
  color: var(--danger);
}
</style>
