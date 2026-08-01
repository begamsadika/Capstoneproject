import io

from medical_rag.answering import (
    build_medical_direct_answer,
    build_medical_extractive_fallback,
    build_medical_first_aid_answer,
    build_medical_messages,
    format_medical_sources,
)
from medical_rag.ingest_documents import _parse_medlineplus_stream
from medical_rag.retriever import MedicalHit, _merge_and_filter_hits
from medical_rag.routing import is_medical_rag_query


def _hit(distance: float = 0.2) -> MedicalHit:
    return MedicalHit(
        text="Smoking is the leading risk factor for lung cancer.",
        title="Lung Cancer",
        section="Overview",
        authority="MedlinePlus / U.S. National Library of Medicine",
        source_url="https://medlineplus.gov/lungcancer.html",
        reviewed="2026-07-01",
        document_type="health_topic",
        distance=distance,
    )


def _named_hit(title: str, url: str, text: str, distance: float) -> MedicalHit:
    return MedicalHit(
        text=text,
        title=title,
        section="Overview",
        authority="MedlinePlus / U.S. National Library of Medicine",
        source_url=url,
        reviewed="1999-01-01",
        document_type="health_topic",
        distance=distance,
    )


def test_medical_router_is_conservative():
    assert is_medical_rag_query("What is the main cause of lung cancer?")
    assert is_medical_rag_query("What are the symptoms of asthma?")
    assert is_medical_rag_query("What is psoriasis?")
    assert not is_medical_rag_query("What should I eat for dinner?")
    assert not is_medical_rag_query("What foods should I avoid with diabetes?")
    assert not is_medical_rag_query("Are there interactions with amoxicillin?")
    assert is_medical_rag_query("What first aid should I give for a minor burn?")
    assert is_medical_rag_query("What should I do for a minor ankle sprain?")
    assert is_medical_rag_query("What should I do during an asthma attack?")


def test_medlineplus_parser_indexes_only_authored_summary():
    xml = b"""<?xml version='1.0' encoding='UTF-8'?>
    <health-topics>
      <health-topic title="Lung Cancer" url="https://medlineplus.gov/lungcancer.html"
                    id="123" language="English" date-created="2026-07-01">
        <also-called>Pulmonary cancer</also-called>
        <full-summary>&lt;p&gt;Lung cancer forms in tissues of the lung. Smoking is a major risk factor.&lt;/p&gt;
        &lt;p&gt;Screening may help some people at high risk. Symptoms and treatment depend on the type and stage, and individual medical assessment is important.&lt;/p&gt;</full-summary>
        <site><title>Third party content that must not be indexed</title></site>
      </health-topic>
    </health-topics>"""
    records = _parse_medlineplus_stream(io.BytesIO(xml))

    assert len(records) == 1
    assert records[0]["metadata"]["title"] == "Lung Cancer"
    assert "Pulmonary cancer" in records[0]["text"]
    assert "Smoking is a major risk factor" in records[0]["text"]
    assert "Third party content" not in records[0]["text"]


def test_grounded_prompt_and_sources_are_numbered():
    messages = build_medical_messages(
        "What causes lung cancer?",
        [_hit()],
        {"medical_conditions": "diabetes"},
    )
    prompt = messages[-1].content
    assert "[1] Lung Cancer" in prompt
    assert "Smoking is the leading risk factor" in prompt
    assert "diabetes" not in prompt.lower()

    sources = format_medical_sources([_hit()])
    assert "1. **[Lung Cancer](https://medlineplus.gov/lungcancer.html)**" in sources
    assert "source date" not in sources
    assert "not a diagnosis" in sources


def test_definition_prompt_requires_a_complete_evidence_only_definition():
    messages = build_medical_messages("What is lung cancer?", [_hit()])
    prompt = messages[-1].content
    assert "useful 2-4 sentence definition" in prompt
    assert "Do not reduce the answer to an alias" in prompt


def test_retrieval_merges_duplicate_pages_and_filters_weak_results():
    lung_url = "https://medlineplus.gov/lungcancer.html"
    hits = [
        _named_hit("Lung Cancer", lung_url, "Definition chunk", 0.20),
        _named_hit("Lung Cancer", lung_url, "Risk-factor chunk", 0.24),
        _named_hit("Carcinoid Tumors", "https://example.test/carcinoid", "Other", 0.35),
        _named_hit("Mesothelioma", "https://example.test/mesothelioma", "Other", 0.50),
    ]

    selected = _merge_and_filter_hits("What is lung cancer?", hits, top_k=3)

    assert len(selected) == 1
    assert selected[0].title == "Lung Cancer"
    assert "Definition chunk" in selected[0].text
    assert "Risk-factor chunk" in selected[0].text


def test_extractive_fallback_uses_retrieved_evidence_with_citations():
    hit = _named_hit(
        "Asthma",
        "https://medlineplus.gov/asthma.html",
        (
            "Asthma is a chronic disease that affects the airways. "
            "Symptoms of asthma include coughing, wheezing, chest tightness, "
            "and shortness of breath."
        ),
        0.2,
    )

    answer = build_medical_extractive_fallback(
        "What are the symptoms of asthma?", [hit]
    )

    assert "coughing, wheezing" in answer
    assert "[1]" in answer
    assert "could not find sufficiently relevant" not in answer


def test_direct_symptom_answer_does_not_require_an_llm():
    hit = _named_hit(
        "Heart Attack",
        "https://medlineplus.gov/heartattack.html",
        (
            "The most common symptoms are:\n"
            "Chest discomfort. It may feel like pressure or squeezing.\n"
            "Shortness of breath. It may occur with or without chest discomfort.\n"
            "Discomfort in one or both arms, the back, neck, or jaw."
        ),
        0.2,
    )

    answer = build_medical_direct_answer(
        "What are the symptoms of a heart attack?", [hit]
    )

    assert "### Common symptoms" in answer
    assert "Chest discomfort" in answer
    assert "Shortness of breath" in answer
    assert "contact local emergency services immediately" in answer


def test_first_aid_answers_use_only_supported_local_evidence():
    sprain = _named_hit(
        "Sprains and Strains",
        "https://medlineplus.gov/sprainsandstrains.html",
        (
            "At first, treatment of sprains usually involves resting the injured "
            "area, icing it, and wearing a bandage that compresses the area."
        ),
        0.2,
    )
    asthma = _named_hit(
        "Asthma",
        "https://medlineplus.gov/asthma.html",
        (
            "Short-term relief medicines, also called quick-relief medicines, "
            "relieve symptoms during an asthma attack and include an inhaler.\n"
            "If you have a severe attack and short-term relief medicines do not "
            "work, you will need emergency care."
        ),
        0.2,
    )
    burn = _named_hit(
        "Burns",
        "https://medlineplus.gov/burns.html",
        "Treatment depends on the cause, depth, and area affected.",
        0.2,
    )

    sprain_answer = build_medical_first_aid_answer(
        "What should I do for a minor ankle sprain?", [sprain]
    )
    asthma_answer = build_medical_first_aid_answer(
        "What should I do during an asthma attack?", [asthma]
    )
    burn_answer = build_medical_first_aid_answer(
        "What first aid should I give for a minor burn?", [burn]
    )

    assert "resting" in sprain_answer and "icing" in sprain_answer
    assert "quick-relief" in asthma_answer and "emergency care" in asthma_answer
    assert "evidence is incomplete" in burn_answer
    assert "aloe vera" not in burn_answer.lower()
