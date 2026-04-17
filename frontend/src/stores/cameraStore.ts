import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { SENSORS, DEFAULT_SENSOR_ID } from "@/data/sensors";

export type AppState = "idle" | "loading" | "ready" | "error";
export type ShootingMode = "M" | "A" | "S" | "P";

export interface DepthResult {
  depthMapB64: string;
  focalLengthPx: number;
  width: number;
  height: number;
  inferenceMs: number;
}

export const useCameraStore = defineStore("camera", () => {
  // App lifecycle
  const appState = ref<AppState>("idle");
  const errorMessage = ref<string>("");

  // Uploaded image
  const imageFile = ref<File | null>(null);
  const imageUrl = ref<string>("");

  // Depth result
  const depthResult = ref<DepthResult | null>(null);

  // WebGPU support
  const webGPUSupported = ref<boolean | null>(null);

  // ---- Sensor ----
  const selectedSensorId = ref<string>(DEFAULT_SENSOR_ID);
  const sensor = computed(() => SENSORS.find((s) => s.id === selectedSensorId.value) ?? SENSORS[1]);

  // ---- Shooting mode ----
  const shootingMode = ref<ShootingMode>("A");

  // ---- Exposure triangle ----
  const aperture = ref<number>(2.8); // f-number (1.4 – 22)
  const shutterSpeed = ref<number>(1 / 125); // seconds
  const iso = ref<number>(400); // 100 – 25600
  const focalLength = ref<number>(50); // mm

  // ---- Focus ----
  const focusDepth = ref<number>(0.4); // normalized depth [0, 1]

  // ---- Post-process controls ----
  const contrast = ref<number>(1.0); // 0.5 – 2.0
  const saturation = ref<number>(1.0); // 0.0 – 2.0
  const colorTemp = ref<number>(0.0); // -1 = cool, +1 = warm
  const vignetteStrength = ref<number>(0.4);
  const motionAngle = ref<number>(0.0); // radians
  const motionStrength = ref<number>(0.0); // 0 = off

  // ---- Derived ----
  const equivalentFocalLength = computed(() => focalLength.value * sensor.value.cropFactor);

  // EV₁₀₀ = log₂(N² / t)
  const ev100 = computed(() => Math.log2(aperture.value ** 2 / shutterSpeed.value));

  // EV adjusted for ISO
  const evAdjusted = computed(() => ev100.value + Math.log2(iso.value / 100));

  // Exposure delta from EV 13 (sunny outdoor baseline)
  const exposureDelta = computed(() => evAdjusted.value - 13);

  // bokeh scale: how many pixels of blur per unit of depth delta
  const bokehScale = computed(() => {
    const f = focalLength.value;
    const N = aperture.value;
    return ((f * f) / (N * 100)) * 0.8;
  });

  // ---- Actions ----
  function setImage(file: File) {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
    imageFile.value = file;
    imageUrl.value = URL.createObjectURL(file);
  }

  function setDepthResult(result: DepthResult) {
    depthResult.value = result;
  }

  function setAppState(state: AppState, message = "") {
    appState.value = state;
    if (message) errorMessage.value = message;
  }

  function setWebGPUSupported(supported: boolean) {
    webGPUSupported.value = supported;
  }

  // Auto-compute the "missing" param to hit EV 13 in each mode
  function autoComputeExposure() {
    const targetEV = 13;
    if (shootingMode.value === "A") {
      // Aperture priority: fix aperture + ISO, compute shutter
      const requiredEV100 = targetEV - Math.log2(iso.value / 100);
      shutterSpeed.value = aperture.value ** 2 / 2 ** requiredEV100;
    } else if (shootingMode.value === "S") {
      // Shutter priority: fix shutter + ISO, compute aperture
      const requiredEV100 = targetEV - Math.log2(iso.value / 100);
      aperture.value = Math.sqrt(shutterSpeed.value * 2 ** requiredEV100);
    } else if (shootingMode.value === "P") {
      // Program: auto both aperture and shutter at ISO
      const requiredEV100 = targetEV - Math.log2(iso.value / 100);
      aperture.value = 2.8;
      shutterSpeed.value = aperture.value ** 2 / 2 ** requiredEV100;
    }
  }

  return {
    // State
    appState,
    errorMessage,
    imageFile,
    imageUrl,
    depthResult,
    webGPUSupported,
    // Sensor
    selectedSensorId,
    sensor,
    // Mode
    shootingMode,
    // Exposure triangle
    aperture,
    shutterSpeed,
    iso,
    focalLength,
    // Focus
    focusDepth,
    // Post-process
    contrast,
    saturation,
    colorTemp,
    vignetteStrength,
    motionAngle,
    motionStrength,
    // Derived
    equivalentFocalLength,
    ev100,
    evAdjusted,
    exposureDelta,
    bokehScale,
    // Actions
    setImage,
    setDepthResult,
    setAppState,
    setWebGPUSupported,
    autoComputeExposure,
  };
});
