"""
OnyxBrowser Backend — FastAPI Application

Entry-point for the Python backend.

Run with:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

from routers.agent import router as agent_router
from schemas import MemoryIngestRequest
from services.memory import ingest_page

# ── Logging ─────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

# ── FastAPI App ─────────────────────────────────────────────────

app = FastAPI(
    title="OnyxBrowser Backend",
    description="Agentic REST API for the Onyx high-performance browser.",
    version="0.1.0",
)

# ── CORS — allow the Electron renderer & Vite dev server ───────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # fallback dev port
        "file://",                 # Electron production (loadFile)
        "app://.",                 # Electron custom protocol
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ─────────────────────────────────────────────────────

app.include_router(agent_router)

# ── Health-Check Routes ─────────────────────────────────────────


@app.get("/", tags=["Health"])
async def root():
    """Root health-check — returns a welcome message."""
    return {
        "service": "OnyxBrowser Backend",
        "status": "operational",
        "version": "0.1.0",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Liveness probe for monitoring / orchestration."""
    return {"status": "healthy"}


# ── Memory Ingest ───────────────────────────────────────────────


@app.post("/api/memory/ingest", tags=["Memory"])
async def memory_ingest(body: MemoryIngestRequest, bg: BackgroundTasks):
    """Accept page content from the frontend and embed it in the background."""
    bg.add_task(ingest_page, body.url, body.title, body.content)
    return {"status": "accepted"}
