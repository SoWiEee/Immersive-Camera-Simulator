/**
 * textureUtils.ts
 * Helpers for uploading CPU-side image data to GPUTexture.
 */

/** Upload an ImageBitmap to a new rgba8unorm GPUTexture. */
export function uploadImageBitmap(
  device: GPUDevice,
  bitmap: ImageBitmap,
): GPUTexture {
  const texture = device.createTexture({
    size: [bitmap.width, bitmap.height],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  })
  device.queue.copyExternalImageToTexture(
    { source: bitmap, flipY: false },
    { texture },
    [bitmap.width, bitmap.height],
  )
  return texture
}

/**
 * Decode a base64-encoded 16-bit PNG depth map.
 *
 * Phase 1: uses OffscreenCanvas — loses 16-bit precision (8-bit effective).
 * The R channel of the decoded RGBA image is used as the depth value.
 * Returns a r32float GPUTexture with values normalised to [0, 1].
 *
 * Phase 2 will replace this with a proper 16-bit PNG decoder.
 */
export async function uploadDepthMapB64(
  device: GPUDevice,
  b64: string,
  width: number,
  height: number,
): Promise<GPUTexture> {
  // Decode base64 → Blob → ImageBitmap
  const byteChars = atob(b64)
  const byteArray = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i)
  }
  const blob = new Blob([byteArray], { type: 'image/png' })
  const bitmap = await createImageBitmap(blob)

  // Draw to OffscreenCanvas to read RGBA pixels
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)

  // Extract R channel → normalised float32
  const pixels = imageData.data // Uint8ClampedArray, RGBA
  const floats = new Float32Array(bitmap.width * bitmap.height)
  for (let i = 0; i < floats.length; i++) {
    floats[i] = pixels[i * 4] / 255.0 // R channel
  }

  const texture = device.createTexture({
    size: [bitmap.width, bitmap.height],
    format: 'r32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  })
  device.queue.writeTexture(
    { texture },
    floats,
    { bytesPerRow: bitmap.width * 4 },
    [bitmap.width, bitmap.height],
  )
  return texture
}

/** Create a pair of rgba16float work textures for ping-pong blur. */
export function createWorkTextures(
  device: GPUDevice,
  width: number,
  height: number,
): [GPUTexture, GPUTexture] {
  const desc: GPUTextureDescriptor = {
    size: [width, height],
    format: 'rgba16float',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.STORAGE_BINDING,
  }
  return [device.createTexture(desc), device.createTexture(desc)]
}
