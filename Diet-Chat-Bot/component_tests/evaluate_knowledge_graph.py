from kg_queries import build_kg_context, detect_entities, retrieve_condition_foods, retrieve_drug_foods
from component_tests.common import keyword_score, save, show_case, timed

SPECS = [
    ("drug", "warfarin", ["vitamin", "grapefruit"]),
    ("drug", "metformin", ["alcohol", "b12"]),
    ("drug", "atorvastatin", ["grapefruit"]),
    ("drug", "lisinopril", ["potassium", "salt"]),
    ("drug", "digoxin", ["fiber", "bran"]),
    ("condition", "diabetes", ["carbohydrate", "balanced"]),
    ("condition", "hypertension", ["low-fat", "balanced"]),
    ("condition", "heart disease", ["low-fat", "balanced"]),
    ("condition", "obesity", ["low-carbohydrate", "high-protein"]),
    ("condition", "pcos", ["low-gi", "protein"]),
]

TEMPLATES = {
    "drug": [
        "What foods should I avoid while taking {entity}?",
        "Does any food interact with {entity}?",
        "Give me dietary restrictions for {entity}",
        "What can I safely eat when using {entity}?",
        "Explain the food interactions of {entity}",
    ],
    "condition": [
        "What diet is recommended for {entity}?",
        "What foods should a person with {entity} eat?",
        "Which foods should I avoid for {entity}?",
        "Give me dietary advice for {entity}",
        "Which meal plan is suitable for {entity}?",
    ],
}

results = []
case_id = 0
for kind, entity, expected in SPECS:
    for template in TEMPLATES[kind]:
        case_id += 1
        question = template.format(entity=entity.title())

        def execute(k=kind, e=entity, q=question):
            entities = detect_entities(q)
            context = build_kg_context(q, entities)
            direct = retrieve_drug_foods(e) if k == "drug" else retrieve_condition_foods(e)
            return {"detected_entities": entities, "direct_retrieval": direct, "retrieved_context": context}

        actual, error, elapsed = timed(execute)
        score, matched = keyword_score(actual or {}, expected)
        context = (actual or {}).get("retrieved_context", "")
        retrieved = bool(context) and "No relevant data" not in context
        results.append({"id": case_id, "query_type": kind, "entity": entity, "question": question, "expected_keywords": expected, "matched_keywords": matched, "detected_entities": (actual or {}).get("detected_entities"), "direct_retrieval": (actual or {}).get("direct_retrieval"), "retrieved_context": context, "retrieval_status": "SUCCESS" if retrieved else "FAIL", "score": round(score, 2), "error": error, "elapsed_ms": elapsed, "status": "PASS" if not error and retrieved and score >= 0.5 else "FAIL"})
        show_case(results[-1], context, "Retrieved graph context")

save("knowledge_graph", results, "knowledge_graph_results.json")
