<script setup lang="ts">
import { onMounted } from "vue";
import { useCameraStore } from "@/stores/cameraStore";
import UploadZone from "@/components/UploadZone/UploadZone.vue";
import Viewfinder from "@/components/Viewfinder/Viewfinder.vue";

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
        <span v-if="store.appState === 'loading'" class="app-header__status loading">
          推算景深中…
        </span>
        <span v-if="store.appState === 'ready'" class="app-header__status ready"> 模型就緒 </span>
      </header>

      <main class="app-main">
        <UploadZone v-if="store.appState === 'idle' || store.appState === 'error'" />
        <Viewfinder v-else-if="store.appState === 'loading' || store.appState === 'ready'" />

        <div v-if="store.appState === 'error'" class="error-banner">
          {{ store.errorMessage }}
        </div>
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
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.app-header__logo {
  font-weight: 600;
  letter-spacing: 0.05em;
}
.app-header__status {
  font-size: 12px;
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

.error-banner {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--danger);
  color: #fff;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
}
</style>
