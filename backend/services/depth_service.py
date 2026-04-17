"""
Depth Pro inference service — singleton loaded once at startup.

Fallback: if depth_pro or torch is not installed, generates a luminance-based
pseudo depth map so the frontend pipeline can still be tested.
"""

from __future__ import annotations

import asyncio
import base64
import dataclasses
import io
import logging
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

try:
    import torch
    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False
    logger.warning("torch not installed — using luminance fallback")

try:
    from depth_pro import create_model_and_transforms
    from depth_pro.depth_pro import DEFAULT_MONODEPTH_CONFIG_DICT
    _DEPTH_PRO_AVAILABLE = True
except ImportError:
    _DEPTH_PRO_AVAILABLE = False
    logger.warning("depth_pro not installed — using luminance fallback")

CHECKPOINT_PATH = Path(__file__).parent.parent / "models" / "checkpoints" / "depth_pro.pt"


class DepthService:
    _model: Any = None
    _transform: Any = None
    _device: str = "cpu"
    _model_loaded: bool = False

    # ------------------------------------------------------------------ init

    @classmethod
    async def initialize(cls) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, cls._load_model)

    @classmethod
    def _load_model(cls) -> None:
        if not _TORCH_AVAILABLE or not _DEPTH_PRO_AVAILABLE:
            logger.warning("Skipping model load — running in luminance fallback mode")
            return

        if not CHECKPOINT_PATH.exists():
            logger.warning(
                "Depth Pro checkpoint not found at %s — running in luminance fallback mode. "
                "Run: uv run python scripts/download_model.py",
                CHECKPOINT_PATH,
            )
            return

        try:
            cls._device = "cuda" if torch.cuda.is_available() else "cpu"
            device = torch.device(cls._device)
            logger.info("Loading Depth Pro on %s …", cls._device)

            config = dataclasses.replace(
                DEFAULT_MONODEPTH_CONFIG_DICT,
                checkpoint_uri=str(CHECKPOINT_PATH),
            )
            cls._model, cls._transform = create_model_and_transforms(
                config=config,
                device=device,
            )
            cls._model.eval()
            cls._model_loaded = True
            logger.info("Depth Pro loaded successfully on %s", cls._device)
        except Exception:
            logger.exception("Failed to load Depth Pro — falling back to luminance mode")

    @classmethod
    def shutdown(cls) -> None:
        cls._model = None
        cls._model_loaded = False

    # ------------------------------------------------------------------ status

    @classmethod
    def status(cls) -> dict:
        vram_mb = 0
        if _TORCH_AVAILABLE and cls._device.startswith("cuda"):
            try:
                vram_mb = torch.cuda.memory_allocated() // (1024 * 1024)
            except Exception:
                pass
        return {
            "model_loaded": cls._model_loaded,
            "device": cls._device,
            "vram_used_mb": vram_mb,
        }

    # ------------------------------------------------------------------ infer

    @classmethod
    async def infer(cls, image_bytes: bytes) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, cls._run_inference, image_bytes)

    @classmethod
    def _run_inference(cls, image_bytes: bytes) -> dict:
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = pil_image.size

        if cls._model_loaded:
            return cls._depth_pro_infer(pil_image, w, h)
        return cls._luminance_fallback(pil_image, w, h)

    # ------------------------------------------------------------------ depth pro path

    @classmethod
    def _depth_pro_infer(cls, pil_image: Image.Image, w: int, h: int) -> dict:
        # depth_pro expects float32 numpy (H, W, 3) in [0, 1], same as load_rgb output
        img_np = np.array(pil_image, dtype=np.float32) / 255.0

        with torch.no_grad():
            transformed = cls._transform(img_np)
            prediction = cls._model.infer(transformed, f_px=None)

        depth_m: np.ndarray = prediction["depth"].squeeze().cpu().numpy()
        focal_px = prediction.get("focallength_px")
        focal_length_px = float(focal_px.item() if focal_px is not None else max(w, h) * 0.7)

        return {
            "depth_map_b64": cls._depth_to_b64_png(depth_m),
            "focal_length_px": focal_length_px,
            "width": w,
            "height": h,
        }

    # ------------------------------------------------------------------ luminance fallback

    @classmethod
    def _luminance_fallback(cls, pil_image: Image.Image, w: int, h: int) -> dict:
        gray = np.array(pil_image.convert("L"), dtype=np.float32) / 255.0
        depth_m = 1.0 - gray  # bright = far, dark = near
        logger.info("Returned luminance fallback depth map (%dx%d)", w, h)
        return {
            "depth_map_b64": cls._depth_to_b64_png(depth_m),
            "focal_length_px": max(w, h) * 0.7,
            "width": w,
            "height": h,
        }

    # ------------------------------------------------------------------ helpers

    @staticmethod
    def _depth_to_b64_png(depth_m: np.ndarray) -> str:
        d_min, d_max = float(depth_m.min()), float(depth_m.max())
        if d_max - d_min < 1e-6:
            normalized = np.zeros_like(depth_m, dtype=np.uint16)
        else:
            normalized = ((depth_m - d_min) / (d_max - d_min) * 65535).astype(np.uint16)
        buf = io.BytesIO()
        Image.fromarray(normalized).save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()
