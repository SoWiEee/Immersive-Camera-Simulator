/**
 * useImageFX.ts — bridges cameraStore ↔ CamSimPipeline.
 * Owns pipeline lifecycle and re-renders whenever any camera param changes.
 */

import { watch, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { useCameraStore } from "@/stores/cameraStore";
import { CamSimPipeline, type CameraRenderParams } from "@/gpu/pipeline";

export function useImageFX(canvas: HTMLCanvasElement) {
  const store = useCameraStore();
  const {
    exposureDelta,
    contrast,
    saturation,
    colorTemp,
    iso,
    sensor,
    lens,
    aperture,
    focusDepth,
    bokehScale,
    motionAngle,
    motionStrength,
    vignetteStrength,
  } = storeToRefs(store);

  let pipeline: CamSimPipeline | null = null;
  let rafId = 0;
  let dirty = false;

  function buildParams(): CameraRenderParams {
    return {
      exposureEv: exposureDelta.value,
      contrast: contrast.value,
      saturation: saturation.value,
      colorTemp: colorTemp.value,
      iso: iso.value,
      noiseCoeff: sensor.value.isoBaseNoise,
      aperture: aperture.value,
      focusDepth: focusDepth.value,
      bokehScale: bokehScale.value,
      motionAngle: motionAngle.value,
      motionStrength: motionStrength.value,
      vignetteStrength: vignetteStrength.value,
      // Lens-specific
      bladeCount: lens.value.bladeCount,
      bladeRotation: lens.value.bladeRotation,
      swirlStrength: lens.value.swirlStrength,
      chromAberr: lens.value.chromAberrStrength,
    };
  }

  function scheduleRender() {
    dirty = true;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (dirty && pipeline) {
        pipeline.render(buildParams());
        dirty = false;
      }
    });
  }

  async function init(): Promise<void> {
    pipeline = await CamSimPipeline.create(canvas);
  }

  async function loadImageAndDepth(file: File, depthB64: string): Promise<void> {
    if (!pipeline) return;
    await pipeline.loadImage(file);
    await pipeline.loadDepthMap(depthB64);
    scheduleRender();
  }

  /**
   * Pick the depth value at a canvas-relative pixel (x, y).
   * Returns null if depth data isn't loaded yet.
   */
  function pickFocusDepth(x: number, y: number): number | null {
    return pipeline?.sampleDepthAt(x, y) ?? null;
  }

  // Watch all reactive params — any change triggers re-render
  const watchTargets = [
    exposureDelta,
    contrast,
    saturation,
    colorTemp,
    iso,
    sensor,
    lens,
    aperture,
    focusDepth,
    bokehScale,
    motionAngle,
    motionStrength,
    vignetteStrength,
  ];
  watch(watchTargets, scheduleRender);

  onUnmounted(() => {
    cancelAnimationFrame(rafId);
    pipeline?.destroy();
    pipeline = null;
  });

  return { init, loadImageAndDepth, scheduleRender, pickFocusDepth };
}
