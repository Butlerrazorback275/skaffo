"""Skaffo Engine — local FastAPI sidecar for the Electron app."""
from __future__ import annotations

import argparse
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.database import init_db
from .routers import api_design, generate, misc, projects, schema, schema_tools
from .services.seed import seed_if_empty


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    seed_if_empty()
    # Electron waits for this exact line before loading the UI.
    print(f"SKAFFO_ENGINE_READY port={settings.PORT}", flush=True)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"^file://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(misc.router)
app.include_router(projects.router)
app.include_router(schema.router)
app.include_router(api_design.router)
app.include_router(schema_tools.router)
app.include_router(generate.router)


def run() -> None:
    import uvicorn

    parser = argparse.ArgumentParser(prog="skaffo-engine")
    parser.add_argument("--port", type=int, default=settings.PORT)
    parser.add_argument("--host", default=settings.HOST)
    args = parser.parse_args()

    settings.PORT = args.port
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    sys.exit(run())
