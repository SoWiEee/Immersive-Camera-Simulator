"""
3D Gaussian Splatting training pipeline.

Loads a COLMAP TXT reconstruction, trains Gaussians with gsplat,
and exports a standard .ply file readable by GaussianSplats3D (three-gaussian-splats).

External requirement: `pip install gsplat torch` with CUDA 12.x.
"""

from __future__ import annotations

import asyncio
import io
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable

import numpy as np
from PIL import Image

ProgressCallback = Callable[[str, float], Awaitable[None]]

# SH degree-0 normalisation constant (same as used in the original 3DGS paper)
_C0 = 0.28209479177387814


# ── COLMAP data model ────────────────────────────────────────────────────────

@dataclass
class _Camera:
    camera_id: int
    fx: float
    fy: float
    cx: float
    cy: float
    width: int
    height: int


@dataclass
class _Frame:
    image_id: int
    camera_id: int
    name: str
    R: np.ndarray  # (3, 3) world-to-camera rotation
    T: np.ndarray  # (3,)   world-to-camera translation


@dataclass
class _ColmapData:
    cameras: dict[int, _Camera]
    frames: list[_Frame]
    points_xyz: np.ndarray  # (N, 3) float32
    points_rgb: np.ndarray  # (N, 3) uint8
    image_dir: Path


# ── COLMAP TXT parsers ───────────────────────────────────────────────────────

def _load_colmap(model_dir: Path, image_dir: Path) -> _ColmapData:
    cameras = _parse_cameras(model_dir / "cameras.txt")
    frames = _parse_images(model_dir / "images.txt")
    xyz, rgb = _parse_points3d(model_dir / "points3D.txt")
    return _ColmapData(cameras, frames, xyz, rgb, image_dir)


def _parse_cameras(path: Path) -> dict[int, _Camera]:
    cameras: dict[int, _Camera] = {}
    for line in path.read_text().splitlines():
        if line.startswith("#") or not line.strip():
            continue
        parts = line.split()
        cam_id = int(parts[0])
        model = parts[1]
        w, h = int(parts[2]), int(parts[3])
        p = list(map(float, parts[4:]))
        if model == "PINHOLE":
            fx, fy, cx, cy = p[0], p[1], p[2], p[3]
        elif model in ("SIMPLE_PINHOLE", "SIMPLE_RADIAL", "RADIAL"):
            fx = fy = p[0]
            cx, cy = p[1], p[2]
        else:
            # Conservative fallback for exotic models
            fx = fy = p[0]
            cx, cy = w / 2.0, h / 2.0
        cameras[cam_id] = _Camera(cam_id, fx, fy, cx, cy, w, h)
    return cameras


def _qvec_to_rotmat(qw: float, qx: float, qy: float, qz: float) -> np.ndarray:
    """COLMAP quaternion (w, x, y, z) → 3×3 rotation matrix."""
    return np.array([
        [1 - 2*qy**2 - 2*qz**2,  2*qx*qy - 2*qz*qw,  2*qx*qz + 2*qy*qw],
        [2*qx*qy + 2*qz*qw,      1 - 2*qx**2 - 2*qz**2, 2*qy*qz - 2*qx*qw],
        [2*qx*qz - 2*qy*qw,      2*qy*qz + 2*qx*qw,  1 - 2*qx**2 - 2*qy**2],
    ], dtype=np.float64)


def _parse_images(path: Path) -> list[_Frame]:
    """Parse images.txt — every odd line is a pose, every even line is 2D keypoints."""
    data_lines = [
        l for l in path.read_text().splitlines()
        if not l.startswith("#") and l.strip()
    ]
    frames: list[_Frame] = []
    for i in range(0, len(data_lines), 2):
        parts = data_lines[i].split()
        image_id = int(parts[0])
        qw, qx, qy, qz = map(float, parts[1:5])
        tx, ty, tz = map(float, parts[5:8])
        camera_id = int(parts[8])
        name = parts[9]
        frames.append(_Frame(
            image_id=image_id,
            camera_id=camera_id,
            name=name,
            R=_qvec_to_rotmat(qw, qx, qy, qz),
            T=np.array([tx, ty, tz], dtype=np.float64),
        ))
    return frames


def _parse_points3d(path: Path) -> tuple[np.ndarray, np.ndarray]:
    xyz_list: list[list[float]] = []
    rgb_list: list[list[int]] = []
    for line in path.read_text().splitlines():
        if line.startswith("#") or not line.strip():
            continue
        p = line.split()
        xyz_list.append([float(p[1]), float(p[2]), float(p[3])])
        rgb_list.append([int(p[4]), int(p[5]), int(p[6])])
    if not xyz_list:
        raise RuntimeError(
            "COLMAP produced no 3D points. "
            "The scene likely has too few matching features — "
            "try a video with richer textures and slower motion."
        )
    return (
        np.array(xyz_list, dtype=np.float32),
        np.array(rgb_list, dtype=np.uint8),
    )


# ── PLY export ───────────────────────────────────────────────────────────────

def _export_ply(
    means: "torch.Tensor",      # (N, 3)   Gaussian centres
    scales: "torch.Tensor",     # (N, 3)   log-scale
    quats: "torch.Tensor",      # (N, 4)   unnormalised quaternions
    opacities: "torch.Tensor",  # (N,)     pre-sigmoid logits
    sh0: "torch.Tensor",        # (N, 3)   degree-0 SH coefficients
    output_path: Path,
) -> None:
    """
    Write a standard Gaussian Splatting PLY compatible with GaussianSplats3D.

    Properties stored per vertex: xyz, normals (zeros), f_dc RGB, opacity,
    scale xyz, rotation wxyz.  Higher SH coefficients are omitted (degree 0 only).
    """
    import torch
    import torch.nn.functional as F

    n = means.shape[0]
    means_np    = means.detach().cpu().float().numpy()
    scales_np   = scales.detach().cpu().float().numpy()
    quats_np    = F.normalize(quats, dim=-1).detach().cpu().float().numpy()
    opa_np      = opacities.detach().cpu().float().numpy()
    sh0_np      = sh0.detach().cpu().float().numpy()  # already SH DC coefficients

    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {n}\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "property float nx\n"
        "property float ny\n"
        "property float nz\n"
        "property float f_dc_0\n"
        "property float f_dc_1\n"
        "property float f_dc_2\n"
        "property float opacity\n"
        "property float scale_0\n"
        "property float scale_1\n"
        "property float scale_2\n"
        "property float rot_0\n"
        "property float rot_1\n"
        "property float rot_2\n"
        "property float rot_3\n"
        "end_header\n"
    )

    buf = io.BytesIO()
    buf.write(header.encode())
    fmt = struct.Struct("<17f")
    for i in range(n):
        buf.write(fmt.pack(
            means_np[i, 0], means_np[i, 1], means_np[i, 2],   # position
            0.0, 0.0, 0.0,                                      # normals
            sh0_np[i, 0], sh0_np[i, 1], sh0_np[i, 2],          # f_dc RGB
            opa_np[i],                                           # opacity (pre-sigmoid)
            scales_np[i, 0], scales_np[i, 1], scales_np[i, 2], # log scale
            quats_np[i, 0], quats_np[i, 1], quats_np[i, 2], quats_np[i, 3],  # wxyz
        ))

    output_path.write_bytes(buf.getvalue())


# ── Training ─────────────────────────────────────────────────────────────────

async def train(
    colmap_dir: Path,
    image_dir: Path,
    output_path: Path,
    train_steps: int,
    on_progress: ProgressCallback,
) -> None:
    """
    Train a 3DGS model from a COLMAP reconstruction and export a PLY file.

    Offloads blocking GPU/CPU work to a thread executor and forwards progress
    updates back to the async caller via an asyncio.Queue.
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[tuple[str, float] | None] = asyncio.Queue()

    def sync_cb(stage: str, progress: float) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, (stage, progress))

    future = loop.run_in_executor(
        None, _train_sync, colmap_dir, image_dir, output_path, train_steps, sync_cb,
    )

    # Relay progress updates while training is running
    while not future.done():
        try:
            item = await asyncio.wait_for(queue.get(), timeout=0.5)
            await on_progress(*item)
        except asyncio.TimeoutError:
            pass

    # Drain any remaining messages before propagating exceptions
    while not queue.empty():
        await on_progress(*queue.get_nowait())

    await future  # Re-raise training exceptions in the async context


def _train_sync(
    colmap_dir: Path,
    image_dir: Path,
    output_path: Path,
    train_steps: int,
    on_progress: Callable[[str, float], None],
) -> None:
    """Blocking training loop — runs in a thread executor."""
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from gsplat import rasterization
    from gsplat.strategy import DefaultStrategy

    device = "cuda" if torch.cuda.is_available() else "cpu"

    on_progress("Loading COLMAP data", 0.0)
    data = _load_colmap(colmap_dir, image_dir)
    if not data.frames:
        raise RuntimeError("COLMAP reconstruction has no registered frames.")

    # ── Gaussian initialisation from sparse point cloud ──────────────────────
    N = len(data.points_xyz)

    # Positions from sparse 3D points
    means = torch.tensor(data.points_xyz, dtype=torch.float32, device=device)

    # Colour as degree-0 SH coefficients: f_dc = (rgb_01 - 0.5) / C0
    rgb_01 = data.points_rgb.astype(np.float32) / 255.0
    sh0 = torch.tensor((rgb_01 - 0.5) / _C0, dtype=torch.float32, device=device)

    # Scale: start small relative to average nearest-neighbour distance
    scene_extent = float(
        np.linalg.norm(data.points_xyz.max(axis=0) - data.points_xyz.min(axis=0))
    )
    log_init_scale = float(np.log(max(scene_extent / (N ** (1 / 3)), 1e-5)))
    scales = torch.full((N, 3), log_init_scale, dtype=torch.float32, device=device)

    # Identity quaternions (w=1, xyz=0)
    quats = torch.zeros(N, 4, dtype=torch.float32, device=device)
    quats[:, 0] = 1.0

    # Opacity logits: sigmoid⁻¹(0.1) ≈ -2.197
    opacities = torch.full((N,), -2.197, dtype=torch.float32, device=device)

    # Make all parameters trainable — separate nn.Parameter per group so that
    # DefaultStrategy can replace them individually during densification.
    params: dict[str, nn.Parameter] = {
        "means":     nn.Parameter(means),
        "scales":    nn.Parameter(scales),
        "quats":     nn.Parameter(quats),
        "opacities": nn.Parameter(opacities),
        "sh0":       nn.Parameter(sh0),
    }
    optimizers: dict[str, torch.optim.Optimizer] = {
        "means":     torch.optim.Adam([params["means"]],     lr=1.6e-4),
        "scales":    torch.optim.Adam([params["scales"]],    lr=5e-3),
        "quats":     torch.optim.Adam([params["quats"]],     lr=1e-3),
        "opacities": torch.optim.Adam([params["opacities"]], lr=5e-2),
        "sh0":       torch.optim.Adam([params["sh0"]],       lr=2.5e-3),
    }

    strategy = DefaultStrategy(verbose=False)
    state = strategy.initialize_state()

    # Pre-compute camera matrices (cheap; images lazy-loaded per step)
    cam_matrices = _build_cam_matrices(data, device)

    # ── Training loop ─────────────────────────────────────────────────────────
    report_every = max(1, train_steps // 100)
    on_progress("Starting 3DGS training", 0.0)

    for step in range(train_steps):
        idx = step % len(data.frames)
        frame = data.frames[idx]
        vm, K, H, W = cam_matrices[idx]

        # Zero gradients at the start of each step
        for opt in optimizers.values():
            opt.zero_grad(set_to_none=True)

        # Rasterise: colors are degree-0 SH → gsplat computes C0·sh0 + 0.5
        renders, _alphas, info = rasterization(
            means=params["means"],
            quats=F.normalize(params["quats"], dim=-1),
            scales=torch.exp(params["scales"]),
            opacities=torch.sigmoid(params["opacities"]),
            colors=params["sh0"].unsqueeze(1),  # (N, 1, 3) for sh_degree=0
            viewmats=vm.unsqueeze(0),
            Ks=K.unsqueeze(0),
            width=W,
            height=H,
            near_plane=0.01,
            far_plane=1000.0,
            sh_degree=0,
            absgrad=True,
        )

        gt = _load_frame(image_dir / frame.name, H, W, device)
        loss = F.l1_loss(renders[0], gt)

        strategy.step_pre_backward(params, optimizers, state, info, step)
        loss.backward()
        strategy.step_post_backward(
            params, optimizers, state, info, step,
            lr=optimizers["means"].param_groups[0]["lr"],
        )
        for opt in optimizers.values():
            opt.step()

        if step % report_every == 0:
            on_progress(f"Training 3DGS ({step}/{train_steps})", step / train_steps)

    on_progress("Exporting scene.ply", 0.99)
    _export_ply(
        params["means"],
        params["scales"],
        params["quats"],
        params["opacities"],
        params["sh0"],
        output_path,
    )
    on_progress("Done", 1.0)


# ── Helpers ───────────────────────────────────────────────────────────────────

@dataclass
class _CamMatrix:
    viewmat: "torch.Tensor"  # (4, 4) world-to-camera
    K: "torch.Tensor"        # (3, 3) intrinsics
    H: int
    W: int


def _build_cam_matrices(data: _ColmapData, device: str) -> list[tuple]:
    """Pre-compute (viewmat, K, H, W) tensors for every frame."""
    import torch

    result = []
    for frame in data.frames:
        cam = data.cameras[frame.camera_id]

        vm = np.eye(4, dtype=np.float32)
        vm[:3, :3] = frame.R.astype(np.float32)
        vm[:3, 3] = frame.T.astype(np.float32)

        K = np.array(
            [[cam.fx, 0.0, cam.cx],
             [0.0, cam.fy, cam.cy],
             [0.0, 0.0, 1.0]],
            dtype=np.float32,
        )
        result.append((
            torch.tensor(vm, device=device),
            torch.tensor(K, device=device),
            cam.height,
            cam.width,
        ))
    return result


def _load_frame(path: Path, H: int, W: int, device: str) -> "torch.Tensor":
    """Load a JPEG frame as an (H, W, 3) float32 tensor in [0, 1]."""
    import torch

    img = np.array(Image.open(path).convert("RGB").resize((W, H), Image.BILINEAR),
                   dtype=np.float32) / 255.0
    return torch.tensor(img, device=device)
