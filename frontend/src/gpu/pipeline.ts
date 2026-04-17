/**
 * pipeline.ts
 * Central WebGPU device + pipeline manager for Phase 1.
 *
 * Responsibilities:
 *  - Device / adapter initialisation
 *  - Texture lifecycle (image, depth, work ping-pong)
 *  - Compute pipeline: two-pass separable Gaussian blur
 *  - Render pipeline: blit work texture → canvas
 */

import gaussianWGSL from './shaders/gaussian.wgsl?raw'
import blitWGSL from './shaders/blit.wgsl?raw'
import {
  uploadImageBitmap,
  uploadDepthMapB64,
  createWorkTextures,
} from './textureUtils'

// Uniform layout: radius (u32) + horizontal (u32) = 8 bytes → pad to 16
const UNIFORM_SIZE = 16

export class CamSimPipeline {
  private device: GPUDevice
  private context: GPUCanvasContext
  private canvasFormat: GPUTextureFormat

  // Textures
  private imageTexture: GPUTexture | null = null
  private depthTexture: GPUTexture | null = null
  private workTexA: GPUTexture | null = null // horizontal output
  private workTexB: GPUTexture | null = null // vertical output

  // Pipelines
  private gaussianPipeline!: GPUComputePipeline
  private blitPipeline!: GPURenderPipeline

  // Bind group layouts
  private gaussianBGL!: GPUBindGroupLayout
  private blitBGL!: GPUBindGroupLayout

  // Sampler
  private linearSampler!: GPUSampler

  // Uniforms
  private uniformBuffer!: GPUBuffer

  private width = 0
  private height = 0

  // ---------------------------------------------------------------- factory

  static async create(canvas: HTMLCanvasElement): Promise<CamSimPipeline> {
    if (!navigator.gpu) throw new Error('WebGPU not supported')

    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) throw new Error('No WebGPU adapter found')

    const device = await adapter.requestDevice()
    const context = canvas.getContext('webgpu')
    if (!context) throw new Error('Could not get WebGPU context from canvas')

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat()
    context.configure({ device, format: canvasFormat, alphaMode: 'opaque' })

    const inst = new CamSimPipeline(device, context, canvasFormat)
    inst.buildPipelines()
    return inst
  }

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    canvasFormat: GPUTextureFormat,
  ) {
    this.device = device
    this.context = context
    this.canvasFormat = canvasFormat
  }

  // ---------------------------------------------------------------- pipelines

  private buildPipelines(): void {
    const { device } = this

    // Uniform buffer (shared by both blur passes)
    this.uniformBuffer = device.createBuffer({
      size: UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    // Sampler
    this.linearSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    })

    // ---- Gaussian compute pipeline ----
    this.gaussianBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    })

    const gaussianModule = device.createShaderModule({ code: gaussianWGSL })
    this.gaussianPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.gaussianBGL] }),
      compute: { module: gaussianModule, entryPoint: 'main' },
    })

    // ---- Blit render pipeline ----
    this.blitBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    })

    const blitModule = device.createShaderModule({ code: blitWGSL })
    this.blitPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.blitBGL] }),
      vertex: { module: blitModule, entryPoint: 'vs_main' },
      fragment: {
        module: blitModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.canvasFormat }],
      },
      primitive: { topology: 'triangle-list' },
    })
  }

  // ---------------------------------------------------------------- load image

  async loadImage(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file)
    this.width = bitmap.width
    this.height = bitmap.height

    this.imageTexture?.destroy()
    this.imageTexture = uploadImageBitmap(this.device, bitmap)
    bitmap.close()

    this.recreateWorkTextures()
  }

  async loadDepthMap(b64: string): Promise<void> {
    this.depthTexture?.destroy()
    this.depthTexture = await uploadDepthMapB64(
      this.device,
      b64,
      this.width,
      this.height,
    )
  }

  private recreateWorkTextures(): void {
    this.workTexA?.destroy()
    this.workTexB?.destroy()
    ;[this.workTexA, this.workTexB] = createWorkTextures(
      this.device,
      this.width,
      this.height,
    )
  }

  // ---------------------------------------------------------------- render

  render(blurRadius: number): void {
    if (!this.imageTexture || !this.workTexA || !this.workTexB) return

    const { device } = this
    const encoder = device.createCommandEncoder()

    const wx = Math.ceil(this.width / 16)
    const wy = Math.ceil(this.height / 16)

    // Pass 0: horizontal blur — image → workTexA
    this.writeUniforms(blurRadius, 1)
    const bgH = this.makeGaussianBG(this.imageTexture, this.workTexA)
    const passH = encoder.beginComputePass()
    passH.setPipeline(this.gaussianPipeline)
    passH.setBindGroup(0, bgH)
    passH.dispatchWorkgroups(wx, wy)
    passH.end()

    // Pass 1: vertical blur — workTexA → workTexB
    this.writeUniforms(blurRadius, 0)
    const bgV = this.makeGaussianBG(this.workTexA, this.workTexB)
    const passV = encoder.beginComputePass()
    passV.setPipeline(this.gaussianPipeline)
    passV.setBindGroup(0, bgV)
    passV.dispatchWorkgroups(wx, wy)
    passV.end()

    // Blit workTexB → canvas
    const canvasTex = this.context.getCurrentTexture()
    const blitBG = device.createBindGroup({
      layout: this.blitBGL,
      entries: [
        { binding: 0, resource: this.workTexB.createView() },
        { binding: 1, resource: this.linearSampler },
      ],
    })
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: canvasTex.createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    })
    renderPass.setPipeline(this.blitPipeline)
    renderPass.setBindGroup(0, blitBG)
    renderPass.draw(6)
    renderPass.end()

    device.queue.submit([encoder.finish()])
  }

  // ---------------------------------------------------------------- helpers

  private writeUniforms(radius: number, horizontal: number): void {
    const data = new Uint32Array([Math.max(1, Math.min(radius, 64)), horizontal, 0, 0])
    this.device.queue.writeBuffer(this.uniformBuffer, 0, data)
  }

  private makeGaussianBG(input: GPUTexture, output: GPUTexture): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.gaussianBGL,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: output.createView() },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    })
  }

  // ---------------------------------------------------------------- cleanup

  destroy(): void {
    this.imageTexture?.destroy()
    this.depthTexture?.destroy()
    this.workTexA?.destroy()
    this.workTexB?.destroy()
    this.uniformBuffer?.destroy()
  }
}
