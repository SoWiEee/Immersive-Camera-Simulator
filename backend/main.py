from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import depth, health
from services.depth_service import DepthService


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load Depth Pro model once at startup
    await DepthService.initialize()
    yield
    DepthService.shutdown()


app = FastAPI(title="CamSim Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(depth.router, prefix="/api")
app.include_router(health.router, prefix="/api")
