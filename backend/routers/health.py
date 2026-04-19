import shutil

from fastapi import APIRouter
from pydantic import BaseModel

from core.config import settings
from core.job_store import job_store
from services import colmap_service, video_service

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    cuda_available: bool
    device: str
    vram_total_mb: int
    vram_used_mb: int
    active_jobs: int
    colmap_available: bool
    ffmpeg_available: bool


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    cuda_available, device, vram_total, vram_used = _gpu_info()
    return HealthResponse(
        status="ok",
        cuda_available=cuda_available,
        device=device,
        vram_total_mb=vram_total,
        vram_used_mb=vram_used,
        active_jobs=job_store.active_count(),
        colmap_available=colmap_service.is_colmap_available(),
        ffmpeg_available=video_service.is_ffmpeg_available(),
    )


def _gpu_info() -> tuple[bool, str, int, int]:
    """Return (cuda_available, device_name, vram_total_mb, vram_used_mb)."""
    try:
        import torch

        if not torch.cuda.is_available():
            return False, "cpu", 0, 0

        props = torch.cuda.get_device_properties(0)
        total_mb = props.total_memory // (1024 * 1024)
        used_mb = torch.cuda.memory_allocated(0) // (1024 * 1024)
        return True, props.name, total_mb, used_mb

    except ImportError:
        return False, "cpu (torch not installed)", 0, 0
