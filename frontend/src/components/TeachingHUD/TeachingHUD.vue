<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useCameraStore } from "@/stores/cameraStore";

const store = useCameraStore();
const { sensor, lens, aperture, iso, shutterSpeed, focalLength, bokehScale, focusDepth } =
  storeToRefs(store);

// ---- Derived physics values ----

const cropFactor = computed(() => sensor.value.cropFactor);
const equivFocalLength = computed(() => focalLength.value * cropFactor.value);
const ffEquivAperture = computed(() => aperture.value * cropFactor.value);

const dofFeel = computed(() => {
  const ne = ffEquivAperture.value;
  if (ne < 2)
    return { label: "極淺景深", color: "#ff6b35", desc: "前景清晰、背景大量模糊，適合人像" };
  if (ne < 4) return { label: "淺景深", color: "#ffaa33", desc: "明顯背景虛化，主體突出" };
  if (ne < 8) return { label: "中景深", color: "#52c41a", desc: "主體清晰，背景稍微模糊" };
  return { label: "深景深", color: "#4a9eff", desc: "近乎全景對焦，適合風景攝影" };
});

const hyperfocalM = computed(() => {
  const f = focalLength.value;
  const N = aperture.value;
  const c = sensor.value.cocMm;
  return (f * f) / (N * c) / 1000;
});

// SNR approximation
const snrDb = computed(() => {
  const isoStops = Math.log2(iso.value / 100 + 1);
  const intensity = sensor.value.isoBaseNoise * isoStops * 1.8;
  if (intensity <= 0) return 99;
  return Math.round(20 * Math.log10(1 / intensity));
});

const noiseLevel = computed(() => {
  if (snrDb.value > 40) return { label: "低雜訊", color: "#52c41a" };
  if (snrDb.value > 28) return { label: "中等雜訊", color: "#ffaa33" };
  return { label: "高雜訊", color: "#ff6b35" };
});

const safeShutterS = computed(() => 1 / (focalLength.value * cropFactor.value));
const isShutterSafe = computed(() => shutterSpeed.value <= safeShutterS.value * 1.5);

function formatShutter(s: number): string {
  if (s >= 1) return `${s.toFixed(1)}s`;
  return `1/${Math.round(1 / s)}`;
}

const sensorSizeMm2 = computed(() => {
  const s = sensor.value;
  return (s.sensorWMm * s.sensorHMm).toFixed(0);
});
</script>

<template>
  <aside class="teaching-hud">
    <div class="hud-header">
      <span class="hud-title">參數教學</span>
      <span class="hud-subtitle">調整右側參數，即時看物理效果</span>
    </div>

    <div class="hud-cards">
      <!-- Sensor card -->
      <div class="hud-card">
        <div class="hud-card__head">
          <span class="hud-card__icon">⬛</span>
          <span class="hud-card__name">感光元件</span>
        </div>
        <div class="hud-card__value">{{ sensor.name }}</div>
        <div class="hud-card__stats">
          <span class="stat">
            <span class="stat__label">尺寸</span>
            <span class="stat__val"
              >{{ sensor.sensorWMm }}×{{ sensor.sensorHMm }}mm ({{ sensorSizeMm2 }}mm²)</span
            >
          </span>
          <span class="stat">
            <span class="stat__label">Crop Factor</span>
            <span class="stat__val accent">×{{ cropFactor }}</span>
          </span>
          <span class="stat">
            <span class="stat__label">CoC</span>
            <span class="stat__val">{{ sensor.cocMm }}mm</span>
          </span>
        </div>
        <p class="hud-card__note">
          感光元件越大，景深越淺、雜訊越低。手機感光元件面積僅為全幅的
          <strong>1/{{ ((36 * 24) / (sensor.sensorWMm * sensor.sensorHMm)).toFixed(0) }}</strong
          >。
        </p>
      </div>

      <!-- Focal length & DoF card -->
      <div class="hud-card">
        <div class="hud-card__head">
          <span class="hud-card__icon">🔭</span>
          <span class="hud-card__name">焦距 & 景深</span>
        </div>
        <div class="hud-card__value">
          {{ focalLength }}mm
          <span class="hud-card__value-sub">≡ {{ equivFocalLength.toFixed(0) }}mm (FF)</span>
        </div>
        <div class="hud-card__stats">
          <span class="stat">
            <span class="stat__label">景深感</span>
            <span class="stat__val" :style="{ color: dofFeel.color }">{{ dofFeel.label }}</span>
          </span>
          <span class="stat">
            <span class="stat__label">等效全幅光圈</span>
            <span class="stat__val accent">f/{{ ffEquivAperture.toFixed(1) }}</span>
          </span>
          <span class="stat">
            <span class="stat__label">超焦距</span>
            <span class="stat__val">{{ hyperfocalM.toFixed(0) }}m</span>
          </span>
        </div>
        <p class="hud-card__note">
          {{ dofFeel.desc }}。對焦超過超焦距後，無限遠至超焦距一半的範圍都清晰。
        </p>
      </div>

      <!-- Bokeh card -->
      <div class="hud-card">
        <div class="hud-card__head">
          <span class="hud-card__icon">◉</span>
          <span class="hud-card__name">散景 (Bokeh)</span>
        </div>
        <div class="hud-card__value">
          f/{{ aperture.toFixed(1) }}
          <span class="hud-card__value-sub">{{ lens.name }}</span>
        </div>
        <div class="hud-card__stats">
          <span class="stat">
            <span class="stat__label">模糊係數</span>
            <span class="stat__val accent">{{ bokehScale.toFixed(2) }} px/unit</span>
          </span>
          <span class="stat">
            <span class="stat__label">光圈葉片</span>
            <span class="stat__val">{{
              lens.bladeCount === 0 ? "圓形光圈" : `${lens.bladeCount} 葉`
            }}</span>
          </span>
          <span class="stat" v-if="lens.swirlStrength > 0">
            <span class="stat__label">旋轉散景</span>
            <span class="stat__val" style="color: #c47aff">Helios Swirl</span>
          </span>
        </div>
        <p class="hud-card__note">
          光圈越大（f 值越小），散景越明顯。葉片數影響光斑形狀：
          {{
            lens.bladeCount < 3
              ? "圓形光斑，最接近理想散景"
              : lens.bladeCount < 7
                ? `${lens.bladeCount} 邊形光斑`
                : "接近圓形的多邊形光斑"
          }}。
        </p>
      </div>

      <!-- ISO & Noise card -->
      <div class="hud-card">
        <div class="hud-card__head">
          <span class="hud-card__icon">📊</span>
          <span class="hud-card__name">ISO & 感光度</span>
        </div>
        <div class="hud-card__value">
          ISO {{ iso }}
          <span class="hud-card__value-sub" :style="{ color: noiseLevel.color }">{{
            noiseLevel.label
          }}</span>
        </div>
        <div class="hud-card__stats">
          <span class="stat">
            <span class="stat__label">訊雜比 (SNR)</span>
            <span class="stat__val" :style="{ color: noiseLevel.color }">{{ snrDb }} dB</span>
          </span>
          <span class="stat">
            <span class="stat__label">基礎雜訊係數</span>
            <span class="stat__val">{{ sensor.isoBaseNoise.toFixed(4) }}</span>
          </span>
        </div>
        <p class="hud-card__note">
          每提高 1 檔 ISO（加倍），SNR 降低約 3 dB，肉眼可見顆粒增加。
          大感光元件像素捕光面積大，基礎雜訊更低。
        </p>
      </div>

      <!-- Shutter card -->
      <div class="hud-card">
        <div class="hud-card__head">
          <span class="hud-card__icon">⏱</span>
          <span class="hud-card__name">快門速度</span>
        </div>
        <div class="hud-card__value">
          {{ formatShutter(shutterSpeed) }}
          <span
            class="hud-card__value-sub"
            :style="{ color: isShutterSafe ? '#52c41a' : '#ff6b35' }"
            >{{ isShutterSafe ? "安全" : "▲ 手震風險" }}</span
          >
        </div>
        <div class="hud-card__stats">
          <span class="stat">
            <span class="stat__label">安全快門下限</span>
            <span class="stat__val accent">1/{{ Math.round(focalLength * cropFactor) }}s</span>
          </span>
          <span class="stat">
            <span class="stat__label">對焦位置</span>
            <span class="stat__val">{{ (focusDepth * 100).toFixed(0) }}% 深度</span>
          </span>
        </div>
        <p class="hud-card__note">
          倒數法則：快門分母 ≥ 等效焦距（{{ equivFocalLength.toFixed(0) }}mm），才能避免手震。
          使用腳架可突破此限制。
        </p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.teaching-hud {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 420px;
  background: rgba(10, 10, 12, 0.94);
  backdrop-filter: blur(16px);
  border-left: 1px solid rgba(255, 255, 255, 0.09);
  display: flex;
  flex-direction: column;
  z-index: 20;
  overflow: hidden;
}

.hud-header {
  padding: 16px 20px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  flex-shrink: 0;
}
.hud-title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.hud-subtitle {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 3px;
  letter-spacing: 0.03em;
}

.hud-cards {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}

.hud-card {
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  padding: 14px 16px;
}

.hud-card__head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
}
.hud-card__icon {
  font-size: 15px;
  line-height: 1;
}
.hud-card__name {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}

.hud-card__value {
  font-size: 22px;
  font-weight: 700;
  font-family: monospace;
  color: #fff;
  line-height: 1.2;
  margin-bottom: 10px;
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.hud-card__value-sub {
  font-size: 13px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.45);
  font-family: sans-serif;
}

.hud-card__stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}
.stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}
.stat__label {
  color: rgba(255, 255, 255, 0.4);
}
.stat__val {
  color: rgba(255, 255, 255, 0.85);
  font-variant-numeric: tabular-nums;
  font-family: monospace;
  font-size: 13px;
}
.stat__val.accent {
  color: var(--accent);
}

.hud-card__note {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.42);
  line-height: 1.6;
  margin: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 10px;
}
.hud-card__note strong {
  color: rgba(255, 255, 255, 0.7);
}
</style>
