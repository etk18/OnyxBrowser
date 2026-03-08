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


# ── Omnibox Command Models ────────────────────────────────────


class OmniboxCommandRequest(BaseModel):
    """Payload sent by the Agentic Omnibox for /command execution."""

    command: str = Field(..., min_length=1, description="The raw /command string (e.g. '/summarize this page').")
    current_url: str = Field(default="", description="The URL of the active tab.")
    tab_id: int = Field(default=0, description="The active tab ID.")
    context: str = Field(default="", description="Extracted page text from the active tab (up to 15k chars).")
    dom_map: str = Field(default="", description="JSON array of interactive DOM elements with data-onyx-id tags.")


class APIKeyPayload(BaseModel):
    """Payload for saving an LLM API key from the Settings UI."""

    provider: str = Field(..., min_length=1, description="LLM provider name (e.g. 'groq', 'openai').")
    api_key: str = Field(..., description="The API key value. Empty string to clear.")


class MemorySearchRequest(BaseModel):
    """Payload for semantic memory search."""

    query: str = Field(..., min_length=1, description="Natural-language search query.")
