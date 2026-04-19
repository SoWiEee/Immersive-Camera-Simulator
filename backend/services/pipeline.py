"""
Reconstruction pipeline orchestrator.

Coordinates video_service → colmap_service → gaussian_service and keeps
the job store updated at each stage. Runs as a background asyncio task.
"""

import asyncio
import logging
from pathlib import Path

from core.config import settings
from core.job_store import JobStatus, job_store
from services import colmap_service, gaussian_service, video_service

logger = logging.getLogger(__name__)


async def run(job_id: str, video_path: Path, scene_dir: Path) -> None:
    """
    Execute the full reconstruction pipeline for *job_id*.

    On success: job status → DONE, splat_path set to scene.ply.
    On failure: job status → ERROR, error message stored.
    """
    try:
        await _run_stages(job_id, video_path, scene_dir)
    except Exception as exc:
        logger.exception("Reconstruction failed for job %s", job_id)
        await job_store.update(job_id, status=JobStatus.ERROR, error=str(exc))


async def _run_stages(job_id: str, video_path: Path, scene_dir: Path) -> None:
    frames_dir = scene_dir / "frames"
    colmap_dir = scene_dir / "colmap"
    output_dir = scene_dir / "output"
    splat_path = output_dir / "scene.ply"

    # ── Stage 1: Extract frames ───────────────────────────────────────────────
    await job_store.update(
        job_id, status=JobStatus.EXTRACTING, stage="Extracting frames", progress=0.0
    )
    frame_count = await video_service.extract_frames(video_path, frames_dir)
    logger.info("Job %s: extracted %d frames", job_id, frame_count)

    # ── Stage 2: COLMAP SfM ───────────────────────────────────────────────────
    await job_store.update(job_id, status=JobStatus.SFM, stage="COLMAP SfM", progress=0.0)

    async def sfm_progress(stage: str, progress: float) -> None:
        await job_store.update(job_id, stage=stage, progress=progress)

    model_dir = await colmap_service.run_sfm(frames_dir, colmap_dir, sfm_progress)
    logger.info("Job %s: COLMAP done, model at %s", job_id, model_dir)

    # ── Stage 3: 3DGS Training ────────────────────────────────────────────────
    output_dir.mkdir(parents=True, exist_ok=True)
    await job_store.update(
        job_id, status=JobStatus.TRAINING, stage="3DGS training", progress=0.0
    )

    async def train_progress(stage: str, progress: float) -> None:
        await job_store.update(job_id, stage=stage, progress=progress)

    await gaussian_service.train(
        colmap_dir=model_dir,
        image_dir=frames_dir,
        output_path=splat_path,
        train_steps=settings.gaussian_train_steps,
        on_progress=train_progress,
    )
    logger.info("Job %s: training done, PLY at %s", job_id, splat_path)

    # ── Done ──────────────────────────────────────────────────────────────────
    await job_store.update(
        job_id,
        status=JobStatus.DONE,
        stage="Done",
        progress=1.0,
        splat_path=splat_path,
    )
