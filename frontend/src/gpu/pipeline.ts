/**
 * pipeline.ts — Phase 2 WebGPU shader chain
 *
 * Pass order: exposure → noise → bokeh → motionBlur → vignette → blit
 * Work textures ping-pong: image→[0]→[1]→[0]→[1]→[0]→canvas
 */

import exposureWGSL from "./shaders/exposure.wgsl?raw";
import noiseWGSL from "./shaders/noise.wgsl?raw";
import bokehWGSL from "./shaders/bokeh.wgsl?raw";
import motionBlurWGSL from "./shaders/motionBlur.wgsl?raw";
import vignetteWGSL from "./shaders/vignette.wgsl?raw";
import blitWGSL from "./shaders/blit.wgsl?raw";
import { uploadImageBitmap, uploadDepthMapB64, createWorkTextures } from "./textureUtils";

// 80-byte uniform: 12 × f32 | width u32 | height u32 | bladeCount u32 | blade_rotation f32 | swirl f32 | chromAberr f32 | 2 × u32 pad
const UNIFORM_BYTES = 80;

export interface CameraRenderParams {
  exposureEv: number; // EV delta from neutral
  contrast: number; // 0.5–2.0
  saturation: number; // 0.0–2.0
  colorTemp: number; // -1 cool … +1 warm
  iso: number; // 100–102400
  noiseCoeff: number; // sensor base noise sigma
  aperture: number; // f-number
  focusDepth: number; // normalized [0,1]
  bokehScale: number; // pixels per unit depth delta
  motionAngle: number; // radians
  motionStrength: number; // 0–1
  vignetteStrength: number; // 0–1
  // Lens params
  bladeCount: number; // aperture blade count (0 = circular)
  bladeRotation: number; // polygon rotation offset (radians)
  swirlStrength: number; // 0 = none, >0 = Helios swirl
  chromAberr: number; // per-lens chromatic aberration intensity (0–1)
}

export class CamSimPipeline {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private canvasFormat: GPUTextureFormat;

  // Textures
  private imageTexture: GPUTexture | null = null;
  private depthTexture: GPUTexture | null = null;
  private workTex: [GPUTexture | null, GPUTexture | null] = [null, null];

  // CPU-side depth data for focus picking
  private depthData: Float32Array | null = null;

  // Shared uniform buffer
  private uniformBuf!: GPUBuffer;

  // Bind group layouts
  private standardBGL!: GPUBindGroupLayout; // in, out, params
  private bokehBGL!: GPUBindGroupLayout; // in, depth, out, params
  private blitBGL!: GPUBindGroupLayout; // texture, sampler

  // Compute pipelines
  private exposurePipeline!: GPUComputePipeline;
  private noisePipeline!: GPUComputePipeline;
  private bokehPipeline!: GPUComputePipeline;
  private motionBlurPipeline!: GPUComputePipeline;
  private vignettePipeline!: GPUComputePipeline;

  // Render pipeline
  private blitPipeline!: GPURenderPipeline;
  private linearSampler!: GPUSampler;

  private width = 0;
  private height = 0;

  // ---------------------------------------------------------------- factory

  static async create(canvas: HTMLCanvasElement): Promise<CamSimPipeline> {
    if (!navigator.gpu) throw new Error("WebGPU not supported");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No WebGPU adapter found");
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context) throw new Error("Could not get WebGPU context");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format: canvasFormat, alphaMode: "opaque" });

    const inst = new CamSimPipeline(device, context, canvasFormat);
    inst.buildPipelines();
    return inst;
  }

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    canvasFormat: GPUTextureFormat,
  ) {
    this.device = device;
    this.context = context;
    this.canvasFormat = canvasFormat;
  }

  // ---------------------------------------------------------------- build

  private buildPipelines(): void {
    const { device } = this;

    this.uniformBuf = device.createBuffer({
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.linearSampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

    // Standard BGL: input (float), output (storage rgba16float), params uniform
    this.standardBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: "write-only", format: "rgba16float" },
        },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      ],
    });

    // Bokeh BGL: input, depth (unfilterable-float), output, params
    this.bokehBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "unfilterable-float" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: "write-only", format: "rgba16float" },
        },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      ],
    });

    // Blit BGL: texture + sampler
    this.blitBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });

    const stdLayout = device.createPipelineLayout({ bindGroupLayouts: [this.standardBGL] });
    const bokehLayout = device.createPipelineLayout({ bindGroupLayouts: [this.bokehBGL] });
    const blitLayout = device.createPipelineLayout({ bindGroupLayouts: [this.blitBGL] });

    const mkCompute = (code: string, layout: GPUPipelineLayout) =>
      device.createComputePipeline({
        layout,
        compute: { module: device.createShaderModule({ code }), entryPoint: "main" },
      });

    this.exposurePipeline = mkCompute(exposureWGSL, stdLayout);
    this.noisePipeline = mkCompute(noiseWGSL, stdLayout);
    this.bokehPipeline = mkCompute(bokehWGSL, bokehLayout);
    this.motionBlurPipeline = mkCompute(motionBlurWGSL, stdLayout);
    this.vignettePipeline = mkCompute(vignetteWGSL, stdLayout);

    const blitMod = device.createShaderModule({ code: blitWGSL });
    this.blitPipeline = device.createRenderPipeline({
      layout: blitLayout,
      vertex: { module: blitMod, entryPoint: "vs_main" },
      fragment: {
        module: blitMod,
        entryPoint: "fs_main",
        targets: [{ format: this.canvasFormat }],
      },
      primitive: { topology: "triangle-list" },
    });
  }

  // ---------------------------------------------------------------- load

  async loadImage(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    this.resize(bitmap.width, bitmap.height);

    this.imageTexture?.destroy();
    this.imageTexture = uploadImageBitmap(this.device, bitmap);
    bitmap.close();
    this.recreateWorkTextures();
  }

  async loadDepthMap(b64: string): Promise<void> {
    this.depthTexture?.destroy();
    const result = await uploadDepthMapB64(this.device, b64, this.width, this.height);
    this.depthTexture = result.texture;
    this.depthData = result.floats;
  }

  /**
   * Upload a per-frame source (e.g. Three.js / 3DGS WebGL canvas) into the
   * pipeline's color texture. Resizes work textures + canvas if dimensions
   * differ. Cheap path for the 3DGS effects overlay.
   */
  uploadFrame(source: HTMLCanvasElement | ImageBitmap, width: number, height: number): void {
    if (width !== this.width || height !== this.height || !this.imageTexture) {
      this.resize(width, height);
      this.imageTexture?.destroy();
      this.imageTexture = this.device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.recreateWorkTextures();
    }
    this.device.queue.copyExternalImageToTexture(
      { source, flipY: true }, // WebGL canvas is bottom-up
      { texture: this.imageTexture },
      [width, height],
    );
  }

  /**
   * Fill the depth texture with a single uniform value (units: matches the
   * shader's focus_depth). Used in 3DGS mode where per-pixel depth is
   * unavailable. Allocates the depth texture lazily on first call.
   */
  setUniformDepth(value: number): void {
    if (this.width === 0 || this.height === 0) return;
    const needsRealloc =
      !this.depthTexture || !this.depthData || this.depthData.length !== this.width * this.height;

    if (needsRealloc) {
      this.depthTexture?.destroy();
      this.depthTexture = this.device.createTexture({
        size: [this.width, this.height],
        format: "r32float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      this.depthData = new Float32Array(this.width * this.height);
    }

    this.depthData!.fill(value);
    this.device.queue.writeTexture(
      { texture: this.depthTexture! },
      this.depthData!.buffer,
      { bytesPerRow: this.width * 4 },
      [this.width, this.height],
    );
  }

  private resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const canvas = this.context.canvas as HTMLCanvasElement;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }

  /** Return the depth value [0,1] at canvas coordinates (x, y). */
  sampleDepthAt(x: number, y: number): number | null {
    if (!this.depthData || this.width === 0) return null;
    const px = Math.floor(Math.max(0, Math.min(x, this.width - 1)));
    const py = Math.floor(Math.max(0, Math.min(y, this.height - 1)));
    return this.depthData[py * this.width + px];
  }

  private recreateWorkTextures(): void {
    this.workTex[0]?.destroy();
    this.workTex[1]?.destroy();
    [this.workTex[0], this.workTex[1]] = createWorkTextures(this.device, this.width, this.height);
  }

  // ---------------------------------------------------------------- render

  render(params: CameraRenderParams): void {
    if (!this.imageTexture || !this.workTex[0] || !this.workTex[1] || !this.depthTexture) return;

    this.writeUniforms(params);
    const { device } = this;
    const encoder = device.createCommandEncoder();
    const wx = Math.ceil(this.width / 16);
    const wy = Math.ceil(this.height / 16);

    // Pass 1 — exposure: image → work[0]
    this.dispatchStandard(encoder, this.exposurePipeline, this.imageTexture, this.workTex[0]!);
    encoder.beginComputePass().end(); // noop; ensures barrier via pass boundary

    // Pass 2 — noise: work[0] → work[1]
    const noisePass = encoder.beginComputePass();
    noisePass.setPipeline(this.noisePipeline);
    noisePass.setBindGroup(0, this.makeStandardBG(this.workTex[0]!, this.workTex[1]!));
    noisePass.dispatchWorkgroups(wx, wy);
    noisePass.end();

    // Pass 3 — bokeh: work[1] + depth → work[0]
    const bokehPass = encoder.beginComputePass();
    bokehPass.setPipeline(this.bokehPipeline);
    bokehPass.setBindGroup(0, this.makeBokehBG(this.workTex[1]!, this.workTex[0]!));
    bokehPass.dispatchWorkgroups(wx, wy);
    bokehPass.end();

    // Pass 4 — motion blur: work[0] → work[1]
    const mbPass = encoder.beginComputePass();
    mbPass.setPipeline(this.motionBlurPipeline);
    mbPass.setBindGroup(0, this.makeStandardBG(this.workTex[0]!, this.workTex[1]!));
    mbPass.dispatchWorkgroups(wx, wy);
    mbPass.end();

    // Pass 5 — vignette: work[1] → work[0]
    const vigPass = encoder.beginComputePass();
    vigPass.setPipeline(this.vignettePipeline);
    vigPass.setBindGroup(0, this.makeStandardBG(this.workTex[1]!, this.workTex[0]!));
    vigPass.dispatchWorkgroups(wx, wy);
    vigPass.end();

    // Blit work[0] → canvas
    const canvasTex = this.context.getCurrentTexture();
    const blitBG = device.createBindGroup({
      layout: this.blitBGL,
      entries: [
        { binding: 0, resource: this.workTex[0]!.createView() },
        { binding: 1, resource: this.linearSampler },
      ],
    });
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvasTex.createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    renderPass.setPipeline(this.blitPipeline);
    renderPass.setBindGroup(0, blitBG);
    renderPass.draw(6);
    renderPass.end();

    device.queue.submit([encoder.finish()]);
  }

  // ---------------------------------------------------------------- helpers

  private dispatchStandard(
    encoder: GPUCommandEncoder,
    pipeline: GPUComputePipeline,
    input: GPUTexture,
    output: GPUTexture,
  ): void {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.makeStandardBG(input, output));
    pass.dispatchWorkgroups(Math.ceil(this.width / 16), Math.ceil(this.height / 16));
    pass.end();
  }

  private makeStandardBG(input: GPUTexture, output: GPUTexture): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.standardBGL,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: output.createView() },
        { binding: 2, resource: { buffer: this.uniformBuf } },
      ],
    });
  }

  private makeBokehBG(input: GPUTexture, output: GPUTexture): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.bokehBGL,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: this.depthTexture!.createView() },
        { binding: 2, resource: output.createView() },
        { binding: 3, resource: { buffer: this.uniformBuf } },
      ],
    });
  }

  private writeUniforms(p: CameraRenderParams): void {
    const buf = new ArrayBuffer(UNIFORM_BYTES);
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    // f32 params (offsets 0–44)
    f[0] = p.exposureEv;
    f[1] = p.contrast;
    f[2] = p.saturation;
    f[3] = p.colorTemp;
    f[4] = p.iso;
    f[5] = p.noiseCoeff;
    f[6] = p.aperture;
    f[7] = p.focusDepth;
    f[8] = p.bokehScale;
    f[9] = p.motionAngle;
    f[10] = p.motionStrength;
    f[11] = p.vignetteStrength;
    // u32 fields (offsets 48–56)
    u[12] = this.width;
    u[13] = this.height;
    u[14] = p.bladeCount;
    // f32 lens fields (offsets 60–68)
    f[15] = p.bladeRotation;
    f[16] = p.swirlStrength;
    f[17] = p.chromAberr;
    // u[18] and u[19] are zero padding
    this.device.queue.writeBuffer(this.uniformBuf, 0, buf);
  }

  // ---------------------------------------------------------------- cleanup

  destroy(): void {
    this.imageTexture?.destroy();
    this.depthTexture?.destroy();
    this.workTex[0]?.destroy();
    this.workTex[1]?.destroy();
    this.uniformBuf?.destroy();
  }
}
