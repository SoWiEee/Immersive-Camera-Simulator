<script setup lang="ts">
/**
 * ApertureRing.vue — SVG aperture control dial.
 *
 * F-stops are spread over a 270° arc.  The rotating group brings the current
 * value to the 12 o'clock indicator.  Drag clockwise = stop down (larger f-number).
 */

import { ref, computed } from "vue";

const props = defineProps<{
  modelValue: number; // current f-number
  min: number; // lens maxAperture (smallest f-number, e.g. 1.4)
  max: number; // lens minAperture (largest f-number, e.g. 22)
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [v: number];
}>();

// Standard f-stops in 1/3-stop increments (subset shown on ring)
const ALL_STOPS = [
  1.0, 1.2, 1.4, 1.8, 2.0, 2.4, 2.8, 3.5, 4, 4.8, 5.6, 6.7, 8, 9.5, 11, 13, 16, 19, 22,
];
const FULL_STOPS = new Set([1.0, 1.4, 2.0, 2.8, 4, 5.6, 8, 11, 16, 22]);

const stops = computed(() =>
  ALL_STOPS.filter((f) => f >= props.min - 0.05 && f <= props.max + 0.05),
);

// ---- Geometry helpers ----
const CX = 64,
  CY = 64;
const ARC_SPAN = 270; // total degrees the range spans

function normalize(f: number): number {
  const lo = Math.log2(props.min);
  const hi = Math.log2(props.max);
  if (hi === lo) return 0.5;
  return (Math.log2(f) - lo) / (hi - lo);
}

// Angle from 12 o'clock (top), clockwise, in degrees
function stopAngleDeg(f: number): number {
  return (normalize(f) - 0.5) * ARC_SPAN;
}

// Convert "degrees from top, clockwise" to SVG (x, y) at radius r
function polar(angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180; // SVG: 0°=right, so offset by -90
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

// Ring rotation: negate current angle to bring current stop to top
const ringRotation = computed(() => -stopAngleDeg(props.modelValue));

// Pre-compute tick & label positions for each stop
const stopData = computed(() =>
  stops.value.map((f) => {
    const a = stopAngleDeg(f);
    const isFull = FULL_STOPS.has(f);
    const outerR = 55,
      innerR = isFull ? 47 : 51;
    const labelR = 41;
    return {
      f,
      isFull,
      tick: { p1: polar(a, innerR), p2: polar(a, outerR) },
      label: polar(a, labelR),
    };
  }),
);

// ---- Drag interaction ----
const svgRef = ref<SVGSVGElement | null>(null);
let isDragging = false;
let lastPointerAngle = 0; // degrees

function pointerAngleFromCenter(e: PointerEvent): number {
  if (!svgRef.value) return 0;
  const rect = svgRef.value.getBoundingClientRect();
  const scale = 128 / rect.width; // viewBox is 128×128
  const mx = (e.clientX - rect.left) * scale - CX;
  const my = (e.clientY - rect.top) * scale - CY;
  return (Math.atan2(my, mx) * 180) / Math.PI; // -180 to +180
}

function onPointerDown(e: PointerEvent) {
  if (props.disabled) return;
  isDragging = true;
  lastPointerAngle = pointerAngleFromCenter(e);
  svgRef.value?.setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging) return;
  const newAngle = pointerAngleFromCenter(e);
  let delta = newAngle - lastPointerAngle;
  // Handle wrap-around at ±180°
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  lastPointerAngle = newAngle;

  // Map angle delta → log2 f-number delta
  const rangeLo = Math.log2(props.min);
  const rangeHi = Math.log2(props.max);
  const deltaLog2 = (delta / ARC_SPAN) * (rangeHi - rangeLo);
  const newLog2 = Math.max(rangeLo, Math.min(rangeHi, Math.log2(props.modelValue) + deltaLog2));

  // Snap to nearest stop
  const nearest = stops.value.reduce((best, f) =>
    Math.abs(Math.log2(f) - newLog2) < Math.abs(Math.log2(best) - newLog2) ? f : best,
  );
  if (nearest !== props.modelValue) emit("update:modelValue", nearest);
}

function onPointerUp() {
  isDragging = false;
}
</script>

<template>
  <div class="aperture-ring-wrap" :class="{ 'aperture-ring-wrap--disabled': disabled }">
    <svg
      ref="svgRef"
      viewBox="0 0 128 128"
      class="aperture-ring"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
    >
      <!-- Outer decorative ring -->
      <circle :cx="CX" :cy="CY" r="60" fill="#111" stroke="#2a2a2a" stroke-width="2" />
      <circle :cx="CX" :cy="CY" r="58" fill="none" stroke="#333" stroke-width="1.5" />

      <!-- Rotating group: all marks + labels spin so current stop = top -->
      <g :transform="`rotate(${ringRotation}, ${CX}, ${CY})`" style="cursor: grab">
        <!-- Tick marks -->
        <line
          v-for="s in stopData"
          :key="`t-${s.f}`"
          :x1="s.tick.p1.x"
          :y1="s.tick.p1.y"
          :x2="s.tick.p2.x"
          :y2="s.tick.p2.y"
          :stroke="
            Math.abs(s.f - modelValue) < 0.05 ? 'var(--accent)' : s.isFull ? '#666' : '#3a3a3a'
          "
          :stroke-width="s.isFull ? 1.5 : 1"
        />
        <!-- Labels (full stops only) -->
        <text
          v-for="s in stopData.filter((s) => s.isFull)"
          :key="`l-${s.f}`"
          :x="s.label.x"
          :y="s.label.y"
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="7"
          font-family="monospace"
          :fill="Math.abs(s.f - modelValue) < 0.05 ? 'var(--accent)' : '#888'"
          :font-weight="Math.abs(s.f - modelValue) < 0.05 ? '700' : '400'"
        >
          {{ s.f }}
        </text>
      </g>

      <!-- Static indicator triangle at 12 o'clock -->
      <polygon
        :points="`${CX},${CY - 59} ${CX - 3.5},${CY - 53} ${CX + 3.5},${CY - 53}`"
        fill="var(--accent)"
      />

      <!-- Center aperture display (static, always upright) -->
      <circle :cx="CX" :cy="CY" r="26" fill="#0d0d0d" stroke="#222" stroke-width="1" />
      <text
        :x="CX"
        :y="CY - 5"
        text-anchor="middle"
        font-size="11"
        font-weight="700"
        font-family="monospace"
        fill="var(--accent)"
      >
        f/{{ modelValue.toFixed(1) }}
      </text>
      <text
        :x="CX"
        :y="CY + 8"
        text-anchor="middle"
        font-size="6"
        letter-spacing="1"
        fill="#555"
        font-family="sans-serif"
      >
        APERTURE
      </text>
    </svg>
  </div>
</template>

<style scoped>
.aperture-ring-wrap {
  display: flex;
  justify-content: center;
  padding: 4px 0;
}
.aperture-ring-wrap--disabled {
  opacity: 0.4;
  pointer-events: none;
}
.aperture-ring {
  width: 130px;
  height: 130px;
  touch-action: none;
  user-select: none;
}
</style>
