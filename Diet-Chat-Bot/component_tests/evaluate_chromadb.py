from chroma_food_db import get_collection, semantic_search_foods
from component_tests.common import keyword_score, save, show_case, timed

CONCEPTS = [
    ("vegetarian breakfast", ["string hoppers", "pittu", "hoppers", "kiribath", "kola kanda"]),
    ("high protein curry", ["chicken curry", "fish curry", "dhal curry", "prawn curry"]),
    ("low calorie vegetable curry", ["snake gourd", "bitter gourd", "pumpkin"]),
    ("Sri Lankan breakfast", ["kiribath", "hoppers", "pittu", "kola kanda"]),
    ("healthy green side dish", ["mallung", "gotukola", "kankun"]),
    ("seafood lunch", ["fish", "prawn"]),
    ("vegan snack", ["papadam", "murukku"]),
    ("coconut condiment", ["pol sambol", "coconut sambol"]),
    ("lentil protein meal", ["dhal curry"]),
    ("gluten free dinner curry", ["curry"]),
]
TEMPLATES = ["Suggest {concept}", "Find me a {concept}", "I want {concept}", "Show foods suitable for {concept}", "What is a good {concept} option?"]

_, initialization_error, initialization_ms = timed(get_collection)
results = []
case_id = 0
for concept, expected in CONCEPTS:
    for template in TEMPLATES:
        case_id += 1
        question = template.format(concept=concept)
        if initialization_error:
            foods, error, elapsed = None, initialization_error, initialization_ms if case_id == 1 else 0
        else:
            foods, error, elapsed = timed(lambda q=question: semantic_search_foods(q, top_k=5))
        score, matched = keyword_score(foods or [], expected)
        results.append({"id": case_id, "question": question, "top_k": 5, "expected_any": expected, "matched_expected": matched, "returned_foods": foods, "hit_at_5": bool(matched), "initialization_error": initialization_error, "score": round(score, 2), "error": error, "elapsed_ms": elapsed, "status": "PASS" if not error and foods and matched else "FAIL"})
        show_case(results[-1], foods, "Top-5 ChromaDB foods")

save("chromadb", results, "chromadb_results.json")
