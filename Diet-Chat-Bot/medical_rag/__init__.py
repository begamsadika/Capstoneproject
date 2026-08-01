"""Offline-first medical retrieval for Wellora."""

from .answering import (
    build_medical_direct_answer,
    build_medical_extractive_fallback,
    build_medical_first_aid_answer,
    build_medical_messages,
    format_medical_sources,
)
from .retriever import MedicalHit, medical_index_status, retrieve_medical_context
from .routing import is_medical_rag_query

__all__ = [
    "MedicalHit",
    "build_medical_direct_answer",
    "build_medical_extractive_fallback",
    "build_medical_first_aid_answer",
    "build_medical_messages",
    "format_medical_sources",
    "is_medical_rag_query",
    "medical_index_status",
    "retrieve_medical_context",
]
