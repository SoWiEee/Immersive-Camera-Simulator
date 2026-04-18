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

        <div v-if="store.appState === 'ready'" class="app-header__tabs">
          <button
            class="header-tab"
            :class="{ 'header-tab--active': !store.teachingMode }"
            @click="store.teachingMode = false"
          >
            拍攝
          </button>
          <button
            class="header-tab"
            :class="{ 'header-tab--active': store.teachingMode }"
            @click="store.teachingMode = true"
          >
            教學
          </button>
        </div>

        <div v-if="store.appState === 'ready'" class="app-header__tabs">
          <button
            class="header-tab"
            :class="{ 'header-tab--active': store.compareMode }"
            @click="store.compareMode = true"
          >
            ⊟ 對比
          </button>
          <button
            class="header-tab"
            :class="{ 'header-tab--active': !store.compareMode }"
            @click="store.compareMode = false"
          >
            ◻ 單畫面
          </button>
        </div>

        <span class="app-header__spacer" />

        <!-- Depth result info chips -->
        <div v-if="store.appState === 'ready' && store.depthResult" class="app-header__depth-info">
          <span class="depth-chip" title="景深推論耗時">{{ store.depthResult.inferenceMs }}ms</span>
          <span class="depth-chip" title="圖片尺寸"
            >{{ store.depthResult.width }}×{{ store.depthResult.height }}</span
          >
          <span class="depth-chip" title="估算焦距"
            >{{ store.depthResult.focalLengthPx.toFixed(0) }}px</span
          >
        </div>

        <!-- Panel opacity slider -->
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

        <span v-if="store.appState === 'loading'" class="app-header__status loading">
          推算景深中…
        </span>
        <span v-if="store.appState === 'ready'" class="app-header__status ready">模型就緒</span>
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
.app-header__tabs {
  display: flex;
  gap: 2px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px;
}
.header-tab {
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
  letter-spacing: 0.04em;
}
.header-tab--active {
  background: var(--surface);
  color: var(--accent);
}
.header-tab:hover:not(.header-tab--active) {
  color: var(--text);
}
.app-header__spacer {
  flex: 1;
}

/* Depth info chips */
.app-header__depth-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.depth-chip {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-family: monospace;
  color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  padding: 2px 7px;
  white-space: nowrap;
}

/* Opacity slider */
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
