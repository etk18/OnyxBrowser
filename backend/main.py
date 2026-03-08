"""
OnyxBrowser Backend — FastAPI Application

Entry-point for the Python backend.

Run with:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import os
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from dotenv import set_key

from routers.agent import router as agent_router
from schemas import MemoryIngestRequest, MemorySearchRequest, OmniboxCommandRequest, APIKeyPayload
from services.memory import ingest_page, search_history, get_all_memories, delete_memory

# ── Logging ─────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

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


@app.get("/api/memory/all", tags=["Memory"])
async def memory_get_all():
    """Return the most recently added documents from ChromaDB (limit 50)."""
    return get_all_memories(limit=50)


@app.post("/api/memory/search", tags=["Memory"])
async def memory_search(body: MemorySearchRequest):
    """Semantic similarity search over the ChromaDB collection."""
    return search_history(body.query, n_results=5)


@app.delete("/api/memory/{doc_id}", tags=["Memory"])
async def memory_delete(doc_id: str):
    """Delete a specific memory document from ChromaDB."""
    ok = delete_memory(doc_id)
    if ok:
        return {"status": "deleted", "id": doc_id}
    return {"status": "error", "message": f"Failed to delete {doc_id}"}


# ── API Key Settings Bridge ────────────────────────────────────

PROVIDER_ENV_MAP = {
    "groq": "GROQ_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}

ENV_FILE = os.path.join(os.path.dirname(__file__), ".env")


@app.post("/api/settings/keys", tags=["Settings"])
async def save_api_key(payload: APIKeyPayload):
    """Receive an API key from the React Settings UI, apply it to the
    runtime environment, and persist it to the backend .env file."""
    provider = payload.provider.strip().lower()
    var_name = PROVIDER_ENV_MAP.get(provider)
    if not var_name:
        return {"status": "error", "message": f"Unknown provider: {payload.provider}"}

    key = payload.api_key.strip()

    # 1. Update runtime environment so LLM calls work immediately
    if key:
        os.environ[var_name] = key
    else:
        os.environ.pop(var_name, None)

    # 2. Persist to .env so it survives backend restarts
    set_key(ENV_FILE, var_name, key)

    logger.info("API key for %s (%s) updated via Settings UI", provider, var_name)
    return {"status": "success", "message": "API Key saved and applied."}


# ── Agentic Omnibox Command ───────────────────────────────────


@app.post("/api/command", tags=["Agent"])
async def omnibox_command(body: OmniboxCommandRequest):
    """
    Process an Agentic Omnibox /command.
    Routes intent and returns structured action payloads.
    """
    cmd = body.command.strip().lower()
    raw = body.command.strip()

    # ── Normalize command aliases ──
    import re
    alias_map = [
        (r"^/(find|lookup|look\s*up)\s+", "/search "),
        (r"^/(go|visit|goto|navigate)\s+", "/open "),
    ]
    for pattern, replacement in alias_map:
        if re.match(pattern, cmd):
            rest = re.sub(pattern, "", cmd)
            cmd = (replacement + rest).strip()
            raw = (replacement + re.sub(pattern, "", raw, flags=re.IGNORECASE)).strip()
            break

    # ── /open <target> — navigate the active tab ──
    if cmd.startswith("/open"):
        target = raw[5:].strip()
        if not target:
            return {"action": "respond", "text": "Usage: /open <site or URL>  (e.g. /open youtube)"}
        # Build a full URL from the target
        if "://" in target:
            url = target
        elif "." in target:
            url = "https://" + target
        else:
            url = f"https://www.{target}.com"
        return {
            "action": "navigate",
            "url": url,
            "text": f"Navigating to {url}",
        }

    # ── /summarize — LLM-powered page summary ──
    if cmd.startswith("/summarize"):
        if not body.context:
            return {
                "action": "respond",
                "text": "No page content available to summarize. Navigate to a webpage first.",
            }
        try:
            from langchain_core.messages import SystemMessage, HumanMessage
            from services.llm_agent import _get_llm
            llm = _get_llm()
            messages = [
                SystemMessage(content=(
                    "You are Onyx, an AI browser assistant. "
                    "Summarize the following webpage text concisely in 3 bullet points. "
                    "Each bullet should be a single clear sentence. "
                    "Do not include any preamble — start directly with the bullets."
                )),
                HumanMessage(content=f"Page URL: {body.current_url}\n\nPage content:\n{body.context[:12000]}"),
            ]
            result = await llm.ainvoke(messages)
            return {"action": "respond", "text": result.content}
        except Exception as exc:
            logger.error("/summarize LLM failed: %s", exc)
            return {"action": "respond", "text": f"LLM error: {exc}. Check your API keys in backend/.env"}

    # ── /ask <question> — LLM-powered Q&A over page context ──
    if cmd.startswith("/ask"):
        question = raw[4:].strip()
        if not question:
            return {"action": "respond", "text": "Usage: /ask <your question about the page>"}
        context_note = body.context[:12000] if body.context else "No page content available."
        try:
            from langchain_core.messages import SystemMessage, HumanMessage
            from services.llm_agent import _get_llm
            llm = _get_llm()
            messages = [
                SystemMessage(content=(
                    "You are Onyx, an AI browser assistant. "
                    "Answer the user's question based on the provided webpage text. "
                    "Be concise, accurate, and helpful. If the answer cannot be found "
                    "in the page content, say so clearly."
                )),
                HumanMessage(content=(
                    f"Page URL: {body.current_url}\n\n"
                    f"Page content:\n{context_note}\n\n"
                    f"User question: {question}"
                )),
            ]
            result = await llm.ainvoke(messages)
            return {"action": "respond", "text": result.content}
        except Exception as exc:
            logger.error("/ask LLM failed: %s", exc)
            return {"action": "respond", "text": f"LLM error: {exc}. Check your API keys in backend/.env"}

    # ── /search <query> — web search ──
    if cmd.startswith("/search"):
        query = raw[7:].strip()
        if not query:
            return {"action": "respond", "text": "Usage: /search <query>  (e.g. /search weather today)"}
        from urllib.parse import quote_plus
        url = f"https://www.google.com/search?q={quote_plus(query)}"
        return {
            "action": "navigate",
            "url": url,
            "text": f'Searching for "{query}"',
        }

    # ── /click <target> — LLM-powered DOM click ──
    if cmd.startswith("/click"):
        target = raw[6:].strip()
        if not target:
            return {"action": "respond", "text": "Usage: /click <element description>  (e.g. /click Sign In button)"}

        # If target is a plain integer → direct ID pass-through (no LLM needed)
        if target.isdigit():
            return {
                "action": "click",
                "target_id": target,
                "text": f'Clicking element #{target}.',
            }

        # Natural language target → use LLM to match against DOM map
        if not body.dom_map:
            return {
                "action": "respond",
                "text": "No DOM map available. Navigate to a page first, then try /click again.",
            }

        try:
            import json as _json
            from langchain_core.messages import SystemMessage, HumanMessage
            from services.llm_agent import _get_llm

            llm = _get_llm()
            messages = [
                SystemMessage(content=(
                    "You are an AI browser agent. The user wants to click: '"
                    + target
                    + "'. Look at this JSON array of interactive elements on the page:\n\n"
                    + body.dom_map
                    + "\n\nFind the element that best matches the user's intent. "
                    "You MUST respond with ONLY a valid JSON object in this exact format: "
                    '{\"action\": \"click\", \"target_id\": \"the_integer_id\"}\n'
                    "Do not include markdown formatting, code fences, or explanations. "
                    "Just the raw JSON object."
                )),
                HumanMessage(content=f"Click: {target}"),
            ]
            result = await llm.ainvoke(messages)
            response_text = result.content.strip()

            # Strip markdown code fences if the LLM wraps them anyway
            if response_text.startswith("```"):
                response_text = response_text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            parsed = _json.loads(response_text)
            matched_id = str(parsed.get("target_id", ""))

            if not matched_id:
                return {"action": "respond", "text": f"Could not identify which element to click for \"{target}\"."}

            return {
                "action": "click",
                "target_id": matched_id,
                "text": f'Clicking element #{matched_id} (matched: "{target}").',
            }
        except _json.JSONDecodeError:
            logger.error("/click LLM returned non-JSON: %s", response_text[:200])
            return {"action": "respond", "text": f"LLM returned invalid response. Try /click with a numeric ID instead."}
        except Exception as exc:
            logger.error("/click LLM failed: %s", exc)
            return {"action": "respond", "text": f"LLM error: {exc}. Try /click with a numeric ID instead."}

    # ── /help — list available commands ──
    if cmd.startswith("/help"):
        return {
            "action": "respond",
            "text": "Available commands:\n"
                    "/open <site> — Navigate to a website (e.g. /open youtube)\n"
                    "/search <query> — Search the web (e.g. /search weather today)\n"
                    "/summarize — Summarize the current page\n"
                    "/ask <question> — Ask a question about the page\n"
                    "/click <description> — Click an element (e.g. /click Sign In button)\n"
                    "/help — Show this help message",
        }

    # ── Fallback — unknown command ──
    return {
        "action": "respond",
        "text": f"Command not recognized: {body.command}. Type /help for available commands.",
    }
