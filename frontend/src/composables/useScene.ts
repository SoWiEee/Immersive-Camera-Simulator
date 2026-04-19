/**
 * 3DGS scene management composable.
 *
 * Wraps GaussianSplats3D.Viewer lifecycle, exposes Orbit / FPS control modes,
 * and provides a depth-sampling stub (implemented in Phase 3).
 */

import { ref, shallowRef } from "vue";
import type * as THREE from "three";

export type ControlMode = "orbit" | "fps";

export function useScene() {
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const loadProgress = ref(0);
  const error = ref<string | null>(null);
  const controlMode = ref<ControlMode>("orbit");
  const isFpsLocked = ref(false);

  // Kept as shallowRef so Vue doesn't walk Three.js object graphs
  const viewer = shallowRef<GS3DViewer | null>(null);
  let fps: FpsController | null = null;

  // ── Public API ─────────────────────────────────────────────────────────────

  async function init(container: HTMLElement, splatUrl: string): Promise<void> {
    isLoading.value = true;
    isLoaded.value = false;
    error.value = null;
    loadProgress.value = 0;

    try {
      // Dynamic import so the large library is only fetched when needed
      const GS3D = await import("@mkkellogg/gaussian-splats-3d");

      const v = new GS3D.Viewer({
        rootElement: container,
        selfDrivenMode: true,
        useBuiltInControls: true,
        gpuAcceleratedSort: true,
        sharedMemoryForWorkers: false, // safer cross-origin default
      }) as GS3DViewer;

      await v.addSplatScene(splatUrl, {
        progressiveLoad: true,
        onProgress: (p: number) => {
          loadProgress.value = p;
        },
      });

      v.start();
      viewer.value = v;
      isLoaded.value = true;

      // Attach FPS controller now that we have a camera
      fps = new FpsController(v.camera as THREE.PerspectiveCamera, container, isFpsLocked);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      isLoading.value = false;
    }
  }

  function setControlMode(mode: ControlMode): void {
    controlMode.value = mode;
    const v = viewer.value;
    if (!v) return;

    if (mode === "orbit") {
      fps?.disable();
      if (v.controls) v.controls.enabled = true;
    } else {
      if (v.controls) v.controls.enabled = false;
      fps?.enable();
    }
  }

  /**
   * Sample scene depth at canvas pixel (x, y) in [0, 1] normalised coordinates.
   * Returns a depth in metres (approximate).
   * Full implementation deferred to Phase 3 (requires render-target readback).
   */
  function sampleDepth(_x: number, _y: number): number {
    return 5.0; // placeholder — Phase 3 will read from the depth buffer
  }

  function dispose(): void {
    fps?.dispose();
    fps = null;
    viewer.value?.dispose?.();
    viewer.value = null;
    isLoaded.value = false;
  }

  return {
    isLoading,
    isLoaded,
    loadProgress,
    error,
    controlMode,
    isFpsLocked,
    init,
    setControlMode,
    sampleDepth,
    dispose,
  };
}

// ── FPS Controller ────────────────────────────────────────────────────────────

class FpsController {
  private camera: THREE.PerspectiveCamera;
  private dom: HTMLElement;
  private isLockedRef: ReturnType<typeof ref<boolean>>;

  private yaw = 0;
  private pitch = 0;
  private keys = new Set<string>();
  private rafId = 0;
  private lastTime = 0;
  private enabled = false;

  private readonly SPEED = 2.5; // m/s
  private readonly SENSITIVITY = 0.0018;

  constructor(
    camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    isLockedRef: ReturnType<typeof ref<boolean>>,
  ) {
    this.camera = camera;
    this.dom = dom;
    this.isLockedRef = isLockedRef;
    // Sync initial euler from current camera rotation
    this.yaw = camera.rotation.y;
    this.pitch = camera.rotation.x;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.dom.addEventListener("click", this.requestLock);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("keydown", this.onKey);
    document.addEventListener("keyup", this.onKey);
    this.rafId = requestAnimationFrame(this.tick);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.dom.removeEventListener("click", this.requestLock);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("keydown", this.onKey);
    document.removeEventListener("keyup", this.onKey);
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
    cancelAnimationFrame(this.rafId);
    this.isLockedRef.value = false;
  }

  dispose(): void {
    this.disable();
  }

  // ── Private handlers ───────────────────────────────────────────────────────

  private requestLock = (): void => {
    this.dom.requestPointerLock();
  };

  private onLockChange = (): void => {
    const locked = document.pointerLockElement === this.dom;
    this.isLockedRef.value = locked;
    if (locked) {
      document.addEventListener("mousemove", this.onMouseMove);
    } else {
      document.removeEventListener("mousemove", this.onMouseMove);
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    this.yaw -= e.movementX * this.SENSITIVITY;
    this.pitch = clamp(
      this.pitch - e.movementY * this.SENSITIVITY,
      -Math.PI / 2.05,
      Math.PI / 2.05,
    );
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.type === "keydown") this.keys.add(e.code);
    else this.keys.delete(e.code);
  };

  private tick = (time: number): void => {
    this.rafId = requestAnimationFrame(this.tick);
    if (!this.isLockedRef.value) return;

    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    let dx = 0,
      dy = 0,
      dz = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) dz -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) dz += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) dx -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) dx += 1;
    if (this.keys.has("Space")) dy += 1;
    if (this.keys.has("ShiftLeft") || this.keys.has("ControlLeft")) dy -= 1;

    if (dx !== 0 || dy !== 0 || dz !== 0) {
      // Move in camera-local space (horizontal plane + vertical)
      const { sin, cos } = Math;
      const forward = { x: sin(this.yaw), z: cos(this.yaw) };
      const right = { x: cos(this.yaw), z: -sin(this.yaw) };
      const speed = this.SPEED * dt;

      this.camera.position.x += (dz * forward.x + dx * right.x) * speed;
      this.camera.position.z += (dz * forward.z + dx * right.z) * speed;
      this.camera.position.y += dy * speed;
    }
  };
}

// ── Type stubs for GaussianSplats3D ──────────────────────────────────────────

interface GS3DViewer {
  camera: unknown; // THREE.PerspectiveCamera
  controls: { enabled: boolean } | null;
  addSplatScene(url: string, opts?: object): Promise<void>;
  start(): void;
  stop(): void;
  dispose(): void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
