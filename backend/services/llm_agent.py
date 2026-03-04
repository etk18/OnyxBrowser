"""
OnyxBrowser Backend — LangChain Agent Service

The "brain" of the agentic pipeline.
Uses LangChain with PydanticOutputParser to produce structured
BrowserAction sequences from an LLM (ChatGroq or ChatOpenAI).
"""

from __future__ import annotations

import json
import logging
import os
from enum import Enum
from typing import Optional

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser

load_dotenv()

logger = logging.getLogger(__name__)


# ── Structured Output Schema ───────────────────────────────────


class ActionType(str, Enum):
    """Every DOM action the Electron renderer can execute."""

    CLICK = "click"
    TYPE = "type"
    SCROLL = "scroll"
    NAVIGATE = "navigate"
    EXTRACT = "extract"
    SUMMARIZE = "summarize"
    ANSWER = "answer"


class BrowserAction(BaseModel):
    """A single atomic action to perform on the page."""

    action_type: ActionType = Field(
        ...,
        description="The DOM action to perform.",
    )
    target_selector: Optional[str] = Field(
        default=None,
        description="CSS selector or visible-text identifier for the target element. "
        "Null for actions that don't target a specific element (e.g. scroll, summarize).",
    )
    value: Optional[str] = Field(
        default=None,
        description="Text to type, URL to navigate to, or summary content. "
        "Null for actions like click or scroll.",
    )


class BrowserActionPlan(BaseModel):
    """Structured response: a reasoning step + ordered list of actions."""

    thought: str = Field(
        ...,
        description="Brief chain-of-thought reasoning for the chosen action plan.",
    )
    actions: list[BrowserAction] = Field(
        ...,
        min_length=1,
        description="Ordered sequence of DOM actions to execute.",
    )


# ── Output Parser ──────────────────────────────────────────────

_parser = PydanticOutputParser(pydantic_object=BrowserActionPlan)

# ── System Prompt ──────────────────────────────────────────────

_SYSTEM_TEMPLATE = """\
You are **Onyx Intelligence**, an autonomous browser agent embedded in the \
Onyx high-performance browser.

Based on the user's request and the provided DOM context, determine the \
exact sequence of DOM actions required to fulfil the request.

RULES:
1. Return ONLY valid JSON matching the schema below — no markdown, no \
   explanation outside the JSON.
2. Prefer the fewest actions possible.
3. Use visible-text selectors (e.g. "Sign In", "Search") over brittle CSS \
   selectors whenever possible.
4. If the request is informational (e.g. "summarize this page"), use the \
   "summarize" or "answer" action with the relevant text in `value`.
5. If you cannot determine an action, return a single "answer" action \
   explaining why.

{format_instructions}
"""

_HUMAN_TEMPLATE = """\
USER REQUEST: {user_prompt}

CURRENT URL: {current_url}

PAGE CONTEXT (cleaned DOM text):
\"\"\"
{dom_context}
\"\"\"
"""

_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", _SYSTEM_TEMPLATE),
        ("human", _HUMAN_TEMPLATE),
    ]
).partial(format_instructions=_parser.get_format_instructions())


# ── LLM Initialisation ────────────────────────────────────────


def _get_llm():
    """
    Instantiate the configured LLM.

    Priority:
      1. GROQ_API_KEY  → ChatGroq  (fast & free tier friendly)
      2. OPENAI_API_KEY → ChatOpenAI
      3. Raise with a clear message.
    """
    groq_key = os.getenv("GROQ_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if groq_key:
        from langchain_groq import ChatGroq

        logger.info("LLM provider: Groq")
        return ChatGroq(
            api_key=groq_key,
            model=os.getenv("LLM_MODEL", "llama-3.3-70b-versatile"),
            temperature=0,
            max_tokens=2048,
        )

    if openai_key:
        from langchain_openai import ChatOpenAI

        logger.info("LLM provider: OpenAI")
        return ChatOpenAI(
            api_key=openai_key,
            model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
            temperature=0,
            max_tokens=2048,
        )

    raise RuntimeError(
        "No LLM API key found. Set GROQ_API_KEY or OPENAI_API_KEY in backend/.env"
    )


# ── Public API ─────────────────────────────────────────────────


async def process_browser_task(
    user_prompt: str,
    dom_context: str,
    current_url: str = "",
) -> BrowserActionPlan:
    """
    Send *user_prompt* + *dom_context* through the LangChain pipeline
    and return a validated ``BrowserActionPlan``.

    Falls back to a deterministic "answer" action if the LLM fails or
    returns unparseable output.
    """
    try:
        llm = _get_llm()
        chain = _prompt | llm | _parser
        result: BrowserActionPlan = await chain.ainvoke(
            {
                "user_prompt": user_prompt,
                "dom_context": dom_context[:20_000] or "[empty page]",
                "current_url": current_url,
            }
        )
        logger.info(
            "LLM returned %d action(s): %s",
            len(result.actions),
            [a.action_type.value for a in result.actions],
        )
        return result

    except Exception as exc:
        logger.error("LLM pipeline failed: %s", exc, exc_info=True)
        # Graceful degradation — return an error answer rather than 500
        return BrowserActionPlan(
            thought=f"LLM processing failed: {exc}",
            actions=[
                BrowserAction(
                    action_type=ActionType.ANSWER,
                    value="I encountered an error processing your request. "
                    "Please check the backend logs and your API keys.",
                )
            ],
        )
