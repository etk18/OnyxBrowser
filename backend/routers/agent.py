"""
OnyxBrowser Backend — Agentic Endpoints

POST /api/agent/execute  -> Scrape page -> LLM brain -> structured DOM actions.
POST /api/agent/voice    -> Receive audio file -> Whisper transcription -> transcript.
"""

from __future__ import annotations

import os
import logging
import tempfile
import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File
from dotenv import load_dotenv

from schemas import AgentTaskRequest, VoiceTranscriptResponse
from services.scraper import extract_page_context
from services.llm_agent import process_browser_task, BrowserActionPlan

load_dotenv()

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent", tags=["Agent"])


# ── Execute: the main agentic endpoint ─────────────────────────


@router.post(
    "/execute",
    response_model=BrowserActionPlan,
    summary="Execute an agentic browser task via LLM",
)
async def execute_agent_task(body: AgentTaskRequest) -> BrowserActionPlan:
    """
    1. Scrape the current page for DOM context (Playwright).
    2. Pass the user's prompt + DOM text through the LangChain brain.
    3. Return a validated ``BrowserActionPlan`` (thought + action list).
    """
    logger.info(
        "Agent execute — prompt=%r  url=%r",
        body.user_prompt,
        body.current_url,
    )

    # ── 1. Scrape page context ──
    dom_context = ""
    try:
        dom_context = await extract_page_context(body.current_url)
        logger.info("Scraped %d chars of page context", len(dom_context))
    except Exception as exc:
        logger.warning("Scraper failed for %s: %s", body.current_url, exc)

    # ── 2. LLM reasoning ──
    plan = await process_browser_task(
        user_prompt=body.user_prompt,
        dom_context=dom_context,
        current_url=body.current_url,
    )

    logger.info(
        "Returning %d action(s) — types: %s",
        len(plan.actions),
        [a.action_type.value for a in plan.actions],
    )
    return plan


# ── Voice: MediaRecorder audio -> Whisper transcription ────────


async def _transcribe_with_groq(audio_path: str) -> str:
    """Transcribe audio using Groq's Whisper API (whisper-large-v3-turbo)."""
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set")

    async with httpx.AsyncClient(timeout=30.0) as client:
        with open(audio_path, "rb") as f:
            resp = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": ("recording.webm", f, "audio/webm")},
                data={"model": "whisper-large-v3-turbo", "language": "en"},
            )
    if resp.status_code != 200:
        raise ValueError(f"Groq Whisper error ({resp.status_code}): {resp.text}")
    return resp.json().get("text", "")


async def _transcribe_with_openai(audio_path: str) -> str:
    """Transcribe audio using OpenAI's Whisper API (whisper-1)."""
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set")

    async with httpx.AsyncClient(timeout=30.0) as client:
        with open(audio_path, "rb") as f:
            resp = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": ("recording.webm", f, "audio/webm")},
                data={"model": "whisper-1", "language": "en"},
            )
    if resp.status_code != 200:
        raise ValueError(f"OpenAI Whisper error ({resp.status_code}): {resp.text}")
    return resp.json().get("text", "")


@router.post(
    "/voice",
    response_model=VoiceTranscriptResponse,
    summary="Transcribe uploaded audio via Whisper",
)
async def transcribe_voice(file: UploadFile = File(...)) -> VoiceTranscriptResponse:
    """
    Accept an audio file (WebM from MediaRecorder), save to a temp file,
    transcribe via Groq Whisper (primary) or OpenAI Whisper (fallback),
    and return the transcript text.
    """
    logger.info("Voice upload received — filename=%s  content_type=%s", file.filename, file.content_type)

    # Save uploaded audio to a temp file
    suffix = ".webm" if "webm" in (file.content_type or "") else ".wav"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        contents = await file.read()
        tmp.write(contents)
        tmp.close()
        logger.info("Saved %d bytes to %s", len(contents), tmp.name)

        # Try Groq first, fall back to OpenAI
        transcript = ""
        try:
            transcript = await _transcribe_with_groq(tmp.name)
            logger.info("Groq Whisper transcript: %r", transcript[:100])
        except Exception as groq_err:
            logger.warning("Groq Whisper failed: %s — trying OpenAI", groq_err)
            try:
                transcript = await _transcribe_with_openai(tmp.name)
                logger.info("OpenAI Whisper transcript: %r", transcript[:100])
            except Exception as openai_err:
                logger.error("Both Whisper providers failed: %s", openai_err)
                raise HTTPException(
                    status_code=503,
                    detail="Transcription unavailable. Set GROQ_API_KEY or OPENAI_API_KEY in backend/.env",
                )

        return VoiceTranscriptResponse(transcript=transcript.strip())

    finally:
        # Clean up temp file
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
