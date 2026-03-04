"""
OnyxBrowser Backend — Agentic Endpoints

POST /api/agent/execute  → Scrape page → LLM brain → structured DOM actions.
POST /api/agent/voice    → Receive voice transcript (scaffold for future NLU).
"""

from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException

from schemas import AgentTaskRequest, VoiceCommandRequest, VoiceCommandResponse
from services.scraper import extract_page_context
from services.llm_agent import process_browser_task, BrowserActionPlan

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
        # Non-fatal — the LLM can still reason without page context

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


# ── Voice: scaffold for future NLU pipeline ────────────────────


@router.post(
    "/voice",
    response_model=VoiceCommandResponse,
    summary="Process a voice command transcript",
)
async def process_voice_command(body: VoiceCommandRequest) -> VoiceCommandResponse:
    """
    Receive a transcribed voice command and acknowledge it.
    The actual NLU/intent-classification pipeline will be
    implemented in a future phase.
    """
    logger.info("Voice command received — transcript=%r", body.audio_transcript)

    return VoiceCommandResponse(
        status="received",
        interpreted_action=f"Voice input acknowledged: '{body.audio_transcript}'. "
        "NLU pipeline not yet connected.",
    )
