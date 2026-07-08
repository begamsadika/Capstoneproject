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

# ── Condition knowledge ──────────────────────────────────────────────────────

KNOWN_CONDITIONS = [
    "diabetes", "hypertension", "heart disease", "obesity",
    "high blood pressure", "cardiac", "overweight", "sugar",
    "pcos", "polycystic ovary", "polycystic ovarian", "pcod",
    "hypothyroidism", "hyperthyroidism", "thyroid", "underactive thyroid", "overactive thyroid",
]

# Canonical mapping: detected term → graph node name
_CONDITION_ALIAS = {
    "pcos":                    "PCOS",
    "pcod":                    "PCOS",
    "polycystic ovary":        "PCOS",
    "polycystic ovarian":      "PCOS",
    "hypothyroidism":          "Hypothyroidism",
    "underactive thyroid":     "Hypothyroidism",
    "hyperthyroidism":         "Hyperthyroidism",
    "overactive thyroid":      "Hyperthyroidism",
    "thyroid":                 "Hypothyroidism",   # default thyroid → hypothyroid
}

# Evidence-based dietary notes injected into LLM context
_CONDITION_DIET_NOTES = {
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

KNOWN_ALLERGIES = ["gluten intolerance", "nut allergy", "lactose intolerance"]

# ── Drug knowledge ───────────────────────────────────────────────────────────

DRUG_SYNONYMS = {
    # ── International brand names ──────────────────────────────
    "aspirin":          "Acetylsalicylic acid",
    "tylenol":          "Acetaminophen",
    "paracetamol":      "Acetaminophen",
    "panadol":          "Acetaminophen",
    "advil":            "Ibuprofen",
    "motrin":           "Ibuprofen",
    "brufen":           "Ibuprofen",
    "blood thinner":    "Warfarin",
    "blood thinners":   "Warfarin",
    "anticoagulant":    "Warfarin",
    "coumadin":         "Warfarin",
    "insulin":          "Insulin",
    "synthroid":        "Levothyroxine",
    "lipitor":          "Atorvastatin",
    "zocor":            "Simvastatin",
    "prinivil":         "Lisinopril",
    "zestril":          "Lisinopril",
    "glucophage":       "Metformin",
    # ── Sri Lankan brand names ─────────────────────────────────
    "gluconil":         "Metformin",
    "metspan":          "Metformin",
    "diabex":           "Metformin",
    "diaformin":        "Metformin",
    "formet":           "Metformin",
    "cardiprin":        "Acetylsalicylic acid",
    "ecosprin":         "Acetylsalicylic acid",
    "disprin":          "Acetylsalicylic acid",
    "atorva":           "Atorvastatin",
    "tonact":           "Atorvastatin",
    "lipvas":           "Atorvastatin",
    "simcard":          "Simvastatin",
    "zivast":           "Simvastatin",
    "amlodipine":       "Amlodipine",
    "amlopin":          "Amlodipine",
    "amcard":           "Amlodipine",
    "stamlo":           "Amlodipine",
    "listril":          "Lisinopril",
    "warf":             "Warfarin",
    "glibenclamide":    "Glibenclamide",
    "daonil":           "Glibenclamide",
    "semi-daonil":      "Glibenclamide",
    "gliclazide":       "Gliclazide",
    "diamicron":        "Gliclazide",
    "omeprazole":       "Omeprazole",
    "losec":            "Omeprazole",
    "thyroxine":        "Levothyroxine",
    "eltroxin":         "Levothyroxine",
}

DRUG_NODE_NAMES = {
    str(n).lower(): str(n)
    for n, d in drug_graph.nodes(data=True)
    if d.get("type") == "drug"
}

NON_FOOD_PREFIXES = (
    "take ", "avoid ", "do not", "consult", "monitor",
    "this drug", "may ", "can ", "should ", "it is",
    "and ", "increasing", "reducing",
)

FOOD_KEYWORDS = [
    "garlic", "ginger", "alcohol", "grapefruit", "vitamin k", "spinach", "kale",
    "broccoli", "dairy", "milk", "green tea", "caffeine", "soy", "calcium",
    "fiber", "licorice", "bran", "coffee", "orange juice", "pomelo",
    "st. john's wort", "leafy vegetables", "potassium", "sodium",
]

DRUG_SUPPLEMENTAL_NOTES = {
    "Atorvastatin": (
        "Avoid alcohol — increases liver damage risk with statins. "
        "Avoid high-fat and fatty foods — counteract the cholesterol-lowering effect. "
        "Avoid grapefruit and grapefruit juice."
    ),
    "Lisinopril": (
        "Restrict sodium and salt intake — critical for blood pressure control. "
        "Avoid excess potassium-rich foods (bananas, oranges) as Lisinopril raises potassium. "
        "Avoid alcohol."
    ),
    "Amoxicillin": (
        "Avoid alcohol — impairs immune response and reduces antibiotic effectiveness. "
        "Avoid acidic foods and drinks (citrus, vinegar, carbonated sodas) — reduce absorption. "
        "Dairy products such as milk and yogurt may interfere with absorption. "
        "Take with food to reduce stomach upset."
    ),
    "Warfarin": (
        "Avoid foods high in vitamin K: spinach, kale, broccoli, collard greens. "
        "Avoid alcohol — increases bleeding risk. "
        "Avoid grapefruit."
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
        "Avoid soy products — interfere with absorption. "
        "Avoid calcium-rich foods and supplements within 4 hours of dose. "
        "Avoid high-fiber foods close to dose time. "
        "Avoid coffee within 30 minutes of dose."
    ),
    "Ibuprofen": (
        "Always take with food to protect the stomach lining. "
        "Avoid alcohol — increases risk of stomach bleeding."
    ),
    "Acetylsalicylic acid": (
        "Avoid alcohol — increases gastrointestinal bleeding risk. "
        "Limit garlic, ginger, green tea — antiplatelet effects increase bleeding risk."
    ),
}

# ── Fuzzy guard list — tokens that must not be treated as conditions/drugs ───
_FUZZY_SKIP_WORDS = {
    "should", "would", "could", "please", "suggest", "recommend",
    "breakfast", "dinner", "eating", "foods", "meals", "healthy",
    "weight", "calorie", "calories", "protein", "vitamin", "vitamins",
    "morning", "evening", "tonight", "today", "avoid", "taking",
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
    recommended, avoid = set(), set()
    canonical = _CONDITION_ALIAS.get(condition.lower(), condition)
    matched = fuzzy_find_nodes(condition_graph, canonical)
    for node in matched:
        for neighbor in condition_graph.neighbors(node):
            edge_data = condition_graph.get_edge_data(node, neighbor)
            rel = edge_data.get("relationship", "")
            ntype = dict(condition_graph.nodes[neighbor]).get("type", "")
            if ntype in ("food", "ingredient"):
                if rel == "recommend":
                    recommended.add(neighbor)
                elif rel == "avoid":
                    avoid.add(neighbor)
    return sorted(recommended), sorted(avoid)


def retrieve_drug_foods(drug):
    avoid = set()
    notes = set()
    if drug in drug_graph.nodes:
        candidate_nodes = [drug]
    else:
        candidate_nodes = fuzzy_find_nodes(drug_graph, drug, score_cutoff=85)
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
                if any(w in lower for w in ("avoid", "alcohol", "vitamin", "grapefruit", "dairy", "acidic", "food")):
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
            hit = _fuzzy_lookup(w, _drug_vocab, cutoff=88)
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
        rec, avoid = retrieve_condition_foods(cond)
        parts = []
        if rec:
            parts.append(f"Recommended foods: {', '.join(rec[:15])}")
        if avoid:
            parts.append(f"Foods to avoid: {', '.join(avoid[:15])}")
        diet_note = _CONDITION_DIET_NOTES.get(canonical, "")
        if diet_note:
            parts.append(f"Dietary guidance: {diet_note}")
        if parts:
            context_parts.append(f"[Knowledge Graph - {canonical}]\n" + "\n".join(parts))

    for drug in drugs:
        avoid_foods, drug_notes = retrieve_drug_foods(drug)
        supplemental = DRUG_SUPPLEMENTAL_NOTES.get(drug, "")
        if avoid_foods or drug_notes or supplemental:
            lines = [f"[Knowledge Graph - {drug} interactions]"]
            if avoid_foods:
                lines.append(f"Foods/substances to avoid: {', '.join(avoid_foods[:12])}")
            if supplemental:
                lines.append(f"Clinical notes: {supplemental}")
            elif drug_notes:
                lines.append(f"Dietary notes: {' | '.join(drug_notes[:4])}")
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
