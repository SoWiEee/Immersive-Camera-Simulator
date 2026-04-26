/**
 * 3DGS scene management composable.
 *
 * Wraps GaussianSplats3D.Viewer lifecycle, exposes Orbit / FPS control modes,
 * syncs the virtual camera pose into cameraStore each frame, and provides a
 * Three.js Raycaster-backed depth sampler for click-to-focus.
 */

import { ref, shallowRef } from "vue";
import * as THREE from "three";
import { useCameraStore } from "@/stores/cameraStore";

export type ControlMode = "orbit" | "fps";

interface GS3DViewer {
  camera: THREE.PerspectiveCamera;
  controls: { enabled: boolean } | null;
  renderer: THREE.WebGLRenderer;
  threeScene: THREE.Scene;
  splatMesh?: THREE.Object3D;
  addSplatScene(url: string, opts?: object): Promise<void>;
  start(): void;
  stop(): void;
  dispose(): void;
}

export function useScene() {
  const store = useCameraStore();

  const isLoading = ref(false);
  const isLoaded = ref(false);
  const loadProgress = ref(0);
  const error = ref<string | null>(null);
  const controlMode = ref<ControlMode>("orbit");
  const isFpsLocked = ref(false);

  // shallowRef: don't make Vue walk the Three.js graph
  const viewer = shallowRef<GS3DViewer | null>(null);
  let fps: FpsController | null = null;
  let poseRafId = 0;

  // Reused for click-to-focus to avoid per-call allocations
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // ── Public API ─────────────────────────────────────────────────────────────

  async function init(container: HTMLElement, splatUrl: string): Promise<void> {
    isLoading.value = true;
    isLoaded.value = false;
    error.value = null;
    loadProgress.value = 0;

    try {
      const GS3D = await import("@mkkellogg/gaussian-splats-3d");

      const v = new GS3D.Viewer({
        rootElement: container,
        selfDrivenMode: true,
        useBuiltInControls: true,
        gpuAcceleratedSort: true,
        sharedMemoryForWorkers: false,
      }) as unknown as GS3DViewer;

      await v.addSplatScene(splatUrl, {
        progressiveLoad: true,
        onProgress: (p: number) => {
          loadProgress.value = p;
        },
      });

      v.start();
      viewer.value = v;
      isLoaded.value = true;

      fps = new FpsController(v.camera, container, isFpsLocked);
      startPoseSync();
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
   * Get the WebGL canvas GS3D is rendering into. Used by useEffects to
   * source per-frame textures.
   */
  function getRenderCanvas(): HTMLCanvasElement | null {
    return viewer.value?.renderer.domElement ?? null;
  }

  /**
   * Cast a ray from a canvas-relative pixel into the splat scene and return
   * the distance (metres) from the camera to the first hit. Falls back to
   * the previous focusDepth (or 5m if unset) when nothing intersects.
   */
  function sampleDepthAtScreen(canvas: HTMLElement, clientX: number, clientY: number): number {
    const v = viewer.value;
    if (!v) return store.focusDepth;

    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, v.camera);

    if (v.splatMesh) {
      const hits = raycaster.intersectObject(v.splatMesh, true);
      if (hits.length > 0) return hits[0].distance;
    }

    // Fallback: intersect a virtual "focus plane" at the current focus
    // distance in front of the camera. Keeps the click meaningful even when
    // the splat raycast misses.
    const fallbackPlane = new THREE.Plane();
    const camForward = new THREE.Vector3();
    v.camera.getWorldDirection(camForward);
    const planePoint = v.camera.position.clone().add(camForward.multiplyScalar(store.focusDepth));
    fallbackPlane.setFromNormalAndCoplanarPoint(camForward.normalize(), planePoint);
    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(fallbackPlane, target)) {
      return target.distanceTo(v.camera.position);
    }
    return store.focusDepth;
  }

  function dispose(): void {
    stopPoseSync();
    fps?.dispose();
    fps = null;
    viewer.value?.dispose?.();
    viewer.value = null;
    isLoaded.value = false;
  }

  // ── Internal: sync Three.js camera pose → store ───────────────────────────

  function startPoseSync() {
    const tick = () => {
      const cam = viewer.value?.camera;
      if (cam) {
        store.setVirtualCameraPose(
          [cam.position.x, cam.position.y, cam.position.z],
          [cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w],
        );
      }
      poseRafId = requestAnimationFrame(tick);
    };
    poseRafId = requestAnimationFrame(tick);
  }

  function stopPoseSync() {
    if (poseRafId) cancelAnimationFrame(poseRafId);
    poseRafId = 0;
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
    getRenderCanvas,
    sampleDepthAtScreen,
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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
