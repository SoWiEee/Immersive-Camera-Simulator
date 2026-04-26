/**
 * useEffects.ts — drives the WebGPU camera-effect pipeline over the GS3D canvas.
 *
 * Per RAF tick:
 *   1. read source canvas dimensions
 *   2. upload its frame to the pipeline's color texture
 *   3. write a uniform-depth texture (= camera→focus distance, see roadmap §3.2)
 *   4. dispatch shader chain → output canvas
 *
 * Input source and output canvas are owned by the caller; this composable just
 * wires them together. Lifecycle: call init() once, start() / stop() to toggle,
 * dispose() on unmount.
 */

import { ref, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { useCameraStore } from "@/stores/cameraStore";
import { CamSimPipeline, type CameraRenderParams } from "@/gpu/pipeline";

export function useEffects() {
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

  const isReady = ref(false);
  const error = ref<string | null>(null);

  let pipeline: CamSimPipeline | null = null;
  let source: HTMLCanvasElement | null = null;
  let rafId = 0;
  let running = false;

  async function init(outputCanvas: HTMLCanvasElement, sourceCanvas: HTMLCanvasElement) {
    try {
      pipeline = await CamSimPipeline.create(outputCanvas);
      source = sourceCanvas;
      isReady.value = true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  function start() {
    if (running || !pipeline || !source) return;
    running = true;
    tick();
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function dispose() {
    stop();
    pipeline?.destroy();
    pipeline = null;
    source = null;
    isReady.value = false;
  }

  function tick() {
    if (!running || !pipeline || !source) return;
    const w = source.width;
    const h = source.height;
    if (w > 0 && h > 0) {
      pipeline.uploadFrame(source, w, h);
      // Without per-pixel depth, every pixel sits at the focus plane → no DoF
      // separation, but exposure/noise/vignette/motion all still work as
      // designed. See roadmap §3.2 for the depth-buffer story.
      pipeline.setUniformDepth(focusDepth.value);
      pipeline.render(buildParams());
    }
    rafId = requestAnimationFrame(tick);
  }

  function buildParams(): CameraRenderParams {
    return {
      exposureEv: exposureDelta.value,
      contrast: contrast.value,
      saturation: saturation.value,
      colorTemp: colorTemp.value,
      iso: iso.value,
      noiseCoeff: sensor.value.isoBaseNoise,
      aperture: aperture.value,
      // Bokeh disabled in 3DGS mode (uniform depth → 0 radius). When real depth
      // lands, drop these overrides and use focusDepth / bokehScale directly.
      focusDepth: focusDepth.value,
      bokehScale: 0,
      motionAngle: motionAngle.value,
      motionStrength: motionStrength.value,
      vignetteStrength: vignetteStrength.value,
      bladeCount: lens.value.bladeCount,
      bladeRotation: lens.value.bladeRotation,
      swirlStrength: lens.value.swirlStrength,
      chromAberr: lens.value.chromAberrStrength,
    };
  }

  // Reference unused values to silence the type-checker without renaming them
  // when we wire real depth-aware bokeh in Phase 4.
  void bokehScale;

  onUnmounted(dispose);

  return { isReady, error, init, start, stop, dispose };
}
