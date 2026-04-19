/// <reference types="vite/client" />

declare module "*.wgsl" {
  const src: string;
  export default src;
}

declare module "@mkkellogg/gaussian-splats-3d" {
  export class Viewer {
    constructor(options: Record<string, unknown>);
    camera: import("three").PerspectiveCamera;
    controls: { enabled: boolean } | null;
    addSplatScene(url: string, opts?: Record<string, unknown>): Promise<void>;
    start(): void;
    stop(): void;
    dispose(): void;
  }
}
