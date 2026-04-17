/**
 * useImageFX.ts
 * Bridges cameraStore ↔ CamSimPipeline.
 * Owns the pipeline lifecycle and triggers re-render on param change.
 */

import { watch, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useCameraStore } from '@/stores/cameraStore'
import { CamSimPipeline } from '@/gpu/pipeline'

export function useImageFX(canvas: HTMLCanvasElement) {
  const store = useCameraStore()
  const { blurRadius } = storeToRefs(store)

  let pipeline: CamSimPipeline | null = null
  let rafId = 0
  let dirty = false

  function scheduleRender() {
    dirty = true
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      if (dirty && pipeline) {
        pipeline.render(blurRadius.value)
        dirty = false
      }
    })
  }

  async function init(): Promise<void> {
    pipeline = await CamSimPipeline.create(canvas)
  }

  async function loadImageAndDepth(file: File, depthB64: string): Promise<void> {
    if (!pipeline) return
    await pipeline.loadImage(file)
    await pipeline.loadDepthMap(depthB64)
    scheduleRender()
  }

  // Re-render whenever blur radius changes
  watch(blurRadius, scheduleRender)

  onUnmounted(() => {
    cancelAnimationFrame(rafId)
    pipeline?.destroy()
    pipeline = null
  })

  return { init, loadImageAndDepth, scheduleRender }
}
