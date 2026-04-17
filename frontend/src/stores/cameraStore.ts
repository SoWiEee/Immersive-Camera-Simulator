import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { SENSORS, DEFAULT_SENSOR_ID } from "@/data/sensors";
import { LENSES, DEFAULT_LENS_ID } from "@/data/lenses";

export type AppState = "idle" | "loading" | "ready" | "error";
export type ShootingMode = "M" | "A" | "S" | "P";

export interface DepthResult {
  depthMapB64: string;
  focalLengthPx: number;
  width: number;
  height: number;
  inferenceMs: number;
}

// Default camera param values — used by resetCameraParams()
const DEFAULTS = {
  selectedSensorId: DEFAULT_SENSOR_ID,
  selectedLensId: DEFAULT_LENS_ID,
  shootingMode: "A" as ShootingMode,
  aperture: 2.8,
  shutterSpeed: 1 / 125,
  iso: 400,
  focalLength: 50,
  focusDepth: 0.4,
  contrast: 1.0,
  saturation: 1.0,
  colorTemp: 0.0,
  vignetteStrength: 0.4,
  motionAngle: 0.0,
  motionStrength: 0.0,
};

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
  const selectedSensorId = ref<string>(DEFAULTS.selectedSensorId);
  const sensor = computed(() => SENSORS.find((s) => s.id === selectedSensorId.value) ?? SENSORS[1]);

  // ---- Lens ----
  const selectedLensId = ref<string>(DEFAULTS.selectedLensId);
  const lens = computed(() => LENSES.find((l) => l.id === selectedLensId.value) ?? LENSES[0]);

  // When lens changes, sync focal length and clamp aperture to lens range
  watch(selectedLensId, () => {
    focalLength.value = lens.value.focalLength;
    aperture.value = Math.max(
      lens.value.maxAperture,
      Math.min(aperture.value, lens.value.minAperture),
    );
  });

  // ---- Shooting mode ----
  const shootingMode = ref<ShootingMode>(DEFAULTS.shootingMode);

  // ---- Exposure triangle ----
  const aperture = ref<number>(DEFAULTS.aperture); // f-number (1.0 – 22)
  const shutterSpeed = ref<number>(DEFAULTS.shutterSpeed); // seconds
  const iso = ref<number>(DEFAULTS.iso); // 100 – 102400
  const focalLength = ref<number>(DEFAULTS.focalLength); // mm

  // ---- Focus ----
  const focusDepth = ref<number>(DEFAULTS.focusDepth); // normalized depth [0, 1]

  // ---- Post-process controls ----
  const contrast = ref<number>(DEFAULTS.contrast); // 0.5 – 2.0
  const saturation = ref<number>(DEFAULTS.saturation); // 0.0 – 2.0
  const colorTemp = ref<number>(DEFAULTS.colorTemp); // -1 = cool, +1 = warm
  const vignetteStrength = ref<number>(DEFAULTS.vignetteStrength);
  const motionAngle = ref<number>(DEFAULTS.motionAngle); // radians
  const motionStrength = ref<number>(DEFAULTS.motionStrength); // 0 = off

  // ---- Derived ----
  const equivalentFocalLength = computed(() => focalLength.value * sensor.value.cropFactor);

  // EV₁₀₀ = log₂(N² / t)
  const ev100 = computed(() => Math.log2(aperture.value ** 2 / shutterSpeed.value));

  // EV adjusted for ISO
  const evAdjusted = computed(() => ev100.value + Math.log2(iso.value / 100));

  // Exposure delta from EV 13 (sunny outdoor baseline)
  const exposureDelta = computed(() => evAdjusted.value - 13);

  // bokeh scale: pixels of blur per unit of depth delta (capped at 64px in shader)
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

  // Reset all camera params to defaults while preserving image + depth result
  function resetCameraParams() {
    selectedSensorId.value = DEFAULTS.selectedSensorId;
    selectedLensId.value = DEFAULTS.selectedLensId;
    shootingMode.value = DEFAULTS.shootingMode;
    aperture.value = DEFAULTS.aperture;
    shutterSpeed.value = DEFAULTS.shutterSpeed;
    iso.value = DEFAULTS.iso;
    focalLength.value = DEFAULTS.focalLength;
    focusDepth.value = DEFAULTS.focusDepth;
    contrast.value = DEFAULTS.contrast;
    saturation.value = DEFAULTS.saturation;
    colorTemp.value = DEFAULTS.colorTemp;
    vignetteStrength.value = DEFAULTS.vignetteStrength;
    motionAngle.value = DEFAULTS.motionAngle;
    motionStrength.value = DEFAULTS.motionStrength;
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
    // Lens
    selectedLensId,
    lens,
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
    resetCameraParams,
  };
});
