import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from routers import health, reconstruct

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure scene cache directory exists at startup
    settings.scenes_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title="CamSim Backend",
    version="0.2.0",
    description="3D Gaussian Splatting reconstruction API for CamSim.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reconstruct.router, prefix="/api")
app.include_router(health.router, prefix="/api")
