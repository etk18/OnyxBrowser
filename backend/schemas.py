"""
OnyxBrowser Backend — Pydantic Data Models

Strict request/response schemas for every endpoint.
"""

from pydantic import BaseModel, Field


# ── Request Models ──────────────────────────────────────────────


class AgentTaskRequest(BaseModel):
    """Payload sent by the Electron front-end to trigger an agentic action."""

    user_prompt: str = Field(
        ...,
        min_length=1,
        description="Natural-language instruction from the user (e.g. 'open amazon').",
    )
    current_url: str = Field(
        ...,
        description="The URL currently loaded in the active browser tab.",
    )


class VoiceCommandRequest(BaseModel):
    """Payload for the future voice-command pipeline."""

    audio_transcript: str = Field(
        ...,
        min_length=1,
        description="Transcribed text from the user's voice input.",
    )


# ── Response Models ─────────────────────────────────────────────


class AgentActionResponse(BaseModel):
    """Structured DOM-action that the Electron renderer should execute."""

    thought: str = Field(
        ...,
        description="Brief chain-of-thought reasoning for the chosen action.",
    )
    tool: str = Field(
        ...,
        description="Tool to invoke: navigate | click | type | keypress | scroll | scrape | answer.",
    )
    params: dict = Field(
        default_factory=dict,
        description="Tool-specific parameters (e.g. {url: '...'} for navigate).",
    )


class VoiceCommandResponse(BaseModel):
    """Acknowledgement returned for a processed voice command."""

    status: str = Field(default="received")
    interpreted_action: str = Field(
        default="",
        description="The action derived from the transcript (populated by future NLU pipeline).",
    )


class VoiceTranscriptResponse(BaseModel):
    """Whisper transcription result from uploaded audio."""

    transcript: str = Field(
        default="",
        description="Transcribed text from the user's voice recording.",
    )


# ── Memory Models ──────────────────────────────────────────────


class MemoryIngestRequest(BaseModel):
    """Payload sent by the frontend scraper to ingest page content."""

    url: str = Field(..., min_length=1, description="The page URL.")
    title: str = Field(default="", description="The page title.")
    content: str = Field(..., min_length=1, description="Truncated body text of the page.")
