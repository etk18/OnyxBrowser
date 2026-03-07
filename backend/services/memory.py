"""
OnyxBrowser Backend — Semantic Vector Memory

Persistent ChromaDB collection for browser history.
Pages are embedded on ingest; the agent can query with natural language.
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import chromadb

logger = logging.getLogger(__name__)

# ── Persistent ChromaDB client ────────────────────────────────

_DB_PATH = str(Path(__file__).resolve().parent.parent / "chroma_db")

_client = chromadb.PersistentClient(path=_DB_PATH)

_collection = _client.get_or_create_collection(
    name="browser_history",
    metadata={"hnsw:space": "cosine"},
)

logger.info("ChromaDB collection 'browser_history' ready at %s", _DB_PATH)


# ── Ingest ────────────────────────────────────────────────────


async def ingest_page(url: str, title: str, content: str) -> None:
    """
    Upsert a page into the vector store.

    The URL is SHA-256 hashed to produce a stable document ID so
    revisiting the same page overwrites the previous embedding.
    """
    if not content or not content.strip():
        return

    doc_id = hashlib.sha256(url.encode()).hexdigest()

    _collection.upsert(
        ids=[doc_id],
        documents=[content[:8000]],
        metadatas=[{"url": url, "title": title or url}],
    )
    logger.info("Ingested %s (%d chars) → id=%s…", url[:80], len(content), doc_id[:12])


# ── Search ────────────────────────────────────────────────────


def search_history(query: str, n_results: int = 3) -> list[dict]:
    """
    Semantic search over ingested browser history.

    Returns a list of dicts: [{url, title, snippet, distance}, ...]
    """
    count = _collection.count()
    if count == 0:
        return []

    results = _collection.query(
        query_texts=[query],
        n_results=min(n_results, count),
    )

    hits: list[dict] = []
    for i, doc_id in enumerate(results["ids"][0]):
        meta = results["metadatas"][0][i]
        hits.append(
            {
                "url": meta.get("url", ""),
                "title": meta.get("title", ""),
                "snippet": (results["documents"][0][i] or "")[:300],
                "distance": results["distances"][0][i] if results.get("distances") else None,
            }
        )
    return hits
