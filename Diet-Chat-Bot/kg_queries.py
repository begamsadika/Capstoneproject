"""
kg_queries.py — Knowledge Graph constants, retrieval functions, and context builder.

Covers:
  - Condition / drug / allergy constants and lookup tables
  - fuzzy_find_nodes, is_real_food
  - retrieve_condition_foods, retrieve_drug_foods
  - detect_entities, build_kg_context
"""

from rapidfuzz import process, fuzz
from config import drug_graph, condition_graph
from medication_rules import medication_guidance

# ── Condition knowledge ──────────────────────────────────────────────────────

KNOWN_CONDITIONS = [
    "diabetes",
    "hypertension",
    "heart disease",
    "obesity",
    "high blood pressure",
    "cardiac",
    "overweight",
    "sugar",
    "pcos",
    "polycystic ovary",
    "polycystic ovarian",
    "pcod",
    "hypothyroidism",
    "hyperthyroidism",
    "thyroid",
    "underactive thyroid",
    "overactive thyroid",
]

# Canonical mapping: detected term → graph node name
_CONDITION_ALIAS = {
    "diabetes": "Diabetes",
    "type 2 diabetes": "Diabetes",
    "hypertension": "Hypertension",
    "high blood pressure": "Hypertension",
    "heart disease": "Heart Disease",
    "cardiac": "Heart Disease",
    "obesity": "Obesity",
    "overweight": "Obesity",
    "pcos": "PCOS",
    "pcod": "PCOS",
    "polycystic ovary": "PCOS",
    "polycystic ovarian": "PCOS",
    "hypothyroidism": "Hypothyroidism",
    "underactive thyroid": "Hypothyroidism",
    "hyperthyroidism": "Hyperthyroidism",
    "overactive thyroid": "Hyperthyroidism",
    "thyroid": "Hypothyroidism",  # default thyroid → hypothyroid
}

# Evidence-based dietary notes injected into LLM context
_CONDITION_DIET_NOTES = {
    "Diabetes": (
        "Choose high-fibre carbohydrates in measured portions and pair them with "
        "protein or vegetables. Limit added sugars, sugar-sweetened drinks, refined "
        "grains, and oversized portions of carbohydrate-rich foods."
    ),
    "Hypertension": (
        "Follow a DASH-style eating pattern with vegetables, fruit, whole grains, "
        "beans, and low-fat dairy where suitable. Limit sodium, highly processed "
        "foods, saturated fat, and sugar-sweetened drinks."
    ),
    "Heart Disease": (
        "Prefer vegetables, fruit, whole grains, beans, and unsaturated oils. Limit "
        "foods high in sodium, saturated or trans fat, added sugar, and highly "
        "processed foods."
    ),
    "Obesity": (
        "Prefer filling, minimally processed foods with fibre and protein. Limit "
        "sugar-sweetened drinks, frequent sweets, deep-fried foods, and large "
        "portions of energy-dense refined foods."
    ),
    "PCOS": (
        "PCOS dietary guidance: Prefer low-GI carbohydrates (brown rice, oats, red rice, lentils). "
        "Increase protein to 25–30% of calories to reduce insulin resistance. "
        "Include anti-inflammatory foods: turmeric, ginger, leafy greens, walnuts, flaxseed. "
        "Limit refined carbs, sugary foods, and high-saturated-fat items. "
        "Inositol-rich foods (chickpeas, brown rice) support hormonal balance. "
        "Aim for 1800–2000 kcal/day unless weight loss is targeted (then 1500–1700 kcal)."
    ),
    "Hypothyroidism": (
        "Hypothyroidism dietary guidance: Ensure adequate iodine (seaweed, iodized salt in moderation, eggs). "
        "Include selenium-rich foods (Brazil nuts, eggs, lentils) to support T4→T3 conversion. "
        "Limit raw goitrogenic vegetables (broccoli, spinach, cabbage) — cooking reduces goitrogens. "
        "Avoid soy products in large amounts as they interfere with thyroid hormone absorption. "
        "Prefer high-fiber, balanced meals. Take thyroid medication 30–60 minutes before eating. "
        "Aim for 1800–2200 kcal/day; metabolism is slower so avoid excess calories."
    ),
    "Hyperthyroidism": (
        "Hyperthyroidism dietary guidance: Avoid iodine-rich foods (seaweed, shellfish, iodized salt) "
        "as excess iodine can worsen the condition. Increase calcium and vitamin D intake. "
        "Eat goitrogenic vegetables (broccoli, spinach, cauliflower, kale) — these naturally reduce thyroid activity. "
        "Include antioxidant-rich foods: berries, leafy greens, nuts. "
        "Caloric needs are elevated; aim for 2500–3000 kcal/day to compensate for high metabolism. "
        "Avoid caffeine, alcohol, and stimulants."
    ),
}

# The current graph links these conditions to meal-plan nodes, not directly to
# food/ingredient nodes. These curated fallbacks prevent recognized conditions
# from producing empty headings while the graph is expanded.
_CONDITION_FOOD_FALLBACKS = {
    "Diabetes": {
        "recommended": [
            "non-starchy vegetables",
            "beans and lentils",
            "whole grains in measured portions",
            "unsweetened low-fat dairy",
            "tofu and other lean proteins",
        ],
        "avoid": [
            "sugar-sweetened drinks",
            "sweets and sugary desserts",
            "refined grains",
            "large portions of white rice or white bread",
            "highly processed snacks",
        ],
    },
    "Hypertension": {
        "recommended": [
            "vegetables",
            "fruit",
            "whole grains",
            "beans and lentils",
            "low-fat dairy",
            "minimally processed foods",
        ],
        "avoid": [
            "salty packaged foods",
            "instant noodles and soup mixes",
            "pickles and salty condiments",
            "fast food",
            "foods high in saturated fat",
            "sugar-sweetened drinks",
        ],
    },
    "Heart Disease": {
        "recommended": [
            "vegetables",
            "fruit",
            "whole grains",
            "beans and lentils",
            "tofu",
            "unsaturated vegetable oils",
        ],
        "avoid": [
            "deep-fried foods",
            "foods high in saturated or trans fat",
            "salty processed foods",
            "sugar-sweetened drinks",
            "highly processed snacks",
        ],
    },
    "Obesity": {
        "recommended": [
            "vegetables",
            "whole fruit",
            "beans and lentils",
            "whole grains in measured portions",
            "low-fat unsweetened dairy",
            "tofu and other lean proteins",
        ],
        "avoid": [
            "sugar-sweetened drinks",
            "frequent sweets and desserts",
            "deep-fried foods",
            "large portions of refined carbohydrates",
            "highly processed snacks",
        ],
    },
}

KNOWN_ALLERGIES = ["gluten intolerance", "nut allergy", "lactose intolerance"]

# ── Drug knowledge ───────────────────────────────────────────────────────────

DRUG_SYNONYMS = {
    # ── International brand names ──────────────────────────────
    "aspirin": "Acetylsalicylic acid",
    "tylenol": "Acetaminophen",
    "paracetamol": "Acetaminophen",
    "panadol": "Acetaminophen",
    "advil": "Ibuprofen",
    "motrin": "Ibuprofen",
    "brufen": "Ibuprofen",
    "blood thinner": "Warfarin",
    "blood thinners": "Warfarin",
    "anticoagulant": "Warfarin",
    "coumadin": "Warfarin",
    "insulin": "Insulin",
    "synthroid": "Levothyroxine",
    "lipitor": "Atorvastatin",
    "zocor": "Simvastatin",
    "prinivil": "Lisinopril",
    "zestril": "Lisinopril",
    "glucophage": "Metformin",
    # ── Sri Lankan brand names ─────────────────────────────────
    "gluconil": "Metformin",
    "metspan": "Metformin",
    "diabex": "Metformin",
    "diaformin": "Metformin",
    "formet": "Metformin",
    "cardiprin": "Acetylsalicylic acid",
    "ecosprin": "Acetylsalicylic acid",
    "disprin": "Acetylsalicylic acid",
    "atorva": "Atorvastatin",
    "tonact": "Atorvastatin",
    "lipvas": "Atorvastatin",
    "simcard": "Simvastatin",
    "zivast": "Simvastatin",
    "amlodipine": "Amlodipine",
    "amlopin": "Amlodipine",
    "amcard": "Amlodipine",
    "stamlo": "Amlodipine",
    "listril": "Lisinopril",
    "warf": "Warfarin",
    "glibenclamide": "Glibenclamide",
    "daonil": "Glibenclamide",
    "semi-daonil": "Glibenclamide",
    "gliclazide": "Gliclazide",
    "diamicron": "Gliclazide",
    "omeprazole": "Omeprazole",
    "losec": "Omeprazole",
    "thyroxine": "Levothyroxine",
    "eltroxin": "Levothyroxine",
}

DRUG_NODE_NAMES = {
    str(n).lower(): str(n)
    for n, d in drug_graph.nodes(data=True)
    if d.get("type") == "drug"
}

NON_FOOD_PREFIXES = (
    "take ",
    "avoid ",
    "do not",
    "consult",
    "monitor",
    "this drug",
    "may ",
    "can ",
    "should ",
    "it is",
    "and ",
    "increasing",
    "reducing",
)

FOOD_KEYWORDS = [
    "garlic",
    "ginger",
    "alcohol",
    "grapefruit",
    "vitamin k",
    "spinach",
    "kale",
    "broccoli",
    "dairy",
    "milk",
    "green tea",
    "caffeine",
    "soy",
    "calcium",
    "fiber",
    "licorice",
    "bran",
    "coffee",
    "orange juice",
    "pomelo",
    "st. john's wort",
    "leafy vegetables",
    "potassium",
    "sodium",
]

DRUG_SUPPLEMENTAL_NOTES = {
    "Atorvastatin": (
        "Avoid large quantities of grapefruit juice; official labeling warns that "
        "excessive intake can raise atorvastatin exposure. Confirm an appropriate "
        "amount with your pharmacist."
    ),
    "Lisinopril": (
        "Do not use potassium supplements or potassium-containing salt substitutes "
        "unless your prescriber approves them. Do not automatically eliminate ordinary "
        "potassium-containing foods without individualized clinical advice."
    ),
    "Amoxicillin": (
        "Avoid alcohol — impairs immune response and reduces antibiotic effectiveness. "
        "Avoid acidic foods and drinks (citrus, vinegar, carbonated sodas) — reduce absorption. "
        "Dairy products such as milk and yogurt may interfere with absorption. "
        "Take with food to reduce stomach upset."
    ),
    "Warfarin": (
        "Keep vitamin K intake consistent. Do not eliminate leafy greens; avoid sudden "
        "large dietary changes and discuss cranberry products, alcohol, and supplements "
        "with your anticoagulation clinician."
    ),
    "Metformin": (
        "Avoid alcohol — risk of lactic acidosis. "
        "Limit refined carbohydrates and sugar. "
        "Metformin can deplete B12 (vitamin B12) — include eggs, dairy, or B12 supplements."
    ),
    "Digoxin": (
        "High-fiber foods (bran, oats) can reduce digoxin absorption — take separately. "
        "Avoid licorice — can cause potassium loss and increase digoxin toxicity."
    ),
    "Levothyroxine": (
        "Take on an empty stomach 30–60 minutes before breakfast. Follow prescribed "
        "separation instructions for products that interfere with absorption; timing "
        "guidance is not the same as permanently banning those foods."
    ),
    "Ibuprofen": (
        "Always take with food to protect the stomach lining. "
        "Avoid alcohol — increases risk of stomach bleeding."
    ),
    "Acetylsalicylic acid": (
        "Avoid alcohol — increases gastrointestinal bleeding risk. "
        "Limit garlic, ginger, green tea — antiplatelet effects increase bleeding risk."
    ),
    "Simvastatin": (
        "Avoid grapefruit and grapefruit juice. This is enforced as a hard food "
        "exclusion in Wellora meal recommendations."
    ),
}

# ── Fuzzy guard list — tokens that must not be treated as conditions/drugs ───
_FUZZY_SKIP_WORDS = {
    "should",
    "would",
    "could",
    "please",
    "suggest",
    "recommend",
    "breakfast",
    "dinner",
    "eating",
    "foods",
    "meals",
    "healthy",
    "weight",
    "calorie",
    "calories",
    "protein",
    "vitamin",
    "vitamins",
    "morning",
    "evening",
    "tonight",
    "today",
    "avoid",
    "taking",
}


# ── Graph helpers ─────────────────────────────────────────────────────────────


def fuzzy_find_nodes(graph, query, score_cutoff=70):
    query_lower = query.strip().lower()
    node_list = list(graph.nodes())
    substring_hits = [n for n in node_list if query_lower in str(n).lower()]
    matches = process.extract(
        query_lower,
        [str(n).lower() for n in node_list],
        scorer=fuzz.partial_ratio,
        score_cutoff=score_cutoff,
        limit=10,
    )
    fuzzy_hits = [node_list[idx] for _, _, idx in matches]
    seen = set()
    result = []
    for n in substring_hits + fuzzy_hits:
        if n not in seen:
            seen.add(n)
            result.append(n)
    return result


def is_real_food(name):
    n = str(name).strip().lower()
    return not any(n.startswith(p) for p in NON_FOOD_PREFIXES) and len(n) < 60


# ── Retrieval functions ───────────────────────────────────────────────────────


def retrieve_condition_foods(condition):
    recommended_scores = {}
    avoid = set()
    canonical = _CONDITION_ALIAS.get(condition.lower(), condition)
    matched = fuzzy_find_nodes(condition_graph, canonical)
    for node in matched:
        if condition_graph.nodes[node].get("type") != "chronic_disease":
            continue
        for neighbor in condition_graph.neighbors(node):
            edge_data = condition_graph.get_edge_data(node, neighbor) or {}
            rel = edge_data.get("relationship", "")
            ntype = dict(condition_graph.nodes[neighbor]).get("type", "")
            if ntype in ("food", "ingredient"):
                if rel in ("recommend", "recommends"):
                    recommended_scores[neighbor] = max(
                        recommended_scores.get(neighbor, 0.0),
                        float(edge_data.get("suitability_score", 1.0)),
                    )
                elif rel == "avoid":
                    avoid.add(neighbor)

            # The enhanced graph models recommendations in two hops:
            # Condition -> Meal Plan -> Food.
            elif ntype == "meal_plan" and rel in ("recommend", "recommends"):
                for food in condition_graph.neighbors(neighbor):
                    plan_edge = condition_graph.get_edge_data(neighbor, food) or {}
                    if (
                        condition_graph.nodes[food].get("type") == "food"
                        and plan_edge.get("relationship") == "includes"
                    ):
                        score = float(plan_edge.get("suitability_score", 1.0))
                        # Foods supported by several recommended plans receive
                        # a higher combined score.
                        recommended_scores[food] = recommended_scores.get(food, 0.0) + score

    fallback = _CONDITION_FOOD_FALLBACKS.get(canonical, {})
    if not recommended_scores:
        for food in fallback.get("recommended", []):
            recommended_scores[food] = 0.0
    if not avoid:
        avoid.update(fallback.get("avoid", []))
    recommended = sorted(
        recommended_scores,
        key=lambda food: (-recommended_scores[food], str(food).lower()),
    )
    return recommended, sorted(avoid)


def retrieve_condition_meal_plans(condition):
    """Return meal-plan nodes directly recommended by a condition."""
    canonical = _CONDITION_ALIAS.get(condition.lower(), condition)
    plans = set()
    for node in fuzzy_find_nodes(condition_graph, canonical):
        if condition_graph.nodes[node].get("type") != "chronic_disease":
            continue
        for neighbor in condition_graph.neighbors(node):
            edge_data = condition_graph.get_edge_data(node, neighbor) or {}
            if (
                condition_graph.nodes[neighbor].get("type") == "meal_plan"
                and edge_data.get("relationship") in ("recommend", "recommends")
            ):
                plans.add(neighbor)
    return sorted(plans)


def retrieve_drug_foods(drug):
    avoid = set()
    notes = set()
    if drug in drug_graph.nodes:
        candidate_nodes = [drug]
    else:
        candidate_nodes = fuzzy_find_nodes(drug_graph, drug, score_cutoff=80)
    for node in candidate_nodes:
        if drug_graph.nodes[node].get("type") != "drug":
            continue
        for neighbor in drug_graph.neighbors(node):
            neighbor_str = str(neighbor).strip()
            if is_real_food(neighbor_str):
                avoid.add(neighbor_str)
            else:
                lower = neighbor_str.lower()
                for kw in FOOD_KEYWORDS:
                    if kw in lower:
                        avoid.add(kw)
                if any(
                    w in lower
                    for w in (
                        "avoid",
                        "alcohol",
                        "vitamin",
                        "grapefruit",
                        "dairy",
                        "acidic",
                        "food",
                    )
                ):
                    notes.add(neighbor_str)
    return sorted(avoid), sorted(notes)


def _fuzzy_lookup(token: str, vocab: list, cutoff: int):
    """Fuzzy-match a single token against a vocabulary; guards against short/common words."""
    if len(token) < 5 or token in _FUZZY_SKIP_WORDS:
        return None
    m = process.extractOne(token, vocab, scorer=fuzz.ratio, score_cutoff=cutoff)
    return m[0] if m else None


def detect_entities(text):
    text_lower = text.lower()
    conditions, drugs, allergies = [], [], []

    for cond in KNOWN_CONDITIONS:
        if cond in text_lower:
            conditions.append(cond)

    for common_name, graph_name in DRUG_SYNONYMS.items():
        if common_name in text_lower:
            drugs.append(graph_name)

    words = text_lower.split()
    bigrams = [f"{words[i]} {words[i+1]}" for i in range(len(words) - 1)]
    for token in words + bigrams:
        token = token.strip(".,?!")
        if token in DRUG_NODE_NAMES and DRUG_NODE_NAMES[token] not in drugs:
            drugs.append(DRUG_NODE_NAMES[token])

    # Fuzzy fallback for misspellings
    clean_words = [w.strip(".,?!") for w in words]
    if not conditions:
        for w in clean_words:
            hit = _fuzzy_lookup(w, KNOWN_CONDITIONS, cutoff=85)
            if hit and hit not in conditions:
                conditions.append(hit)
    if not drugs:
        _drug_vocab = list(DRUG_SYNONYMS.keys()) + list(DRUG_NODE_NAMES.keys())
        for w in clean_words:
            hit = _fuzzy_lookup(w, _drug_vocab, cutoff=80)
            if hit:
                canonical = DRUG_SYNONYMS.get(hit) or DRUG_NODE_NAMES.get(hit)
                if canonical and canonical not in drugs:
                    drugs.append(canonical)

    for allergy in KNOWN_ALLERGIES:
        if allergy in text_lower:
            allergies.append(allergy)

    return conditions, list(dict.fromkeys(drugs)), allergies


def build_kg_context(message, entities=None):
    """Build Knowledge Graph context string for the LLM.
    Pass entities=(conditions, drugs, allergies) to include session-history entities."""
    conditions, drugs, allergies = entities if entities else detect_entities(message)
    context_parts = []

    for cond in conditions:
        canonical = _CONDITION_ALIAS.get(cond.lower(), cond.title())
        meal_plans = retrieve_condition_meal_plans(cond)
        rec, avoid = retrieve_condition_foods(cond)
        parts = []
        if meal_plans:
            parts.append(f"Recommended meal plans: {', '.join(meal_plans)}")
        if rec:
            parts.append(f"Recommended foods: {', '.join(rec[:15])}")
        if avoid:
            parts.append(f"Foods to avoid: {', '.join(avoid[:15])}")
        diet_note = _CONDITION_DIET_NOTES.get(canonical, "")
        if diet_note:
            parts.append(f"Dietary guidance: {diet_note}")
        if parts:
            context_parts.append(
                f"[Knowledge Graph - {canonical}]\n" + "\n".join(parts)
            )

    for drug in drugs:
        avoid_foods, drug_notes = retrieve_drug_foods(drug)
        verified = medication_guidance({"medications": [drug]})[0]
        if avoid_foods or drug_notes or verified["verified"]:
            lines = [f"[Knowledge Graph - {drug} interactions]"]
            if verified["verified"]:
                for guidance_type, message in verified["guidance"]:
                    lines.append(f"Verified {guidance_type} guidance: {message}")
                if verified["excluded_terms"]:
                    lines.append(
                        "Automatically excluded terms: "
                        + ", ".join(verified["excluded_terms"])
                    )
                lines.append(f"Rule source: {verified['source']}")
            else:
                references = avoid_foods + drug_notes
                lines.append(
                    "Unverified knowledge-graph reference (do not turn into an automatic ban): "
                    + " | ".join(references[:6])
                )
            context_parts.append("\n".join(lines))

    for allergy in allergies:
        rec, avoid = retrieve_condition_foods(allergy)
        if rec or avoid:
            context_parts.append(
                f"[Knowledge Graph - {allergy.title()}]\n"
                f"Safe alternatives: {', '.join(rec[:10]) if rec else 'none found'}\n"
                f"Foods to avoid: {', '.join(avoid[:10]) if avoid else 'none found'}"
            )

    if context_parts:
        print(f"[INFO] KG context: conditions={conditions}, drugs={drugs}")
        return "\n\n".join(context_parts)

    return ""
