"""
Download Depth Pro model weights (~2.5 GB) from Apple CDN.
Run with: uv run python scripts/download_model.py
"""

import sys
import urllib.request
from pathlib import Path

MODEL_URL = "https://ml-site.cdn-apple.com/models/depth-pro/depth_pro.pt"
CHECKPOINT_DIR = Path(__file__).parent.parent / "models" / "checkpoints"
CHECKPOINT_PATH = CHECKPOINT_DIR / "depth_pro.pt"


def _progress(block_num: int, block_size: int, total_size: int) -> None:
    downloaded = block_num * block_size
    pct = min(downloaded / total_size * 100, 100) if total_size > 0 else 0
    mb = downloaded / (1024 * 1024)
    total_mb = total_size / (1024 * 1024)
    print(f"\r  {pct:5.1f}%  {mb:.0f} / {total_mb:.0f} MB", end="", flush=True)


def main() -> None:
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)

    if CHECKPOINT_PATH.exists():
        size_mb = CHECKPOINT_PATH.stat().st_size / (1024 * 1024)
        print(f"Checkpoint already exists ({size_mb:.0f} MB): {CHECKPOINT_PATH}")
        print("Delete it manually to re-download.")
        return

    print(f"Downloading Depth Pro weights from Apple CDN …")
    print(f"  Destination: {CHECKPOINT_PATH}")
    print(f"  Expected size: ~2.5 GB\n")

    try:
        urllib.request.urlretrieve(MODEL_URL, CHECKPOINT_PATH, reporthook=_progress)
        print(f"\n\nDone! Saved to {CHECKPOINT_PATH}")
    except Exception as e:
        if CHECKPOINT_PATH.exists():
            CHECKPOINT_PATH.unlink()
        print(f"\nDownload failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
