import os
import requests

from component_tests.common import keyword_score, save, show_case, timed

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:1b")

TOPICS = [
    ("balanced eating", ["nutrient", "health"]),
    ("healthy eating habits", ["habit", "health"]),
    ("portion control", ["portion", "calorie"]),
    ("hydration", ["water", "hydrat"]),
    ("mindful eating", ["mindful", "hunger"]),
    ("sleep and nutrition", ["sleep", "health"]),
    ("meal consistency", ["meal", "energy"]),
    ("reading food labels", ["label", "serving"]),
    ("reducing added sugar", ["sugar", "health"]),
    ("sustainable diet changes", ["gradual", "habit"]),
]
TEMPLATES = [
    "Explain {topic} in simple terms.",
    "Why is {topic} important?",
    "Give three general tips about {topic}.",
    "How can someone improve {topic}?",
    "What should a beginner know about {topic}?",
]


def ask_llm(question):
    prompt = f"""You are a general diet education assistant.
Answer the following general question clearly in no more than four sentences.
Do not diagnose a medical condition and do not invent personal profile information.

Question: {question}
Answer:"""
    response = requests.post(
        OLLAMA_URL,
        json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
        timeout=90,
    )
    response.raise_for_status()
    return response.json().get("response", "").strip()


def check_ollama():
    base_url = OLLAMA_URL.split("/api/")[0]
    response = requests.get(f"{base_url}/api/tags", timeout=5)
    response.raise_for_status()
    models = [item.get("name", "").split(":")[0] for item in response.json().get("models", [])]
    requested = OLLAMA_MODEL.split(":")[0]
    if requested not in models:
        raise RuntimeError(f"Ollama model '{OLLAMA_MODEL}' is not installed")
    return True


_, availability_error, availability_ms = timed(check_ollama)
results = []
case_id = 0
for topic, expected in TOPICS:
    for template in TEMPLATES:
        case_id += 1
        question = template.format(topic=topic)
        if availability_error:
            answer, error, elapsed = None, availability_error, availability_ms if case_id == 1 else 0
        else:
            answer, error, elapsed = timed(lambda q=question: ask_llm(q))
        score, matched = keyword_score(answer or "", expected)
        results.append({"id": case_id, "question": question, "model": OLLAMA_MODEL, "expected_keywords": expected, "matched_keywords": matched, "answer": answer, "generation_status": "SUCCESS" if answer and not error else "FAIL", "score": round(score, 2), "error": error, "elapsed_ms": elapsed, "status": "PASS" if not error and answer and score >= 0.5 else "FAIL"})
        show_case(results[-1], answer, "AI answer")

save("llm_fallback", results, "llm_fallback_results.json")
