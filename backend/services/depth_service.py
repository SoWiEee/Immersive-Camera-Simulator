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

    # Depth Pro internally runs at 1536×1536; feeding larger images only inflates
    # VRAM for preprocessing without improving depth quality.
    MAX_INFER_DIM = 1536

    @classmethod
    def _run_inference(cls, image_bytes: bytes) -> dict:
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        orig_w, orig_h = pil_image.size

        # Downscale for inference if the image is larger than the model's native res
        scale = min(cls.MAX_INFER_DIM / max(orig_w, orig_h), 1.0)
        if scale < 1.0:
            infer_w = round(orig_w * scale)
            infer_h = round(orig_h * scale)
            infer_image = pil_image.resize((infer_w, infer_h), Image.LANCZOS)
            logger.info("Resized %dx%d → %dx%d for inference", orig_w, orig_h, infer_w, infer_h)
        else:
            infer_image = pil_image

        if cls._model_loaded:
            result = cls._depth_pro_infer(infer_image, orig_w, orig_h)
        else:
            result = cls._luminance_fallback(infer_image, orig_w, orig_h)

        return result

    # ------------------------------------------------------------------ depth pro path

    @classmethod
    def _depth_pro_infer(cls, pil_image: Image.Image, orig_w: int, orig_h: int) -> dict:
        infer_w, infer_h = pil_image.size
        img_np = np.array(pil_image, dtype=np.float32) / 255.0

        with torch.inference_mode():
            transformed = cls._transform(img_np)
            prediction = cls._model.infer(transformed, f_px=None)

        depth_m: np.ndarray = prediction["depth"].squeeze().cpu().numpy()

        # Release inference tensors immediately to free VRAM
        if _TORCH_AVAILABLE:
            torch.cuda.empty_cache()

        focal_px = prediction.get("focallength_px")
        # Scale focal length to original image coordinates
        focal_infer = float(focal_px.item() if focal_px is not None else max(infer_w, infer_h) * 0.7)
        scale_back = max(orig_w, orig_h) / max(infer_w, infer_h)
        focal_length_px = focal_infer * scale_back

        # Upsample depth map back to original resolution so it aligns with the image texture
        if (infer_w, infer_h) != (orig_w, orig_h):
            depth_pil = Image.fromarray(depth_m.astype(np.float32))
            depth_pil = depth_pil.resize((orig_w, orig_h), Image.BILINEAR)
            depth_m = np.array(depth_pil)

        return {
            "depth_map_b64": cls._depth_to_b64_png(depth_m),
            "focal_length_px": focal_length_px,
            "width": orig_w,
            "height": orig_h,
        }

    # ------------------------------------------------------------------ luminance fallback

    @classmethod
    def _luminance_fallback(cls, pil_image: Image.Image, orig_w: int, orig_h: int) -> dict:
        gray = np.array(pil_image.convert("L"), dtype=np.float32) / 255.0
        depth_m = 1.0 - gray  # bright = far, dark = near
        if (pil_image.width, pil_image.height) != (orig_w, orig_h):
            depth_pil = Image.fromarray(depth_m.astype(np.float32))
            depth_m = np.array(depth_pil.resize((orig_w, orig_h), Image.BILINEAR))
        logger.info("Returned luminance fallback depth map (%dx%d)", orig_w, orig_h)
        return {
            "depth_map_b64": cls._depth_to_b64_png(depth_m),
            "focal_length_px": max(orig_w, orig_h) * 0.7,
            "width": orig_w,
            "height": orig_h,
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
