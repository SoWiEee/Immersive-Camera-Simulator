/**
 * useCompare.ts — dual-pipeline state management for split-screen compare mode.
 *
 * Left pipeline: phone baseline (fixed params, only re-renders when focusDepth changes).
 * Right pipeline: user-controlled params (re-renders on every param change).
 *
 * Both pipelines share the same image + depth data uploaded independently.
 */

import { ref, onUnmounted } from "vue";
import { CamSimPipeline, type CameraRenderParams } from "@/gpu/pipeline";

// Phone baseline: fixed params matching a modern smartphone (iPhone-class)
// Small sensor + short focal length → near-infinite DoF
// Phone computational correction: lower vignette + chromAberr
function phoneParams(focusDepth: number): CameraRenderParams {
  return {
    exposureEv: 0,
    contrast: 1.1,
    saturation: 1.15,
    colorTemp: 0.05,
    iso: 200,
    noiseCoeff: 0.020, // phone sensor after computational NR (1/1.3" equivalent)
    aperture: 1.8,
    focusDepth,
    bokehScale: 0.11, // 5mm f/1.8 → ~0 px bokeh = near-infinite DoF
    motionAngle: 0,
    motionStrength: 0,
    vignetteStrength: 0.1, // phones apply computational vignette correction
    bladeCount: 0, // circular iris
    bladeRotation: 0,
    swirlStrength: 0,
    chromAberr: 0.03, // phones apply computational chromAberr correction
  };
}

export function useCompare() {
  const splitX = ref(0.5); // 0–1, position of the divider

  let leftPipeline: CamSimPipeline | null = null;
  let rightPipeline: CamSimPipeline | null = null;

  async function init(
    leftCanvas: HTMLCanvasElement,
    rightCanvas: HTMLCanvasElement,
  ): Promise<void> {
    leftPipeline = await CamSimPipeline.create(leftCanvas);
    rightPipeline = await CamSimPipeline.create(rightCanvas);
  }

  async function loadImageAndDepth(
    file: File,
    depthB64: string,
    focusDepth: number,
  ): Promise<void> {
    if (!leftPipeline || !rightPipeline) return;
    await Promise.all([
      (async () => {
        await leftPipeline!.loadImage(file);
        await leftPipeline!.loadDepthMap(depthB64);
        leftPipeline!.render(phoneParams(focusDepth));
      })(),
      (async () => {
        await rightPipeline!.loadImage(file);
        await rightPipeline!.loadDepthMap(depthB64);
      })(),
    ]);
  }

  function renderRight(params: CameraRenderParams): void {
    rightPipeline?.render(params);
  }

  // Re-render left pipeline only when focusDepth changes
  function renderLeft(focusDepth: number): void {
    leftPipeline?.render(phoneParams(focusDepth));
  }

  function pickFocusDepth(x: number, y: number): number | null {
    return rightPipeline?.sampleDepthAt(x, y) ?? null;
  }

  onUnmounted(() => {
    leftPipeline?.destroy();
    rightPipeline?.destroy();
    leftPipeline = null;
    rightPipeline = null;
  });

  return { splitX, init, loadImageAndDepth, renderRight, renderLeft, pickFocusDepth };
}
