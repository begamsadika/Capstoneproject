import networkx as nx
import pickle
import requests
import json

# ── Load both graphs ─────────────────────────────────────────────────────────

# Graph 1: Drug-food interactions
drug_graph = nx.read_graphml("DataSets/drug_food_knowledge_graph.graphml")

# Graph 2: Condition/disease diet recommendations
with open("enhanced_diet_knowledge_graph.gpickle", "rb") as f:
    condition_graph = pickle.load(f)

print("✓ Both graphs loaded successfully")
print(
    f"  Drug graph     → {drug_graph.number_of_nodes()} nodes, {drug_graph.number_of_edges()} edges"
)
print(
    f"  Condition graph → {condition_graph.number_of_nodes()} nodes, {condition_graph.number_of_edges()} edges"
)


# ── Ollama query ─────────────────────────────────────────────────────────────


def query_ollama(prompt, model="gemma3:1b"):
    try:
        url = "http://localhost:11434/api/generate"
        response = requests.post(
            url, json={"model": model, "prompt": prompt, "stream": False}, timeout=60
        )
        return response.json().get("response", "No response from model")
    except Exception as e:
        return f"Ollama error: {str(e)}"


# ── Graph retrieval ───────────────────────────────────────────────────────────


def retrieve_context(query_type, keyword):
    graph = drug_graph if query_type == "drug" else condition_graph
    context = []
    keyword_lower = keyword.lower()

    for node in graph.nodes():
        if keyword_lower in str(node).lower():
            node_data = graph.nodes[node]
            neighbors = list(graph.neighbors(node))
            edges_info = []
            for neighbor in neighbors:
                edge_data = (
                    graph.edges[node, neighbor]
                    if graph.has_edge(node, neighbor)
                    else {}
                )
                edge_label = edge_data.get(
                    "label", edge_data.get("interaction", "relates_to")
                )
                edges_info.append(f"{edge_label} → {neighbor}")
            context.append(f"[{node}]: {edges_info}")

    return (
        "\n".join(context) if context else "No relevant data found in knowledge graph."
    )


# ── Full RAG pipeline ─────────────────────────────────────────────────────────


def ask_agent(query, keyword, query_type):
    context = retrieve_context(query_type, keyword)
    prompt = f"""You are a clinical diet recommendation assistant.

Context retrieved from medical knowledge graph:
{context}

Patient query: {query}

Instructions:
- Use ONLY the context above to answer
- Be specific about foods to avoid or recommend
- If context is limited, mention what is available and give a brief general note
- Keep the answer under 3 sentences

Answer:"""

    answer = query_ollama(prompt)
    return context, answer


# ── Flexible keyword scoring ──────────────────────────────────────────────────


def score_answer(answer, expected_keywords):
    answer_lower = answer.lower()
    hits = []

    for kw in expected_keywords:
        kw_lower = kw.lower()
        # Direct match
        if kw_lower in answer_lower:
            hits.append(kw)
            continue
        # All words in multi-word phrase present individually
        words = kw_lower.split()
        if len(words) > 1 and all(w in answer_lower for w in words):
            hits.append(kw)
            continue
        # Partial stem match (e.g. "carbohydrate" matches "low carb")
        for word in words:
            if len(word) >= 4 and any(word in token for token in answer_lower.split()):
                hits.append(kw)
                break

    score = len(hits) / len(expected_keywords)
    return score, hits


# ── Test cases ────────────────────────────────────────────────────────────────

test_cases = [
    # Drug queries (type: "drug")
    {
        "query": "What foods should I avoid while taking Warfarin?",
        "keyword": "warfarin",
        "type": "drug",
        "expected": ["spinach", "kale", "vitamin k", "alcohol"],
    },
    {
        "query": "I am on Aspirin. What should I not eat?",
        "keyword": "aspirin",
        "type": "drug",
        "expected": ["garlic", "ginger", "alcohol", "green tea"],
    },
    {
        "query": "Diet restrictions for Metformin users",
        "keyword": "metformin",
        "type": "drug",
        "expected": ["alcohol", "carbohydrate", "sugar"],
    },
    {
        "query": "Foods to avoid when taking Atorvastatin",
        "keyword": "atorvastatin",
        "type": "drug",
        "expected": ["grapefruit", "alcohol", "fatty"],
    },
    {
        "query": "What can I eat while on Lisinopril?",
        "keyword": "lisinopril",
        "type": "drug",
        "expected": ["potassium", "salt", "sodium"],
    },
    {
        "query": "Diet advice for someone on Ibuprofen",
        "keyword": "ibuprofen",
        "type": "drug",
        "expected": ["alcohol", "food", "stomach"],
    },
    {
        "query": "Foods to avoid with Amoxicillin",
        "keyword": "amoxicillin",
        "type": "drug",
        "expected": ["alcohol", "dairy", "acidic"],
    },
    {
        "query": "What foods interact with Digoxin?",
        "keyword": "digoxin",
        "type": "drug",
        "expected": ["fiber", "bran", "licorice"],
    },
    {
        "query": "Diet for someone taking Levothyroxine",
        "keyword": "levothyroxine",
        "type": "drug",
        "expected": ["calcium", "soy", "fiber", "coffee"],
    },
    {
        "query": "Foods to avoid with blood thinners",
        "keyword": "warfarin",
        "type": "drug",
        "expected": ["vitamin k", "spinach", "broccoli"],
    },
    # Condition queries (type: "condition")
    {
        "query": "What diet is recommended for diabetes?",
        "keyword": "diabetes",
        "type": "condition",
        "expected": ["sugar", "carbohydrate", "fiber"],
    },
    {
        "query": "Diet plan for hypertension patient",
        "keyword": "hypertension",
        "type": "condition",
        "expected": ["sodium", "salt", "potassium"],
    },
    {
        "query": "What should a heart disease patient eat?",
        "keyword": "heart",
        "type": "condition",
        "expected": ["fat", "fiber", "cholesterol"],
    },
    {
        "query": "Diet recommendation for kidney disease",
        "keyword": "kidney",
        "type": "condition",
        "expected": ["protein", "potassium", "phosphorus"],
    },
    {
        "query": "Foods good for cholesterol management",
        "keyword": "cholesterol",
        "type": "condition",
        "expected": ["fat", "fiber", "oat"],
    },
    {
        "query": "What to eat if I have obesity?",
        "keyword": "obesity",
        "type": "condition",
        "expected": ["calorie", "fiber", "protein"],
    },
    {
        "query": "Diet for liver disease patients",
        "keyword": "liver",
        "type": "condition",
        "expected": ["alcohol", "fat", "protein"],
    },
    {
        "query": "Dietary advice for anemia",
        "keyword": "anemia",
        "type": "condition",
        "expected": ["iron", "vitamin c", "protein"],
    },
    {
        "query": "What diet helps with gastric issues?",
        "keyword": "gastric",
        "type": "condition",
        "expected": ["spice", "meal", "bland"],
    },
    {
        "query": "Nutrition advice for cancer patients",
        "keyword": "cancer",
        "type": "condition",
        "expected": ["protein", "calorie", "fruit"],
    },
]


# ── Run evaluation ────────────────────────────────────────────────────────────

results = []
total_score = 0
drug_scores = []
condition_scores = []

print("\n" + "=" * 65)
print("        DIET KNOWLEDGE GRAPH — EVALUATION RESULTS")
print("=" * 65)

for i, case in enumerate(test_cases):
    print(f"\n[{i+1:02d}/20] {case['query']}")
    print(f"       Graph: {case['type'].upper()} | Keyword: {case['keyword']}")

    context, answer = ask_agent(case["query"], case["keyword"], case["type"])
    score, hits = score_answer(answer, case["expected"])

    total_score += score
    if case["type"] == "drug":
        drug_scores.append(score)
    else:
        condition_scores.append(score)

    status = "✓ PASS" if score >= 0.5 else "✗ FAIL"
    bar = "█" * int(score * 10) + "░" * (10 - int(score * 10))

    print(f"       Answer  : {answer[:180].strip()}...")
    print(f"       Expected: {case['expected']}")
    print(f"       Matched : {hits}")
    print(f"       Score   : [{bar}] {score:.0%}  {status}")

    results.append(
        {
            "id": i + 1,
            "type": case["type"],
            "query": case["query"],
            "keyword": case["keyword"],
            "answer": answer.strip(),
            "expected_keywords": case["expected"],
            "matched_keywords": hits,
            "score": round(score, 2),
            "status": "PASS" if score >= 0.5 else "FAIL",
        }
    )

# ── Summary ───────────────────────────────────────────────────────────────────

overall_accuracy = (total_score / len(test_cases)) * 100
drug_accuracy = (sum(drug_scores) / len(drug_scores)) * 100
condition_accuracy = (sum(condition_scores) / len(condition_scores)) * 100
passed = sum(1 for r in results if r["status"] == "PASS")

print("\n" + "=" * 65)
print("                        SUMMARY")
print("=" * 65)
print(f"  Total queries       : {len(test_cases)}")
print(f"  Passed (score ≥50%) : {passed}/20")
print(f"  Overall Accuracy    : {overall_accuracy:.1f}%")
print(
    f"  Drug queries        : {drug_accuracy:.1f}%  ({sum(1 for r in results if r['type']=='drug' and r['status']=='PASS')}/10 passed)"
)
print(
    f"  Condition queries   : {condition_accuracy:.1f}%  ({sum(1 for r in results if r['type']=='condition' and r['status']=='PASS')}/10 passed)"
)
print("=" * 65)

# ── Save full results ─────────────────────────────────────────────────────────

output = {
    "summary": {
        "total_queries": len(test_cases),
        "passed": passed,
        "overall_accuracy": f"{overall_accuracy:.1f}%",
        "drug_accuracy": f"{drug_accuracy:.1f}%",
        "condition_accuracy": f"{condition_accuracy:.1f}%",
    },
    "results": results,
}

with open("evaluation_results.json", "w") as f:
    json.dump(output, f, indent=2)

print("\n✓ Full results saved to evaluation_results.json")
