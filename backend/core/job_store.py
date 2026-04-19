import asyncio
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional


class JobStatus(str, Enum):
    QUEUED = "queued"
    EXTRACTING = "extracting"
    SFM = "sfm"
    TRAINING = "training"
    DONE = "done"
    ERROR = "error"


@dataclass
class Job:
    job_id: str
    video_hash: str
    status: JobStatus = JobStatus.QUEUED
    stage: str = "Queued"
    progress: float = 0.0
    elapsed_s: float = 0.0
    splat_path: Optional[Path] = None
    error: Optional[str] = None
    _started_at: float = field(default_factory=time.monotonic, repr=False)

    def tick(self) -> None:
        self.elapsed_s = round(time.monotonic() - self._started_at, 1)


class JobStore:
    """Thread-safe in-memory store for reconstruction jobs."""

    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = asyncio.Lock()

    async def create(self, video_hash: str) -> Job:
        job = Job(job_id=str(uuid.uuid4()), video_hash=video_hash)
        async with self._lock:
            self._jobs[job.job_id] = job
        return job

    async def get(self, job_id: str) -> Optional[Job]:
        async with self._lock:
            return self._jobs.get(job_id)

    async def update(self, job_id: str, **kwargs: object) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            for key, value in kwargs.items():
                setattr(job, key, value)
            job.tick()

    def active_count(self) -> int:
        return sum(
            1
            for j in self._jobs.values()
            if j.status not in {JobStatus.DONE, JobStatus.ERROR}
        )


# Module-level singleton — imported directly by routers and pipeline
job_store = JobStore()
