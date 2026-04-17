<script setup lang="ts">
import { computed } from "vue";
import { LENSES, type LensProfile } from "@/data/lenses";

const props = defineProps<{
  modelValue: string; // selected lens id
}>();

const emit = defineEmits<{
  "update:modelValue": [id: string];
}>();

const activeLens = computed(() => LENSES.find((l) => l.id === props.modelValue) ?? LENSES[0]);

function select(lens: LensProfile) {
  emit("update:modelValue", lens.id);
}

// Generate SVG polygon path for aperture blade preview
function polygonPath(n: number, cx = 14, cy = 14, r = 11): string {
  if (n < 3) {
    // Circle for n=0 or n<3
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r} Z`;
  }
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i * (2 * Math.PI)) / n - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  });
  return `M ${pts.join(" L ")} Z`;
}

const bokehShapeLabel: Record<string, string> = {
  circle: "圓形",
  polygon: "多邊形",
  swirl: "旋轉",
};
</script>

<template>
  <div class="lens-list">
    <button
      v-for="lens in LENSES"
      :key="lens.id"
      class="lens-card"
      :class="{ 'lens-card--active': lens.id === modelValue }"
      @click="select(lens)"
    >
      <!-- Aperture polygon preview -->
      <svg class="lens-card__polygon" viewBox="0 0 28 28" width="28" height="28">
        <path
          :d="polygonPath(lens.bladeCount)"
          :fill="lens.id === modelValue ? 'rgba(255,153,51,0.15)' : 'rgba(255,255,255,0.04)'"
          :stroke="lens.id === modelValue ? 'var(--accent)' : 'var(--border)'"
          stroke-width="1.5"
        />
      </svg>

      <div class="lens-card__info">
        <span class="lens-card__brand">{{ lens.brand }}</span>
        <span class="lens-card__name">{{ lens.name }}</span>
        <div class="lens-card__tags">
          <span class="lens-tag">{{ lens.focalLength }}mm</span>
          <span class="lens-tag">f/{{ lens.maxAperture }}</span>
          <span class="lens-tag lens-tag--shape">{{ bokehShapeLabel[lens.bokehShape] }}</span>
        </div>
      </div>
    </button>

    <!-- Selected lens character note -->
    <p v-if="activeLens.characterNote" class="lens-note">
      {{ activeLens.characterNote }}
    </p>
  </div>
</template>

<style scoped>
.lens-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lens-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition:
    border-color 0.1s,
    background 0.1s;
}
.lens-card:hover {
  border-color: var(--accent-dim);
  background: rgba(255, 255, 255, 0.02);
}
.lens-card--active {
  border-color: var(--accent);
  background: rgba(255, 153, 51, 0.06);
}

.lens-card__polygon {
  flex-shrink: 0;
}

.lens-card__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lens-card__brand {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}

.lens-card__name {
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lens-card__tags {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}

.lens-tag {
  font-size: 9px;
  padding: 1px 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  color: var(--text-dim);
}
.lens-tag--shape {
  color: var(--accent);
  background: rgba(255, 153, 51, 0.1);
}

.lens-note {
  margin: 4px 0 0;
  font-size: 10px;
  color: var(--text-dim);
  line-height: 1.6;
  border-left: 2px solid var(--accent);
  padding-left: 8px;
}
</style>
