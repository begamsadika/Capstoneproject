"""Lazy, offline-only retrieval from the persistent medical ChromaDB index."""

from __future__ import annotations

from dataclasses import dataclass
import json
import pathlib
import re
from typing import Any

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction


BASE_DIR = pathlib.Path(__file__).resolve().parent
CHROMA_DIR = BASE_DIR / "chroma_db"
COLLECTION_NAME = "wellora_medical_guidance"
INDEX_MANIFEST = BASE_DIR / "index_manifest.json"

_client: chromadb.PersistentClient | None = None
_collection = None
_embedder: SentenceTransformerEmbeddingFunction | None = None
RELATIVE_DISTANCE_WINDOW = 0.08


@dataclass(frozen=True)
class MedicalHit:
    text: str
    title: str
    section: str
    authority: str
    source_url: str
    reviewed: str
    document_type: str
    distance: float
    topic_id: str = ""
    chunk_index: int = 0


def _embedding_function():
    """Load the cached embedding model without making any network request."""
    global _embedder
    if _embedder is None:
        _embedder = SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2",
            device="cpu",
            local_files_only=True,
        )
    return _embedder


def _get_collection():
    global _client, _collection
    if _collection is not None:
        return _collection
    if not CHROMA_DIR.exists():
        return None
    _client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    names = {item.name for item in _client.list_collections()}
    if COLLECTION_NAME not in names:
        return None
    _collection = _client.get_collection(
        name=COLLECTION_NAME,
        embedding_function=_embedding_function(),
    )
    return _collection


def medical_index_status() -> dict[str, Any]:
    try:
        if _collection is not None:
            count = _collection.count()
        elif INDEX_MANIFEST.exists() and CHROMA_DIR.exists():
            manifest = json.loads(INDEX_MANIFEST.read_text(encoding="utf-8"))
            count = int(manifest.get("chunks") or 0)
        else:
            count = 0
        return {
            "ready": count > 0,
            "documents": count,
            "collection": COLLECTION_NAME,
            "path": str(CHROMA_DIR),
            "error": None,
        }
    except Exception as exc:
        return {
            "ready": False,
            "documents": 0,
            "collection": COLLECTION_NAME,
            "path": str(CHROMA_DIR),
            "error": f"{type(exc).__name__}: {exc}",
        }


def retrieve_medical_context(
    query: str,
    *,
    top_k: int = 3,
    max_distance: float = 0.60,
) -> list[MedicalHit]:
    collection = _get_collection()
    if collection is None or collection.count() == 0:
        return []
    result = collection.query(
        query_texts=[query],
        n_results=max(1, min(max(top_k * 5, 15), collection.count())),
        include=["documents", "metadatas", "distances"],
    )
    documents = (result.get("documents") or [[]])[0]
    metadatas = (result.get("metadatas") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]
    raw_hits: list[MedicalHit] = []
    for document, metadata, distance in zip(documents, metadatas, distances):
        distance_value = float(distance)
        if distance_value > max_distance:
            continue
        metadata = metadata or {}
        raw_hits.append(
            MedicalHit(
                text=str(document or ""),
                title=str(metadata.get("title") or "Untitled medical source"),
                section=str(metadata.get("section") or "Overview"),
                authority=str(metadata.get("authority") or "Unknown authority"),
                source_url=str(metadata.get("source_url") or ""),
                reviewed=(
                    str(metadata.get("reviewed") or "")
                    if str(metadata.get("date_kind") or "") in {"modified", "reviewed"}
                    else ""
                ),
                document_type=str(metadata.get("document_type") or "medical_topic"),
                distance=distance_value,
                topic_id=str(metadata.get("topic_id") or ""),
                chunk_index=int(metadata.get("chunk_index") or 0),
            )
        )
    return _merge_and_filter_hits(query, raw_hits, top_k=top_k)


def _normalized_words(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", str(value).casefold()))


def _normalized_term_set(value: str) -> set[str]:
    terms = set(_normalized_words(value).split())
    expanded = set(terms)
    for term in terms:
        if term.endswith("ies") and len(term) > 4:
            expanded.add(term[:-3] + "y")
        elif term.endswith("s") and len(term) > 3:
            expanded.add(term[:-1])
    return expanded


def _definition_topic(query: str) -> str:
    normalized = _normalized_words(query)
    for prefix in ("what is ", "what are ", "define ", "explain "):
        if normalized.startswith(prefix):
            return normalized[len(prefix) :].strip()
    return ""


def _source_key(hit: MedicalHit) -> str:
    return (hit.source_url.strip().casefold().rstrip("/") or
            f"{hit.authority.casefold()}::{hit.title.casefold()}")


def _merge_and_filter_hits(
    query: str,
    hits: list[MedicalHit],
    *,
    top_k: int,
) -> list[MedicalHit]:
    """Return relevant unique pages while retaining up to two useful chunks per page."""
    if not hits:
        return []
    ordered = sorted(hits, key=lambda item: item.distance)
    action_query = bool(
        re.search(
            r"\b(?:first aid|what should (?:i|we) do|how should i help|during an?)\b",
            query,
            re.IGNORECASE,
        )
    )
    relative_window = 0.14 if action_query else RELATIVE_DISTANCE_WINDOW
    cutoff = min(ordered[0].distance + relative_window, 1.0)
    eligible_keys = {
        _source_key(hit) for hit in ordered if hit.distance <= cutoff
    }
    # Once a page is relevant, retain its other semantically retrieved chunk so
    # section text split across a chunk boundary is not lost.
    eligible = [hit for hit in ordered if _source_key(hit) in eligible_keys]
    if action_query:
        query_terms = _normalized_term_set(query)
        eligible = [
            hit for hit in eligible
            if _normalized_term_set(hit.title) & query_terms
            or _normalized_words(hit.title) == "first aid"
        ]

    definition_topic = _definition_topic(query)
    if definition_topic:
        exact = [
            hit for hit in eligible
            if _normalized_words(hit.title) == definition_topic
        ]
        if exact:
            eligible = exact

    grouped: dict[str, list[MedicalHit]] = {}
    for hit in eligible:
        grouped.setdefault(_source_key(hit), []).append(hit)

    merged: list[MedicalHit] = []
    for page_hits in grouped.values():
        page_hits.sort(key=lambda item: item.distance)
        primary = page_hits[0]
        unique_chunks = []
        selected_page_hits = sorted(page_hits[:2], key=lambda item: item.chunk_index)
        for hit in selected_page_hits:
            text = hit.text.strip()
            if text and text not in unique_chunks:
                unique_chunks.append(text)
            if len(unique_chunks) == 2:
                break
        merged.append(
            MedicalHit(
                text="\n\n".join(unique_chunks),
                title=primary.title,
                section=primary.section,
                authority=primary.authority,
                source_url=primary.source_url,
                reviewed=primary.reviewed,
                document_type=primary.document_type,
                distance=primary.distance,
                topic_id=primary.topic_id,
                chunk_index=primary.chunk_index,
            )
        )
    merged.sort(key=lambda item: item.distance)
    return merged[:top_k]
