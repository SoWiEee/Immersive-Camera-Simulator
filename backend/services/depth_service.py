"""
Depth Pro inference service — singleton loaded once at startup.

Fallback: if depth_pro or torch is not installed, generates a luminance-based
pseudo depth map so the frontend pipeline can still be tested.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# Optional heavy imports
try:
    import torch
    import depth_pro

    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False
    logger.warning("torch / depth_pro not installed — using luminance fallback")

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
        if not _TORCH_AVAILABLE:
            logger.warning("Skipping model load — running in fallback mode")
            return

        if not CHECKPOINT_PATH.exists():
            logger.warning(
                "Depth Pro checkpoint not found at %s. "
                "Run: uv run python scripts/download_model.py",
                CHECKPOINT_PATH,
            )
            return

        try:
            import torch
            from depth_pro import create_model_and_transforms
            from depth_pro.depth_pro import DepthProConfig

            cls._device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info("Loading Depth Pro on %s …", cls._device)

            config = DepthProConfig(checkpoint_uri=str(CHECKPOINT_PATH))
            cls._model, cls._transform = create_model_and_transforms(config=config)
            cls._model.eval()
            cls._model = cls._model.to(cls._device)
            cls._model_loaded = True
            logger.info("Depth Pro loaded successfully")
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
                import torch
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
        else:
            return cls._luminance_fallback(pil_image, w, h)

    # ------------------------------------------------------------------ depth pro path

    @classmethod
    def _depth_pro_infer(cls, pil_image: Image.Image, w: int, h: int) -> dict:
        import torch

        img_np = np.array(pil_image).astype(np.float32) / 255.0
        img_tensor = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0)
        img_tensor = img_tensor.to(cls._device)

        with torch.no_grad():
            prediction = cls._model.infer(cls._transform(img_tensor))

        depth_m: np.ndarray = prediction["depth"].squeeze().cpu().numpy()
        focal_length_px: float = float(
            prediction.get("focallength_px", max(w, h) * 0.7)
        )

        depth_b64 = cls._depth_to_b64_png(depth_m)
        return {
            "depth_map_b64": depth_b64,
            "focal_length_px": focal_length_px,
            "width": w,
            "height": h,
        }

    # ------------------------------------------------------------------ fallback

    @classmethod
    def _luminance_fallback(cls, pil_image: Image.Image, w: int, h: int) -> dict:
        """
        Pseudo depth from luminance: bright = far, dark = near.
        Good enough to verify the frontend WebGPU pipeline.
        """
        gray = np.array(pil_image.convert("L")).astype(np.float32) / 255.0
        # Invert so foreground (typically darker) = closer
        depth_m = 1.0 - gray
        focal_length_px = max(w, h) * 0.7  # rough estimate

        depth_b64 = cls._depth_to_b64_png(depth_m)
        logger.info("Returned luminance fallback depth map (%dx%d)", w, h)
        return {
            "depth_map_b64": depth_b64,
            "focal_length_px": focal_length_px,
            "width": w,
            "height": h,
        }

    # ------------------------------------------------------------------ helpers

    @staticmethod
    def _depth_to_b64_png(depth_m: np.ndarray) -> str:
        """Normalize float depth → uint16, encode as 16-bit PNG, return base64."""
        d_min, d_max = float(depth_m.min()), float(depth_m.max())
        if d_max - d_min < 1e-6:
            normalized = np.zeros_like(depth_m, dtype=np.uint16)
        else:
            normalized = ((depth_m - d_min) / (d_max - d_min) * 65535).astype(np.uint16)

        pil_depth = Image.fromarray(normalized)
        buf = io.BytesIO()
        pil_depth.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()
