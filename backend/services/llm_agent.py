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

from services.memory import search_history

load_dotenv()

logger = logging.getLogger(__name__)


# ── Structured Output Schema ───────────────────────────────────


class ActionType(str, Enum):
    """Every DOM action the Electron renderer can execute."""

    CLICK = "click"
    TYPE = "type"
    KEYPRESS = "keypress"
    SCROLL = "scroll"
    NAVIGATE = "navigate"
    EXTRACT = "extract"
    SUMMARIZE = "summarize"
    ANSWER = "answer"
    ANALYZE_UI = "analyze_ui"


class BrowserAction(BaseModel):
    """A single atomic action to perform on the page."""

    action_type: ActionType = Field(
        ...,
        description="The DOM action to perform.",
    )
    target_selector: Optional[str] = Field(
        default=None,
        description="CSS selector or visible-text identifier. Used as a fallback "
        "when target_id is not available (e.g. before analyze_ui has run).",
    )
    target_id: Optional[int] = Field(
        default=None,
        description="The integer ID from the spatial DOM map (data-onyx-id). "
        "Preferred over target_selector for click and type actions.",
    )
    value: Optional[str] = Field(
        default=None,
        description="Text to type, URL to navigate to, key name for keypress "
        "(e.g. 'Enter', 'Tab', 'Escape'), or summary content. "
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
You are **Onyx Intelligence**, an autonomous Agentic Web Operator embedded in \
the Onyx high-performance browser.

You CANNOT see the screen. To interact with any page, you MUST first use the \
"analyze_ui" action to receive a numbered JSON map of all clickable/typeable \
elements currently visible in the viewport. Once you have the map, use the \
exact integer `target_id` from that map in your "click" or "type" actions. \
Do NOT guess CSS selectors — always obtain the map first.

RULES:
1. Return ONLY valid JSON matching the schema below — no markdown, no \
   explanation outside the JSON.
2. Prefer the fewest actions possible.
3. For click and type: set `target_id` to the integer from the spatial map. \
   Only fall back to `target_selector` (visible text or CSS) if the map is \
   unavailable or if a DOM context was already provided.
4. If the request is informational (e.g. "summarize this page"), use the \
   "summarize" or "answer" action with the relevant text in `value`.
5. If you cannot determine an action, return a single "answer" action \
   explaining why.
5a. You have access to RELEVANT BROWSING HISTORY — semantic matches from \
    pages the user visited before. Use this context to answer questions \
    about past research, find forgotten URLs, or provide continuity.

CRITICAL NAVIGATION RULES:
6. To go to a website, use the "navigate" action with the full URL in the \
   `value` field (e.g. value="https://www.amazon.com"). This works even \
   from a blank New Tab page — the browser handles the URL loading natively.
7. NEVER try to click or type into the browser's own address bar/omnibox. \
   Use "navigate" instead.

CRITICAL FORM SUBMISSION RULES:
8. When you use the "type" action to fill a search bar or form field, you \
   MUST immediately follow it with a "keypress" action with value="Enter" \
   to submit the form. Do NOT type without submitting.
9. The "keypress" action dispatches a keyboard event on the last-focused \
   element. Use target_selector=null, target_id=null, and value="Enter" (or any key name).
10. Do NOT issue a "click" on a Search/Submit button after typing — the \
    keypress Enter is sufficient and more reliable.

SPATIAL MAP WORKFLOW:
11. When you need to interact with a page, your FIRST action should be \
    "analyze_ui" (no params needed). This returns a JSON array like: \
    [{{"id":1,"tag":"button","text":"Sign In"}},{{"id":2,"tag":"input[search]","text":"Search"}}]. \
    Then use the `id` values as `target_id` in subsequent click/type actions.
12. If the user's request is a simple navigation (e.g. "go to google.com"), \
    you do NOT need analyze_ui — just use "navigate" directly.

SELECTOR HINTS (fallback when no spatial map):
13. For search engines (Google, Bing, DuckDuckGo), use target_selector='[name="q"]' \
    for the "type" action. This targets the standard search input reliably.

{format_instructions}
"""

_HUMAN_TEMPLATE = """\
USER REQUEST: {user_prompt}

CURRENT URL: {current_url}

RELEVANT BROWSING HISTORY (semantic matches):
\"\"\"
{memory_context}
\"\"\"

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

        # ── Semantic memory lookup ──
        memory_context = "[no history yet]"
        try:
            hits = search_history(user_prompt, n_results=3)
            if hits:
                lines = []
                for h in hits:
                    lines.append(f"- {h['title']}  ({h['url']})\n  {h['snippet']}")
                memory_context = "\n".join(lines)
                logger.info("Memory returned %d hit(s) for %r", len(hits), user_prompt[:60])
        except Exception as mem_err:
            logger.warning("Memory search failed: %s", mem_err)

        result: BrowserActionPlan = await chain.ainvoke(
            {
                "user_prompt": user_prompt,
                "dom_context": dom_context[:20_000] or "[empty page]",
                "current_url": current_url,
                "memory_context": memory_context,
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
