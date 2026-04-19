import asyncio
import hashlib
import shutil
from pathlib import Path

from core.config import settings


async def compute_sha256(data: bytes) -> str:
    """SHA-256 of raw bytes, computed in a thread to avoid blocking the loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, hashlib.sha256(data).hexdigest)


async def extract_frames(video_path: Path, output_dir: Path) -> int:
    """
    Extract frames from *video_path* into *output_dir* using ffmpeg.

    Applies settings.extract_fps and settings.frame_max_side.
    Returns the number of JPEG frames written.
    Raises RuntimeError if ffmpeg fails or produces no output.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # Keep aspect ratio; downscale only the longer side.
    scale = (
        f"scale='if(gt(iw,ih),{settings.frame_max_side},-2)':"
        f"'if(gt(iw,ih),-2,{settings.frame_max_side})'"
    )
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vf", f"fps={settings.extract_fps},{scale}",
        "-frames:v", str(settings.max_frames),
        "-q:v", "2",
        str(output_dir / "%04d.jpg"),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()

    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{stderr.decode()[-500:]}")

    frames = sorted(output_dir.glob("*.jpg"))
    if not frames:
        raise RuntimeError(
            "ffmpeg produced no frames. "
            "Check that the video file is valid and not corrupted."
        )
    return len(frames)


def is_ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None
