"""Conservative query detection for the offline medical corpus."""

from __future__ import annotations

import re
import json
import pathlib


_MEDICAL_TOPIC_TERMS = re.compile(
    r"\b(?:"
    r"cancer|carcinoma|tumou?r|diabetes|hypertension|asthma|arthritis|"
    r"infection|disease|disorder|syndrome|stroke|pneumonia|hepatitis|"
    r"migraine|epilepsy|dementia|alzheimer|parkinson|tuberculosis|"
    r"cholesterol|anemia|anaemia|depression|anxiety|kidney|liver|lung|"
    r"heart|thyroid|pcos|allergy|allergies"
    r"|burns?|sprains?|strains?|wounds?|injur(?:y|ies)|bleeding|choking|"
    r"seizures?|poisoning|fractures?|fainting|heatstroke|heat exhaustion"
    r")\b",
    re.IGNORECASE,
)
_MEDICAL_QUESTION_TERMS = re.compile(
    r"\b(?:"
    r"cause[sd]?|risk factors?|symptoms?|signs?|diagnos(?:is|ed|e)|"
    r"treat(?:ment|ed|ing)?|prevent(?:ion|ed|ing)?|prognosis|screening|"
    r"complications?|what is|why does|how does|how is|main reason|first aid|"
    r"what should i do|what should we do|how should i help|during an?"
    r")\b",
    re.IGNORECASE,
)
_FOOD_OR_MEAL_REQUEST = re.compile(
    r"\b(?:food|foods|eat|meal|breakfast|lunch|dinner|snack|diet|recipe|"
    r"calorie|protein|carb|fat|menu)\b",
    re.IGNORECASE,
)
_MEDICATION_REQUEST = re.compile(
    r"\b(?:medicine|medication|drug|dose|dosage|interaction|tablet|capsule)\b",
    re.IGNORECASE,
)

_TOPIC_CATALOG_PATH = pathlib.Path(__file__).resolve().parent / "topic_catalog.json"


def _load_topic_titles() -> tuple[str, ...]:
    try:
        titles = json.loads(_TOPIC_CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return ()
    return tuple(
        sorted(
            {
                str(title).strip().casefold()
                for title in titles
                if len(str(title).strip()) >= 4
            },
            key=len,
            reverse=True,
        )
    )


_INDEXED_TOPIC_TITLES = _load_topic_titles()


def _contains_indexed_topic(text: str) -> bool:
    lowered = text.casefold()
    return any(
        re.search(rf"(?<!\w){re.escape(title)}(?!\w)", lowered)
        for title in _INDEXED_TOPIC_TITLES
    )


def is_medical_rag_query(message: str) -> bool:
    """Return True only for disease/health questions covered by phase-one RAG."""
    text = " ".join(str(message or "").split())
    if len(text) < 4:
        return False
    # Food planning and drug-label questions remain with their existing verified
    # routes until those authoritative corpora are added to the medical index.
    if _FOOD_OR_MEAL_REQUEST.search(text) or _MEDICATION_REQUEST.search(text):
        return False
    has_topic = bool(_MEDICAL_TOPIC_TERMS.search(text)) or _contains_indexed_topic(text)
    return bool(has_topic and _MEDICAL_QUESTION_TERMS.search(text))
