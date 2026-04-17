/**
 * textureUtils.ts — helpers for uploading CPU-side image data to GPUTexture.
 */

/** Upload an ImageBitmap to a new rgba8unorm GPUTexture. */
export function uploadImageBitmap(device: GPUDevice, bitmap: ImageBitmap): GPUTexture {
  const texture = device.createTexture({
    size: [bitmap.width, bitmap.height],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture({ source: bitmap, flipY: false }, { texture }, [
    bitmap.width,
    bitmap.height,
  ]);
  return texture;
}

export interface DepthUploadResult {
  texture: GPUTexture;
  floats: Float32Array; // CPU copy for focus picking
}

/**
 * Decode a base64-encoded 16-bit PNG depth map and upload to GPU.
 *
 * Note: OffscreenCanvas only provides 8-bit per channel — the upper 8 bits
 * of each 16-bit sample are used (256 depth levels), which is sufficient for
 * perceptually accurate bokeh rendering.
 */
/**
 * Decode a base64-encoded 16-bit PNG depth map and upload to GPU.
 * The depth map is scaled to (targetW × targetH) so it always aligns with the
 * image texture, even if the backend processed a downscaled version.
 *
 * Note: OffscreenCanvas only provides 8-bit per channel — the upper 8 bits of
 * each 16-bit sample are used (256 depth levels), which is sufficient for
 * perceptually accurate bokeh rendering.
 */
export async function uploadDepthMapB64(
  device: GPUDevice,
  b64: string,
  targetW: number,
  targetH: number,
): Promise<DepthUploadResult> {
  const byteChars = atob(b64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);

  const blob = new Blob([byteArray], { type: "image/png" });
  const bitmap = await createImageBitmap(blob);

  // Draw into an OffscreenCanvas at the target size to bilinearly scale if needed
  const oc = new OffscreenCanvas(targetW, targetH);
  const ctx = oc.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const raw = ctx.getImageData(0, 0, targetW, targetH).data;
  const floats = new Float32Array(targetW * targetH);
  for (let i = 0; i < floats.length; i++) floats[i] = raw[i * 4] / 255.0;

  const texture = device.createTexture({
    size: [targetW, targetH],
    format: "r32float",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture }, floats, { bytesPerRow: targetW * 4 }, [targetW, targetH]);

  return { texture, floats };
}

/** Create a pair of rgba16float work textures for the shader ping-pong chain. */
export function createWorkTextures(
  device: GPUDevice,
  width: number,
  height: number,
): [GPUTexture, GPUTexture] {
  const desc: GPUTextureDescriptor = {
    size: [width, height],
    format: "rgba16float",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
  };
  return [device.createTexture(desc), device.createTexture(desc)];
}
