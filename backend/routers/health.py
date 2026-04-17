from fastapi import APIRouter
from pydantic import BaseModel

from services.depth_service import DepthService

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    device: str
    vram_used_mb: int


@router.get("/health", response_model=HealthResponse)
async def get_health():
    info = DepthService.status()
    return HealthResponse(
        status="ok",
        model_loaded=info["model_loaded"],
        device=info["device"],
        vram_used_mb=info["vram_used_mb"],
    )
