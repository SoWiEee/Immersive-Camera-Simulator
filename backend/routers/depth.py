import time

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from services.depth_service import DepthService

router = APIRouter()

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


class DepthResponse(BaseModel):
    depth_map: str          # base64-encoded 16-bit PNG
    focal_length_px: float
    width: int
    height: int
    inference_ms: int


@router.post("/depth", response_model=DepthResponse)
async def post_depth(file: UploadFile):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(415, f"Unsupported media type: {file.content_type}")

    data = await file.read()
    if len(data) > MAX_SIZE_BYTES:
        raise HTTPException(413, "File exceeds 20 MB limit")

    t0 = time.perf_counter()
    result = await DepthService.infer(data)
    inference_ms = int((time.perf_counter() - t0) * 1000)

    return DepthResponse(
        depth_map=result["depth_map_b64"],
        focal_length_px=result["focal_length_px"],
        width=result["width"],
        height=result["height"],
        inference_ms=inference_ms,
    )
