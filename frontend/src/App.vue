<script setup lang="ts">
import { onMounted } from "vue";
import { useCameraStore } from "@/stores/cameraStore";
import VideoUpload from "@/components/VideoUpload/VideoUpload.vue";
import SceneViewer from "@/components/SceneViewer/SceneViewer.vue";

const store = useCameraStore();

onMounted(() => {
  store.setWebGPUSupported("gpu" in navigator);
});
</script>

<template>
  <div class="app-root">
    <!-- WebGPU not supported -->
    <div v-if="store.webGPUSupported === false" class="unsupported">
      <p class="unsupported__icon">⚠️</p>
      <h2>WebGPU 不支援</h2>
      <p>
        請使用 Chrome 113+ 以啟用 WebGPU。Firefox 需手動開啟 <code>dom.webgpu.enabled</code> flag。
      </p>
    </div>

    <!-- Main UI -->
    <template v-else>
      <header class="app-header">
        <span class="app-header__logo">📷 CamSim</span>

        <!-- Panel opacity slider (shown in ready state) -->
        <div v-if="store.appState === 'ready'" class="app-header__opacity" title="控制面板透明度">
          <span class="opacity-icon">◧</span>
          <input
            type="range"
            class="opacity-slider"
            min="0.1"
            max="1"
            step="0.05"
            v-model.number="store.panelOpacity"
          />
        </div>

        <span class="app-header__spacer" />

        <span v-if="store.appState === 'ready'" class="app-header__status ready">場景就緒</span>
        <span v-else-if="store.appState === 'reconstructing'" class="app-header__status loading">
          重建中…
        </span>
        <span v-else-if="store.appState === 'uploading'" class="app-header__status loading">
          上傳中…
        </span>
      </header>

      <main class="app-main">
        <VideoUpload v-if="store.appState !== 'ready'" />
        <SceneViewer v-else />
      </main>
    </template>
  </div>
</template>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.unsupported {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  text-align: center;
  padding: 2rem;
  color: var(--text-dim);
}
.unsupported__icon {
  font-size: 3rem;
}
.unsupported h2 {
  color: var(--text);
}
.unsupported code {
  background: var(--surface);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.app-header__logo {
  font-weight: 600;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}
.app-header__spacer {
  flex: 1;
}

.app-header__opacity {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.opacity-icon {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1;
  cursor: default;
}
.opacity-slider {
  width: 72px;
  accent-color: var(--accent);
  cursor: pointer;
  height: 4px;
}

.app-header__status {
  font-size: 12px;
  flex-shrink: 0;
}
.app-header__status.loading {
  color: var(--accent);
}
.app-header__status.ready {
  color: #6bcf7f;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
</style>
