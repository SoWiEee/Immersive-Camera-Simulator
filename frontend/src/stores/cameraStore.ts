import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { SENSORS, DEFAULT_SENSOR_ID } from "@/data/sensors";
import { LENSES, DEFAULT_LENS_ID } from "@/data/lenses";

export type AppState = "idle" | "uploading" | "reconstructing" | "ready" | "error";
export type ShootingMode = "M" | "A" | "S" | "P";

// Default camera param values — used by resetCameraParams()
const DEFAULTS = {
  selectedSensorId: DEFAULT_SENSOR_ID,
  selectedLensId: DEFAULT_LENS_ID,
  shootingMode: "A" as ShootingMode,
  aperture: 2.8,
  shutterSpeed: 1 / 125,
  iso: 400,
  focalLength: 50,
  focusDepth: 5.0, // metres (real world distance in 3D scene)
  contrast: 1.0,
  saturation: 1.0,
  colorTemp: 0.0,
  vignetteStrength: 0.4,
  motionAngle: 0.0,
  motionStrength: 0.0,
};

export const useCameraStore = defineStore("camera", () => {
  // ── App lifecycle ─────────────────────────────────────────────────────────
  const appState = ref<AppState>("idle");
  const errorMessage = ref<string>("");

  // ── 3DGS scene ────────────────────────────────────────────────────────────
  const jobId = ref<string | null>(null);
  const sceneUrl = ref<string | null>(null); // URL for GaussianSplats3D to load
  const reconstructionStage = ref<string>("");
  const reconstructionProgress = ref<number>(0);

  // ── WebGPU support ────────────────────────────────────────────────────────
  const webGPUSupported = ref<boolean | null>(null);

  // ── UI ────────────────────────────────────────────────────────────────────
  const compareMode = ref<boolean>(true);
  const teachingMode = ref<boolean>(false);
  const panelOpacity = ref<number>(0.88);
  const effectsEnabled = ref<boolean>(true); // overlay WebGPU camera effects on the 3DGS view

  // ── Virtual camera pose (synced from Three.js each frame) ─────────────────
  // Stored as plain tuples to keep Pinia reactivity cheap (no Three.js objects).
  const virtualCameraPos = ref<[number, number, number]>([0, 0, 0]);
  const virtualCameraQuat = ref<[number, number, number, number]>([0, 0, 0, 1]);

  // ── Sensor ────────────────────────────────────────────────────────────────
  const selectedSensorId = ref<string>(DEFAULTS.selectedSensorId);
  const sensor = computed(() => SENSORS.find((s) => s.id === selectedSensorId.value) ?? SENSORS[1]);

  // ── Lens ──────────────────────────────────────────────────────────────────
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

  // ── Shooting mode ─────────────────────────────────────────────────────────
  const shootingMode = ref<ShootingMode>(DEFAULTS.shootingMode);

  // ── Exposure triangle ─────────────────────────────────────────────────────
  const aperture = ref<number>(DEFAULTS.aperture); // f-number (1.0 – 22)
  const shutterSpeed = ref<number>(DEFAULTS.shutterSpeed); // seconds
  const iso = ref<number>(DEFAULTS.iso); // 100 – 102400
  const focalLength = ref<number>(DEFAULTS.focalLength); // mm

  // ── Focus ─────────────────────────────────────────────────────────────────
  const focusDepth = ref<number>(DEFAULTS.focusDepth); // metres (3D scene distance)

  // ── Post-process controls ─────────────────────────────────────────────────
  const contrast = ref<number>(DEFAULTS.contrast);
  const saturation = ref<number>(DEFAULTS.saturation);
  const colorTemp = ref<number>(DEFAULTS.colorTemp);
  const vignetteStrength = ref<number>(DEFAULTS.vignetteStrength);
  const motionAngle = ref<number>(DEFAULTS.motionAngle);
  const motionStrength = ref<number>(DEFAULTS.motionStrength);

  // ── Derived ───────────────────────────────────────────────────────────────
  const equivalentFocalLength = computed(() => focalLength.value * sensor.value.cropFactor);
  const ev100 = computed(() => Math.log2(aperture.value ** 2 / shutterSpeed.value));
  const evAdjusted = computed(() => ev100.value + Math.log2(iso.value / 100));
  const exposureDelta = computed(() => evAdjusted.value - 13);
  const bokehScale = computed(() => {
    const f = focalLength.value;
    const N = aperture.value;
    return ((f * f) / (N * 100)) * 0.8;
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  function setAppState(state: AppState, message = "") {
    appState.value = state;
    if (message) errorMessage.value = message;
  }

  function setWebGPUSupported(supported: boolean) {
    webGPUSupported.value = supported;
  }

  function setJobId(id: string | null) {
    jobId.value = id;
  }

  function setSceneUrl(url: string | null) {
    sceneUrl.value = url;
  }

  function setReconstructionProgress(stage: string, progress: number) {
    reconstructionStage.value = stage;
    reconstructionProgress.value = progress;
  }

  function setVirtualCameraPose(
    pos: [number, number, number],
    quat: [number, number, number, number],
  ) {
    virtualCameraPos.value = pos;
    virtualCameraQuat.value = quat;
  }

  function autoComputeExposure() {
    const targetEV = 13;
    if (shootingMode.value === "A") {
      const requiredEV100 = targetEV - Math.log2(iso.value / 100);
      shutterSpeed.value = aperture.value ** 2 / 2 ** requiredEV100;
    } else if (shootingMode.value === "S") {
      const requiredEV100 = targetEV - Math.log2(iso.value / 100);
      aperture.value = Math.sqrt(shutterSpeed.value * 2 ** requiredEV100);
    } else if (shootingMode.value === "P") {
      const requiredEV100 = targetEV - Math.log2(iso.value / 100);
      aperture.value = 2.8;
      shutterSpeed.value = aperture.value ** 2 / 2 ** requiredEV100;
    }
  }

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
    // App state
    appState,
    errorMessage,
    webGPUSupported,
    // Scene
    jobId,
    sceneUrl,
    reconstructionStage,
    reconstructionProgress,
    // UI
    compareMode,
    teachingMode,
    panelOpacity,
    effectsEnabled,
    // Virtual camera
    virtualCameraPos,
    virtualCameraQuat,
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
    setAppState,
    setWebGPUSupported,
    setJobId,
    setSceneUrl,
    setReconstructionProgress,
    setVirtualCameraPose,
    autoComputeExposure,
    resetCameraParams,
  };
});
