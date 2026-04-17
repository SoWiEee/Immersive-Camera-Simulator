import { defineStore } from 'pinia'
import { ref } from 'vue'

export type AppState = 'idle' | 'loading' | 'ready' | 'error'

export interface DepthResult {
  depthMapB64: string
  focalLengthPx: number
  width: number
  height: number
  inferenceMs: number
}

export const useCameraStore = defineStore('camera', () => {
  // App lifecycle
  const appState = ref<AppState>('idle')
  const errorMessage = ref<string>('')

  // Uploaded image
  const imageFile = ref<File | null>(null)
  const imageUrl = ref<string>('')

  // Depth result
  const depthResult = ref<DepthResult | null>(null)

  // Camera parameters (Phase 1: only blur radius)
  const blurRadius = ref<number>(8)

  // WebGPU support
  const webGPUSupported = ref<boolean | null>(null)

  function setImage(file: File) {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageFile.value = file
    imageUrl.value = URL.createObjectURL(file)
  }

  function setDepthResult(result: DepthResult) {
    depthResult.value = result
  }

  function setAppState(state: AppState, message = '') {
    appState.value = state
    if (message) errorMessage.value = message
  }

  function setWebGPUSupported(supported: boolean) {
    webGPUSupported.value = supported
  }

  return {
    appState,
    errorMessage,
    imageFile,
    imageUrl,
    depthResult,
    blurRadius,
    webGPUSupported,
    setImage,
    setDepthResult,
    setAppState,
    setWebGPUSupported,
  }
})
