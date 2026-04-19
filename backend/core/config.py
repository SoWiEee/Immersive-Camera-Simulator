from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CAMSIM_", env_file=".env")

    # Scene cache root — reconstructed scenes are stored here
    scenes_dir: Path = Path("scenes")

    # Video upload limits
    max_video_size_mb: int = 500

    # Frame extraction (ffmpeg)
    extract_fps: float = 2.0
    max_frames: int = 300
    frame_max_side: int = 1280  # Longest side in pixels after downscale

    # COLMAP
    colmap_executable: str = "colmap"

    # 3DGS training (gsplat)
    gaussian_train_steps: int = 7000


settings = Settings()
