import asyncio
import shutil
from pathlib import Path
from typing import Awaitable, Callable

from core.config import settings

ProgressCallback = Callable[[str, float], Awaitable[None]]


async def run_sfm(
    image_dir: Path,
    work_dir: Path,
    on_progress: ProgressCallback,
) -> Path:
    """
    Run the COLMAP SfM pipeline on a directory of images.

    Pipeline: feature_extractor → exhaustive_matcher → mapper → model_converter (TXT).
    Returns the path to sparse/0/ containing cameras.txt / images.txt / points3D.txt.
    Raises RuntimeError with a user-friendly message on failure.
    """
    db_path = work_dir / "database.db"
    sparse_dir = work_dir / "sparse"
    sparse_dir.mkdir(parents=True, exist_ok=True)

    await on_progress("COLMAP: extracting features", 0.0)
    await _colmap([
        "feature_extractor",
        "--database_path", str(db_path),
        "--image_path", str(image_dir),
        "--ImageReader.single_camera", "1",
    ])

    await on_progress("COLMAP: matching features", 0.33)
    await _colmap([
        "exhaustive_matcher",
        "--database_path", str(db_path),
    ])

    await on_progress("COLMAP: mapping scene", 0.66)
    await _colmap([
        "mapper",
        "--database_path", str(db_path),
        "--image_path", str(image_dir),
        "--output_path", str(sparse_dir),
    ])

    model_dir = sparse_dir / "0"
    if not model_dir.exists():
        raise RuntimeError(
            "COLMAP could not reconstruct a 3D model from this video.\n"
            "Common causes:\n"
            "  • Too little overlap between frames (aim for ~70%)\n"
            "  • Too-fast camera movement — try a slower, steadier take\n"
            "  • Poor lighting or a textureless scene"
        )

    await on_progress("COLMAP: converting model to TXT", 0.9)
    await _colmap([
        "model_converter",
        "--input_path", str(model_dir),
        "--output_path", str(model_dir),
        "--output_type", "TXT",
    ])

    await on_progress("COLMAP: done", 1.0)
    return model_dir


async def _colmap(args: list[str]) -> None:
    """Run one COLMAP command, raising RuntimeError on non-zero exit."""
    proc = await asyncio.create_subprocess_exec(
        settings.colmap_executable, *args,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        step = args[0] if args else "unknown"
        raise RuntimeError(
            f"COLMAP {step} failed (exit {proc.returncode}):\n"
            f"{stderr.decode()[-1000:]}"
        )


def is_colmap_available() -> bool:
    return shutil.which(settings.colmap_executable) is not None
