"""Evaluate medical RAG retrieval and optionally its grounded generated answers."""

from __future__ import annotations

import argparse
import asyncio
import time

from component_tests.common import save, show_case
from medical_rag import (
    build_medical_messages,
    format_medical_sources,
    is_medical_rag_query,
    retrieve_medical_context,
)


TOPICS = [
    ("Lung Cancer", "lung cancer"),
    ("Asthma", "asthma"),
    ("Stroke", "stroke"),
    ("Diabetes", "diabetes"),
    ("Psoriasis", "psoriasis"),
    ("Migraine", "migraine"),
    ("Pneumonia", "pneumonia"),
    ("High Blood Pressure", "high blood pressure"),
    ("Hepatitis", "hepatitis"),
    ("Parkinson's Disease", "Parkinson's disease"),
]

TEMPLATES = [
    "What is {topic}?",
    "What causes {topic}?",
    "What are the symptoms of {topic}?",
    "How is {topic} diagnosed?",
    "How is {topic} treated or managed?",
]


async def evaluate(*, generate_answers: bool) -> None:
    hybrid_llm = None
    if generate_answers:
        # Importing the full application is intentionally delayed so retrieval-only
        # evaluation does not load the diet graphs or an LLM.
        from api_new import hybrid_llm as application_llm

        hybrid_llm = application_llm

    results = []
    case_id = 0
    for expected_title, topic in TOPICS:
        for template in TEMPLATES:
            case_id += 1
            question = template.format(topic=topic)
            started = time.perf_counter()
            error = None
            answer = "[generation skipped: retrieval-only mode]"
            provider = None
            hits = []
            try:
                routed = is_medical_rag_query(question)
                hits = retrieve_medical_context(question, top_k=5, max_distance=0.60)
                if generate_answers and hits and hybrid_llm is not None:
                    response = await hybrid_llm.ainvoke(
                        build_medical_messages(question, hits)
                    )
                    answer = str(getattr(response, "content", response) or "").strip()
                    answer += format_medical_sources(hits)
                    provider = hybrid_llm.status().get("last_provider")
            except Exception as exc:
                routed = is_medical_rag_query(question)
                error = f"{type(exc).__name__}: {exc}"

            retrieved_titles = [hit.title for hit in hits]
            expected_found = any(
                expected_title.casefold() in title.casefold()
                or title.casefold() in expected_title.casefold()
                for title in retrieved_titles
            )
            elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
            result = {
                "id": case_id,
                "question": question,
                "expected_topic": expected_title,
                "routed_to_medical_rag": routed,
                "retrieval_status": "SUCCESS" if hits else "FAIL",
                "expected_topic_retrieved": expected_found,
                "retrieved_context": [
                    {
                        "rank": rank,
                        "title": hit.title,
                        "section": hit.section,
                        "text": hit.text,
                        "authority": hit.authority,
                        "source_url": hit.source_url,
                        "reviewed": hit.reviewed,
                        "distance": round(hit.distance, 4),
                    }
                    for rank, hit in enumerate(hits, start=1)
                ],
                "generated_answer": answer,
                "answer_provider": provider,
                "elapsed_ms": elapsed_ms,
                "score": 1.0 if routed and hits and expected_found else 0.0,
                "status": "PASS" if not error and routed and hits and expected_found else "FAIL",
                "error": error,
            }
            results.append(result)
            show_case(result, answer, "Generated answer")

    save("medical_rag", results, "medical_rag_results.json")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--retrieval-only",
        action="store_true",
        help="Skip Gemini/Ollama and test only routing plus local Chroma retrieval.",
    )
    args = parser.parse_args()
    asyncio.run(evaluate(generate_answers=not args.retrieval_only))


if __name__ == "__main__":
    main()
