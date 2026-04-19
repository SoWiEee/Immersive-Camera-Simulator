import asyncio
import hashlib
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from core.config import settings
from core.job_store import JobStatus, Job, job_store
from services import pipeline

router = APIRouter()

_MAX_BYTES = settings.max_video_size_mb * 1024 * 1024
_ALLOWED_MIME = {"video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"}


# ── Response schemas ──────────────────────────────────────────────────────────

class ReconstructResponse(BaseModel):
    job_id: str
    cached: bool
    message: str


class StatusResponse(BaseModel):
    job_id: str
    status: str
    stage: str
    progress: float
    elapsed_s: float
    error: str | None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/reconstruct", response_model=ReconstructResponse, status_code=202)
async def start_reconstruction(file: UploadFile) -> ReconstructResponse:
    """
    Accept a video upload and start a 3DGS reconstruction job.

    Returns immediately with a job_id.  Poll GET /api/reconstruct/{job_id}
    for progress, then download the result via GET /api/reconstruct/{job_id}/result.
    """
    if file.content_type not in _ALLOWED_MIME:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type '{file.content_type}'. "
                   f"Upload MP4, MOV, WebM or AVI.",
        )

    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {settings.max_video_size_mb} MB limit.",
        )

    video_hash = hashlib.sha256(data).hexdigest()
    scene_dir = settings.scenes_dir / video_hash
    splat_path = scene_dir / "output" / "scene.ply"

    # Return cached result immediately if the scene already exists
    if splat_path.exists():
        job = await _find_done_job(video_hash) or await _make_done_job(video_hash, splat_path)
        return ReconstructResponse(
            job_id=job.job_id, cached=True, message="Returning cached reconstruction."
        )

    # Save video and start background reconstruction
    video_path = scene_dir / "video" / (file.filename or "upload.mp4")
    video_path.parent.mkdir(parents=True, exist_ok=True)
    video_path.write_bytes(data)

    job = await job_store.create(video_hash)
    asyncio.create_task(
        pipeline.run(job.job_id, video_path, scene_dir),
        name=f"reconstruct-{job.job_id[:8]}",
    )

    return ReconstructResponse(
        job_id=job.job_id, cached=False, message="Reconstruction started."
    )


@router.get("/reconstruct/{job_id}", response_model=StatusResponse)
async def get_status(job_id: str) -> StatusResponse:
    """Poll reconstruction progress for a given job."""
    job = await job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    return StatusResponse(
        job_id=job.job_id,
        status=job.status,
        stage=job.stage,
        progress=job.progress,
        elapsed_s=job.elapsed_s,
        error=job.error,
    )


@router.get("/reconstruct/{job_id}/result")
async def get_result(job_id: str) -> FileResponse:
    """Download the reconstructed scene.ply once the job is DONE."""
    job = await job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    if job.status == JobStatus.ERROR:
        raise HTTPException(status_code=500, detail=f"Job failed: {job.error}")
    if job.status != JobStatus.DONE or job.splat_path is None:
        raise HTTPException(
            status_code=409,
            detail=f"Job is not finished yet (status: {job.status}).",
        )
    return FileResponse(
        path=str(job.splat_path),
        media_type="application/octet-stream",
        filename="scene.ply",
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _find_done_job(video_hash: str) -> Job | None:
    """Return any existing DONE job for this video hash."""
    # Job store is small for local deployment; linear scan is fine.
    for job_id in list(job_store._jobs):
        job = await job_store.get(job_id)
        if job and job.video_hash == video_hash and job.status == JobStatus.DONE:
            return job
    return None


async def _make_done_job(video_hash: str, splat_path: Path) -> Job:
    """Create and immediately mark a job as DONE (for existing cached scenes)."""
    job = await job_store.create(video_hash)
    await job_store.update(
        job.job_id,
        status=JobStatus.DONE,
        stage="Cached",
        progress=1.0,
        splat_path=splat_path,
    )
    return job
