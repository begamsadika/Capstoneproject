"""Grounded prompt and deterministic citation formatting for medical RAG."""

from __future__ import annotations

import re

from langchain_core.messages import HumanMessage, SystemMessage

from .retriever import MedicalHit


MEDICAL_RAG_SYSTEM_PROMPT = """You are Wellora's medical information assistant.
Answer only from the numbered evidence supplied by the application. Write a concise,
patient-friendly explanation and cite supporting statements with [1], [2], etc.
Never diagnose the user, prescribe treatment, change medication, or invent facts.
If the evidence is insufficient or conflicting, say so clearly. Distinguish risk
factors from guaranteed causes. Recommend professional care only when the user asks
for individual assessment, reports concerning symptoms, or the evidence indicates
urgent care is appropriate. Do not add facts from model memory."""


def _compact_profile(metrics: dict | None) -> str:
    metrics = metrics or {}
    items = []
    for key, label in (
        ("medical_conditions", "Known conditions"),
        ("medications", "Medications"),
        ("allergies", "Allergies"),
    ):
        value = str(metrics.get(key) or "").strip()
        if value:
            items.append(f"{label}: {value}")
    return "\n".join(items)


def build_medical_messages(
    question: str,
    hits: list[MedicalHit],
    metrics: dict | None = None,
    *,
    max_context_chars: int = 7000,
):
    evidence_parts = []
    used = 0
    for index, hit in enumerate(hits, start=1):
        heading = f"[{index}] {hit.title} — {hit.section} ({hit.authority})"
        block = f"{heading}\n{hit.text.strip()}"
        remaining = max_context_chars - used
        if remaining <= len(heading) + 100:
            break
        if len(block) > remaining:
            block = block[:remaining].rsplit(" ", 1)[0] + "…"
        evidence_parts.append(block)
        used += len(block)

    # General disease answers must not blend unrelated saved conditions,
    # medicines, or food allergies into the medical explanation. Personal
    # assessment is outside the scope of this phase-one information corpus.
    del metrics
    user_parts = [f"Question:\n{question.strip()}"]
    user_parts.append("Evidence:\n" + "\n\n".join(evidence_parts))
    if _is_definition_question(question):
        user_parts.append(
            "This is a definition question. Give a useful 2-4 sentence definition, "
            "including the affected organ or body system and major types, common "
            "features, or key risk factors only when the evidence provides them. "
            "Do not reduce the answer to an alias and do not add a routine instruction "
            "to consult a professional unless the question is personal or urgent."
        )
    user_parts.append(
        "Answer using only this evidence. Use bracket citations that match the "
        "evidence numbers."
    )
    return [
        SystemMessage(content=MEDICAL_RAG_SYSTEM_PROMPT),
        HumanMessage(content="\n\n".join(user_parts)),
    ]


def format_medical_sources(hits: list[MedicalHit]) -> str:
    lines = ["\n\n### Sources", ""]
    for index, hit in enumerate(hits, start=1):
        lines.append(
            f"{index}. **[{hit.title}]({hit.source_url})**  \n"
            f"   {hit.authority} · {hit.section}"
        )
    lines.append(
        "\n*This is general medical information, not a diagnosis or a substitute "
        "for care from a qualified healthcare professional.*"
    )
    return "\n".join(lines)


def _is_definition_question(question: str) -> bool:
    normalized = " ".join(str(question or "").strip().lower().split())
    return normalized.startswith(("what is ", "what are ", "define ", "explain "))


def medical_abstention() -> str:
    return (
        "I could not find sufficiently relevant information in the locally verified "
        "medical sources, so I will not generate an unsupported medical answer. "
        "Please rephrase the question or consult a qualified healthcare professional."
    )


_FALLBACK_STOPWORDS = {
    "a", "an", "and", "are", "for", "how", "i", "in", "is", "it", "main",
    "of", "the", "to", "what", "which", "with",
}
_INTENT_CUES = {
    "cause": {
        "cause", "causes", "caused", "risk", "factor", "factors", "exposure",
        "likely", "develop",
    },
    "symptom": {"symptom", "symptoms", "sign", "signs", "include", "includes"},
    "diagnosis": {"diagnose", "diagnosed", "diagnosis", "test", "tests", "screening"},
    "treatment": {"treat", "treated", "treatment", "manage", "managed", "therapy"},
    "definition": {"type", "affects", "condition", "disease", "disorder", "cancer"},
}


def _words(value: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", str(value).casefold()))


def _question_cues(question_words: set[str]) -> set[str]:
    if question_words & {"cause", "causes", "risk", "reason"}:
        return _INTENT_CUES["cause"]
    if question_words & {"symptom", "symptoms", "sign", "signs"}:
        return _INTENT_CUES["symptom"]
    if question_words & {"diagnose", "diagnosed", "diagnosis"}:
        return _INTENT_CUES["diagnosis"]
    if question_words & {"treat", "treated", "treatment", "manage", "managed"}:
        return _INTENT_CUES["treatment"]
    return _INTENT_CUES["definition"]


def build_medical_extractive_fallback(
    question: str,
    hits: list[MedicalHit],
    *,
    max_sentences: int = 3,
) -> str:
    """Create a cited answer using verbatim retrieved sentences when the LLM fails."""
    question_words = _words(question)
    content_words = question_words - _FALLBACK_STOPWORDS
    cue_words = _question_cues(question_words)

    if question_words & {"symptom", "symptoms", "sign", "signs"}:
        symptom_items = _extract_symptom_list(hits, max_items=5)
        if symptom_items:
            return _format_extractive_summary(symptom_items)

    if "main" in question_words and question_words & {"cause", "causes", "reason"}:
        max_sentences = min(max_sentences, 2)
    candidates = []
    for source_number, hit in enumerate(hits, start=1):
        title_match = len(content_words & _words(hit.title))
        section_bonus = 0
        position = 0
        for raw_line in hit.text.splitlines():
            line = " ".join(raw_line.split()).strip()
            if not line:
                continue
            line_words = _words(line)
            if line.endswith("?"):
                section_bonus = 6 if line_words & cue_words else 0
                continue
            if line.endswith(":"):
                if line_words & cue_words:
                    section_bonus = 6
                continue

            sentence_parts = [
                part.strip()
                for part in re.split(r"(?<=[.!?])\s+", line)
                if part.strip()
            ]
            if len(sentence_parts) > 1 and len(sentence_parts[0]) < 25:
                sentence_parts[1] = sentence_parts[0] + " " + sentence_parts[1]
                sentence_parts = sentence_parts[1:]
            for sentence in sentence_parts:
                position += 1
                if len(sentence) < 12 or len(sentence) > 420:
                    continue
                sentence_words = _words(sentence)
                overlap = len(content_words & sentence_words)
                cue_overlap = len(cue_words & sentence_words)
                score = (
                    overlap * 4
                    + cue_overlap * 2
                    + title_match
                    + section_bonus
                    - position * 0.02
                )
                if score > 0:
                    candidates.append(
                        (score, source_number, position, sentence, sentence_words)
                    )

    selected = []
    for _, source_number, position, sentence, sentence_words in sorted(
        candidates, key=lambda item: item[0], reverse=True
    ):
        if any(
            len(sentence_words & previous_words)
            / max(1, len(sentence_words | previous_words))
            > 0.72
            for _, _, _, previous_words in selected
        ):
            continue
        selected.append((source_number, position, sentence, sentence_words))
        if len(selected) >= max_sentences:
            break

    if not selected:
        return (
            "The verified medical evidence was retrieved, but the local language "
            "model did not finish the explanation in time. Please retry the question."
        )

    return _format_extractive_summary(
        [(source_number, sentence) for source_number, _, sentence, _ in selected]
    )


def build_medical_direct_answer(question: str, hits: list[MedicalHit]) -> str:
    """Answer structured symptom questions directly without waiting for an LLM."""
    question_words = _words(question)
    if not question_words & {"symptom", "symptoms", "sign", "signs"}:
        return ""
    items = _extract_symptom_list(hits, max_items=6)
    if not items:
        return ""

    lines = ["### Common symptoms", ""]
    for source_number, item in items:
        lines.append(f"- {item} [{source_number}]")

    urgent_titles = {
        "heart attack", "stroke", "anaphylaxis", "severe allergic reaction",
        "heatstroke", "meningitis",
    }
    if any(hit.title.casefold() in urgent_titles for hit in hits):
        lines.extend(
            (
                "",
                "**This condition can be an emergency. If these symptoms are "
                "happening now, contact local emergency services immediately.**",
            )
        )
    return "\n".join(lines)


_FIRST_AID_REQUEST = re.compile(
    r"\b(?:first aid|what should (?:i|we) do|how should i help|during an?)\b",
    re.IGNORECASE,
)


def build_medical_first_aid_answer(question: str, hits: list[MedicalHit]) -> str:
    """Return conservative first-aid guidance only when local evidence supports it."""
    if not _FIRST_AID_REQUEST.search(question):
        return ""

    question_words = _words(question)
    if question_words & {"burn", "burns", "scald", "scalds"}:
        return (
            "### Verified first-aid evidence is incomplete\n\n"
            "The local verified corpus explains burn types and how burn treatment "
            "depends on depth, cause, and affected area, but it does not contain "
            "enough specific immediate first-aid instructions for a minor burn. "
            "I will not replace missing evidence with an unverified model answer."
        )

    if "asthma" in question_words and "attack" in question_words:
        patterns = (
            "treatment plan", "quick-relief", "short-term relief", "inhaler",
            "severe attack", "emergency care",
        )
        heading = "### During an asthma attack"
        allowed_title_terms = {"asthma"}
    elif question_words & {"sprain", "sprains", "strain", "strains"}:
        patterns = ("resting", "icing", "compress", "elevat")
        heading = "### Initial care supported by the retrieved evidence"
        allowed_title_terms = {"sprain", "strain", "ankle"}
    else:
        return (
            "### Verified first-aid evidence is incomplete\n\n"
            "I found related medical information, but not enough specific first-aid "
            "instructions in the locally verified sources. I will not generate "
            "unsupported emergency guidance."
        )

    selected: list[tuple[int, str]] = []
    for source_number, hit in enumerate(hits, start=1):
        normalized_title = _normalized_medical_terms(hit.title)
        if not normalized_title & allowed_title_terms:
            continue
        for raw_line in hit.text.splitlines():
            evidence_line = " ".join(raw_line.split()).strip()
            lowered = evidence_line.casefold()
            if any(pattern in lowered for pattern in patterns):
                evidence_line = _compact_evidence_line(evidence_line, max_chars=420)
                if allowed_title_terms & {"sprain", "strain", "ankle"}:
                    evidence_line = re.sub(
                        r",?\s+and medicines(?: can help)?(?=[.,]|$)",
                        "",
                        evidence_line,
                        flags=re.IGNORECASE,
                    )
                item = (source_number, evidence_line)
                if 20 <= len(evidence_line) <= 420 and item not in selected:
                    selected.append(item)
            if len(selected) >= 4:
                break
        if selected:
            break

    if not selected:
        return (
            "### Verified first-aid evidence is incomplete\n\n"
            "Relevant medical pages were retrieved, but they did not contain enough "
            "specific immediate-care instructions. I will not generate unsupported "
            "first-aid guidance."
        )

    lines = [heading, ""]
    lines.extend(f"- {sentence} [{number}]" for number, sentence in selected)
    return "\n".join(lines)


def _normalized_medical_terms(value: str) -> set[str]:
    terms = _words(value)
    normalized = set(terms)
    for term in terms:
        if term.endswith("ies") and len(term) > 4:
            normalized.add(term[:-3] + "y")
        elif term.endswith("s") and len(term) > 3:
            normalized.add(term[:-1])
    return normalized


def _extract_symptom_list(
    hits: list[MedicalHit], *, max_items: int
) -> list[tuple[int, str]]:
    for source_number, hit in enumerate(hits, start=1):
        lines = [" ".join(line.split()).strip() for line in hit.text.splitlines()]
        collecting = False
        items = []
        for line in lines:
            if not line:
                continue
            words = _words(line)
            if not collecting:
                if line.endswith(":") and words & {"symptom", "symptoms", "sign", "signs"}:
                    collecting = True
                continue
            if line.endswith("?") or line.lower().startswith("medical topic:"):
                break
            # The list ends when MedlinePlus resumes normal explanatory prose.
            if line.endswith(".") and len(items) >= 3:
                break
            compact_line = _compact_evidence_line(line, max_chars=260)
            if 8 <= len(compact_line) <= 260:
                items.append((source_number, compact_line.rstrip(".")))
            if len(items) >= max_items:
                return items
        if items:
            return items
    return []


def _compact_evidence_line(line: str, *, max_chars: int) -> str:
    if len(line) <= max_chars:
        return line
    selected = []
    used = 0
    for sentence in re.split(r"(?<=[.!?])\s+", line):
        sentence = sentence.strip()
        if not sentence:
            continue
        extra = len(sentence) + (1 if selected else 0)
        if selected and used + extra > max_chars:
            break
        selected.append(sentence)
        used += extra
    return " ".join(selected)


def _format_extractive_summary(items: list[tuple[int, str]]) -> str:
    lines = [
        "**Direct summary from the retrieved medical evidence:**",
        "",
    ]
    for source_number, sentence in items:
        lines.append(f"- {sentence} [{source_number}]")
    lines.extend(
        (
            "",
            "*The local language model took too long, so this fallback uses only "
            "sentences from the cited evidence.*",
        )
    )
    return "\n".join(lines)
