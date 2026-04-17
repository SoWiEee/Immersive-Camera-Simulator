import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useCameraStore } from "@/stores/cameraStore";

export function useSensor() {
  const store = useCameraStore();
  const { sensor, focalLength, aperture } = storeToRefs(store);

  // Hyperfocal distance (mm): H = f² / (N × c)
  const hyperfocalMm = computed(() => {
    const f = focalLength.value;
    const N = aperture.value;
    const c = sensor.value.cocMm;
    return (f * f) / (N * c);
  });

  // Near/far depth of field boundaries (mm) at a given subject distance
  function dofRange(subjectDistMm: number): { nearMm: number; farMm: number } {
    const H = hyperfocalMm.value;
    const f = focalLength.value;
    const denom = H + subjectDistMm - 2 * f;
    if (denom <= 0) return { nearMm: 0, farMm: Infinity };
    const near = (subjectDistMm * (H - f)) / denom;
    const farDenom = H - subjectDistMm;
    const far = farDenom <= 0 ? Infinity : (subjectDistMm * (H - f)) / farDenom;
    return { nearMm: near, farMm: far };
  }

  return { hyperfocalMm, dofRange };
}
