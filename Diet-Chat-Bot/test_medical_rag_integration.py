import asyncio
import json

import pytest

import api_new
from medical_rag.retriever import MedicalHit
from models import ChatRequest


@pytest.mark.asyncio
async def test_medical_rag_stream_has_sources_citations_and_local_provider(monkeypatch):
    hit = MedicalHit(
        text="Smoking is the leading risk factor for lung cancer.",
        title="Lung Cancer",
        section="Overview",
        authority="MedlinePlus / U.S. National Library of Medicine",
        source_url="https://medlineplus.gov/lungcancer.html",
        reviewed="2026-07-01",
        document_type="health_topic",
        distance=0.2,
    )
    monkeypatch.setattr(
        api_new,
        "medical_index_status",
        lambda: {"ready": True, "documents": 1},
    )
    monkeypatch.setattr(
        api_new,
        "retrieve_medical_context",
        lambda *args, **kwargs: [hit],
    )
    monkeypatch.setattr(
        api_new.hybrid_llm,
        "status",
        lambda: {
            "online_configured": False,
            "cooldown_remaining_seconds": 0,
            "last_provider": "ollama",
        },
    )

    async def fake_stream(messages):
        yield "Smoking is the leading risk factor for lung cancer. [1]"

    monkeypatch.setattr(api_new.hybrid_llm, "astream", fake_stream)

    response = await api_new.chat_stream(
        ChatRequest(
            user_id=999999,
            message="What is the main cause of lung cancer?",
            user_metrics={"medical_conditions": "diabetes"},
        )
    )
    raw = ""
    async for chunk in response.body_iterator:
        raw += chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk

    events = []
    for line in raw.splitlines():
        if line.startswith("data: ") and line != "data: [DONE]":
            events.append(json.loads(line[6:]))

    assert events[0]["answer_sources"] == ["medical_rag", "ollama"]
    visible = "".join(event.get("token", "") for event in events)
    assert "leading risk factor" in visible
    assert "### Sources" in visible
    assert "https://medlineplus.gov/lungcancer.html" in visible


@pytest.mark.asyncio
async def test_medical_rag_timeout_returns_retrieved_evidence_not_false_abstention(
    monkeypatch,
):
    hit = MedicalHit(
        text=(
            "Smoking is the leading risk factor for lung cancer. "
            "Tobacco smoke causes most cases of lung cancer."
        ),
        title="Lung Cancer",
        section="Overview",
        authority="MedlinePlus / U.S. National Library of Medicine",
        source_url="https://medlineplus.gov/lungcancer.html",
        reviewed="",
        document_type="health_topic",
        distance=0.2,
    )
    monkeypatch.setattr(
        api_new, "medical_index_status", lambda: {"ready": True, "documents": 1}
    )
    monkeypatch.setattr(
        api_new, "retrieve_medical_context", lambda *args, **kwargs: [hit]
    )
    monkeypatch.setattr(api_new, "OLLAMA_FIRST_RESPONSE_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(
        api_new.hybrid_llm,
        "status",
        lambda: {
            "online_configured": False,
            "cooldown_remaining_seconds": 0,
            "last_provider": "ollama",
        },
    )

    async def slow_stream(messages):
        await asyncio.sleep(0.05)
        yield "This should arrive too late."

    monkeypatch.setattr(api_new.hybrid_llm, "astream", slow_stream)
    response = await api_new.chat_stream(
        ChatRequest(
            user_id=999999,
            message="What is the main cause of lung cancer?",
            user_metrics={"medical_conditions": "diabetes"},
        )
    )
    raw = ""
    async for chunk in response.body_iterator:
        raw += chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk

    visible = "".join(
        json.loads(line[6:]).get("token", "")
        for line in raw.splitlines()
        if line.startswith("data: ") and line != "data: [DONE]"
    )
    assert "Direct summary from the retrieved medical evidence" in visible
    assert "leading risk factor" in visible
    assert "could not find sufficiently relevant" not in visible
    assert "### Sources" in visible


@pytest.mark.asyncio
async def test_medical_symptom_question_bypasses_llm(monkeypatch):
    hit = MedicalHit(
        text=(
            "The most common symptoms are:\n"
            "Chest discomfort. It may feel like pressure or squeezing.\n"
            "Shortness of breath. It can occur at rest.\n"
            "Pain in the arm, back, neck, or jaw."
        ),
        title="Heart Attack",
        section="Overview",
        authority="MedlinePlus / U.S. National Library of Medicine",
        source_url="https://medlineplus.gov/heartattack.html",
        reviewed="",
        document_type="health_topic",
        distance=0.2,
    )
    monkeypatch.setattr(
        api_new, "medical_index_status", lambda: {"ready": True, "documents": 1}
    )
    monkeypatch.setattr(
        api_new, "retrieve_medical_context", lambda *args, **kwargs: [hit]
    )

    async def llm_must_not_run(messages):
        raise AssertionError("Ollama should not run for a structured symptom list")
        yield "unreachable"

    monkeypatch.setattr(api_new.hybrid_llm, "astream", llm_must_not_run)
    response = await api_new.chat_stream(
        ChatRequest(
            user_id=999999,
            message="What are the symptoms of a heart attack?",
        )
    )
    raw = ""
    async for chunk in response.body_iterator:
        raw += chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk

    visible = "".join(
        json.loads(line[6:]).get("token", "")
        for line in raw.splitlines()
        if line.startswith("data: ") and line != "data: [DONE]"
    )
    assert "### Common symptoms" in visible
    assert "Chest discomfort" in visible
    assert "contact local emergency services immediately" in visible
    assert "### Sources" in visible


@pytest.mark.asyncio
async def test_first_aid_question_bypasses_general_llm_and_profile(monkeypatch):
    hit = MedicalHit(
        text=(
            "At first, treatment of sprains usually involves resting the injured "
            "area, icing it, and wearing a bandage that compresses the area."
        ),
        title="Sprains and Strains",
        section="Overview",
        authority="MedlinePlus / U.S. National Library of Medicine",
        source_url="https://medlineplus.gov/sprainsandstrains.html",
        reviewed="",
        document_type="health_topic",
        distance=0.2,
    )
    monkeypatch.setattr(
        api_new, "medical_index_status", lambda: {"ready": True, "documents": 1}
    )
    monkeypatch.setattr(
        api_new, "retrieve_medical_context", lambda *args, **kwargs: [hit]
    )

    async def llm_must_not_run(messages):
        raise AssertionError("General Ollama must not answer a first-aid request")
        yield "unreachable"

    monkeypatch.setattr(api_new.hybrid_llm, "astream", llm_must_not_run)
    response = await api_new.chat_stream(
        ChatRequest(
            user_id=999999,
            message="What should I do for a minor ankle sprain?",
            user_metrics={
                "medical_conditions": "diabetes",
                "allergies": "tomato, seafood",
            },
        )
    )
    raw = ""
    async for chunk in response.body_iterator:
        raw += chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk
    visible = "".join(
        json.loads(line[6:]).get("token", "")
        for line in raw.splitlines()
        if line.startswith("data: ") and line != "data: [DONE]"
    )

    assert "resting" in visible and "icing" in visible
    assert "diabetes" not in visible.lower()
    assert "tomato" not in visible.lower()
    assert "### Sources" in visible
