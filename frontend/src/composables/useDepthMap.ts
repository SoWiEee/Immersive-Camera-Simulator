/**
 * useDepthMap.ts
 * Handles depth map fetching with IndexedDB caching.
 *
 * Cache key: SHA-256 hex of the image file content.
 * Cache value: { depthMapB64, focalLengthPx, width, height }
 */

import { ref } from 'vue'

const DB_NAME = 'camsim'
const STORE_NAME = 'depth-cache'
const DB_VERSION = 1

interface CachedDepth {
  depthMapB64: string
  focalLengthPx: number
  width: number
  height: number
}

interface ApiResponse {
  depth_map: string
  focal_length_px: number
  width: number
  height: number
  inference_ms: number
}

// ---------------------------------------------------------------- IndexedDB helpers

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function dbGet(db: IDBDatabase, key: string): Promise<CachedDepth | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result as CachedDepth | undefined)
    req.onerror = () => reject(req.error)
  })
}

function dbSet(db: IDBDatabase, key: string, value: CachedDepth): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ---------------------------------------------------------------- SHA-256

async function sha256hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ---------------------------------------------------------------- API call

async function fetchDepth(file: File): Promise<ApiResponse> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/depth', { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`POST /api/depth failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<ApiResponse>
}

// ---------------------------------------------------------------- composable

export function useDepthMap() {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const fromCache = ref(false)

  async function processImage(file: File): Promise<CachedDepth & { inferenceMs?: number }> {
    isLoading.value = true
    error.value = null
    fromCache.value = false

    try {
      const buffer = await file.arrayBuffer()
      const hash = await sha256hex(buffer)
      const db = await openDB()

      // Cache hit
      const cached = await dbGet(db, hash)
      if (cached) {
        fromCache.value = true
        return cached
      }

      // Cache miss — call backend
      const api = await fetchDepth(file)
      const result: CachedDepth = {
        depthMapB64: api.depth_map,
        focalLengthPx: api.focal_length_px,
        width: api.width,
        height: api.height,
      }
      await dbSet(db, hash, result)
      return { ...result, inferenceMs: api.inference_ms }
    } catch (e) {
      error.value = String(e)
      throw e
    } finally {
      isLoading.value = false
    }
  }

  return { processImage, isLoading, error, fromCache }
}
