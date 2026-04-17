<script setup lang="ts">
import { computed, watch, ref, nextTick } from "vue";

export interface DialStop {
  value: number;
  label: string;
}

const props = defineProps<{
  stops: DialStop[];
  modelValue: number;
  disabled?: boolean;
  /** Use log2 distance for nearest-stop matching (good for shutter/ISO) */
  logScale?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

const trackRef = ref<HTMLDivElement | null>(null);
const stopRefs = ref<HTMLButtonElement[]>([]);

// Find the index of the stop closest to modelValue
const activeIdx = computed(() => {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < props.stops.length; i++) {
    const dist = props.logScale
      ? Math.abs(Math.log2(props.stops[i].value + 1e-9) - Math.log2(props.modelValue + 1e-9))
      : Math.abs(props.stops[i].value - props.modelValue);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
});

// Scroll active stop into view whenever it changes
watch(
  activeIdx,
  (idx) => {
    nextTick(() => {
      stopRefs.value[idx]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });
  },
  { immediate: true },
);

function select(stop: DialStop) {
  if (!props.disabled) emit("update:modelValue", stop.value);
}
</script>

<template>
  <div class="dial-wheel" :class="{ 'dial-wheel--disabled': disabled }">
    <div class="dial-track" ref="trackRef">
      <button
        v-for="(stop, i) in stops"
        :key="stop.value"
        :ref="(el) => (stopRefs[i] = el as HTMLButtonElement)"
        class="dial-stop"
        :class="{ 'dial-stop--active': i === activeIdx }"
        :disabled="disabled"
        @click="select(stop)"
      >
        {{ stop.label }}
        <span v-if="i === activeIdx" class="dial-stop__tick" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.dial-wheel {
  width: 100%;
  position: relative;
}
.dial-wheel--disabled {
  opacity: 0.4;
  pointer-events: none;
}

.dial-track {
  display: flex;
  gap: 3px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  padding: 2px 0 6px;
}
.dial-track::-webkit-scrollbar {
  display: none;
}

.dial-stop {
  flex-shrink: 0;
  scroll-snap-align: center;
  width: 48px;
  padding: 5px 2px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--text-dim);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  cursor: pointer;
  position: relative;
  transition:
    border-color 0.1s,
    color 0.1s;
  text-align: center;
}
.dial-stop:hover:not(:disabled) {
  border-color: var(--accent-dim);
  color: var(--text);
}

.dial-stop--active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(255, 153, 51, 0.06);
}

.dial-stop__tick {
  display: block;
  width: 4px;
  height: 4px;
  background: var(--accent);
  border-radius: 50%;
  margin: 3px auto 0;
}
</style>
