# api.py
import os
import re
import json
import pickle
import pathlib

import pandas as pd
import networkx as nx
from rapidfuzz import process, fuzz

from typing import List, AsyncGenerator, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

# ─── Load .env ───────────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv()

OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
API_PORT        = int(os.getenv("API_PORT", "8000"))

# ============================================================
# LOAD KNOWLEDGE GRAPHS
# ============================================================

drug_graph = nx.read_graphml(
    os.path.join("DataSets", "drug_food_knowledge_graph.graphml")
)

with open("enhanced_diet_knowledge_graph.gpickle", "rb") as f:
    condition_graph = pickle.load(f)

print(f"[INFO] Drug graph      -> {len(drug_graph.nodes)} nodes, {len(drug_graph.edges)} edges")
print(f"[INFO] Condition graph -> {len(condition_graph.nodes)} nodes, {len(condition_graph.edges)} edges")
print(f"[INFO] Model: {OLLAMA_MODEL} @ {OLLAMA_BASE_URL}")

# ============================================================
# LOAD FOOD DATABASE
# ============================================================
_FOOD_CSV = os.path.join("DataSets", "food_ingredient_my.csv")
# Non-veg keywords for diet_type derivation (foods whose name implies non-vegetarian)
_NON_VEG_KEYWORDS = [
    "fish", "prawn", "chicken", "mutton", "beef", "pork", "crab", "squid",
    "tuna", "sardine", "shrimp", "lamb", "duck", "turkey", "anchovy",
    "lobster", "oyster", "clam", "mussel", "maldive",
]

def _derive_diet_type(row) -> str:
    """
    Derive a single diet_type label for a food item from its dietary_tags,
    category, and name. Priority: tags > category > name keywords > default.
    Labels: "vegan" | "vegetarian" | "pescatarian" | "non-veg"
    """
    tags = (row.get("dietary_tags") or "").lower()
    cat  = (row.get("category")     or "").lower()
    name = (row.get("food_item")    or "").lower()
    # 1. Explicit tag wins
    if "vegan" in tags:
        return "vegan"
    if "vegetarian" in tags:
        return "vegetarian"
    if "pescatarian" in tags:
        return "pescatarian"
    # 2. Category inference
    if "poultry" in cat or "meat" in cat:
        return "non-veg"
    if "seafood" in cat:
        return "pescatarian"
    # 3. Name keyword inference
    for _kw in _NON_VEG_KEYWORDS:
        if _kw in name:
            return "non-veg" if _kw not in ("fish", "prawn", "shrimp", "crab", "squid",
                                             "tuna", "sardine", "anchovy", "lobster",
                                             "oyster", "clam", "mussel", "maldive") else "pescatarian"
    # 4. Default: assume vegetarian
    return "vegetarian"

try:
    _food_df = pd.read_csv(_FOOD_CSV)
    food_df  = _food_df   # alias used in helper functions
    # ── Derive diet_type from dietary_tags + category + name ─────────────
    if "dietary_tags" in _food_df.columns:
        _food_df["diet_type"] = _food_df.apply(_derive_diet_type, axis=1)
        food_df = _food_df
        _dt_counts = _food_df["diet_type"].value_counts().to_dict()
        print(f"[INFO] Food DB -> {len(_food_df)} items | diet_type: {_dt_counts}")
    else:
        print(f"[INFO] Food DB -> {len(_food_df)} items, {len(_food_df.columns)} columns")
except Exception as _e:
    print(f"[WARN] Could not load food CSV: {_e}")
    _food_df = pd.DataFrame()
    food_df  = _food_df

# ============================================================
# CONSTANTS
# ============================================================

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
    # Metformin (diabetes)
    "gluconil":         "Metformin",
    "metspan":          "Metformin",
    "diabex":           "Metformin",
    "diaformin":        "Metformin",
    "formet":           "Metformin",
    # Aspirin / antiplatelet
    "cardiprin":        "Acetylsalicylic acid",
    "ecosprin":         "Acetylsalicylic acid",
    "disprin":          "Acetylsalicylic acid",
    # Atorvastatin (cholesterol)
    "atorva":           "Atorvastatin",
    "tonact":           "Atorvastatin",
    "lipvas":           "Atorvastatin",
    # Simvastatin
    "simcard":          "Simvastatin",
    "zivast":           "Simvastatin",
    # Amlodipine (hypertension)
    "amlodipine":       "Amlodipine",
    "amlopin":          "Amlodipine",
    "amcard":           "Amlodipine",
    "stamlo":           "Amlodipine",
    # Lisinopril
    "listril":          "Lisinopril",
    # Warfarin
    "warf":             "Warfarin",
    # Glibenclamide (diabetes — widely used in Sri Lanka)
    "glibenclamide":    "Glibenclamide",
    "daonil":           "Glibenclamide",
    "semi-daonil":      "Glibenclamide",
    # Gliclazide
    "gliclazide":       "Gliclazide",
    "diamicron":        "Gliclazide",
    # Omeprazole (common co-prescription)
    "omeprazole":       "Omeprazole",
    "losec":            "Omeprazole",
    # Levothyroxine (thyroid)
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

# ============================================================
# HELPERS
# ============================================================

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


# ============================================================
# RETRIEVAL FUNCTIONS
# ============================================================

def retrieve_condition_foods(condition):
    recommended, avoid = set(), set()
    # Resolve alias first (e.g. "pcos" → "PCOS")
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


# Tokens that must never fuzzy-match a condition or drug name
_FUZZY_SKIP_WORDS = {
    "should", "would", "could", "please", "suggest", "recommend",
    "breakfast", "dinner", "eating", "foods", "meals", "healthy",
    "weight", "calorie", "calories", "protein", "vitamin", "vitamins",
    "morning", "evening", "tonight", "today", "avoid", "taking",
}

def _fuzzy_lookup(token: str, vocab: list, cutoff: int):
    """Fuzzy-match a single token against a vocabulary; returns the matched
    vocab entry or None. Guards against short/common words to avoid false hits."""
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

    # Fuzzy fallback: catch misspellings ("diabetis", "warfrin") that exact
    # matching missed, so KG retrieval still fires instead of silently failing.
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
    # entities: optional pre-detected (conditions, drugs, allergies) tuple —
    # lets callers include session history, not just the current message.
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
        # Add evidence-based dietary note if available
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


# ============================================================
# LLM
# ============================================================

_llm_kwargs = dict(
    model=OLLAMA_MODEL,
    temperature=0.2,
    base_url=OLLAMA_BASE_URL,
)
# Reasoning models (qwen3, deepseek-r1) emit <think>...</think> blocks before
# answering — very slow on CPU and they leak into the chat UI. Disable at the
# Ollama level so thinking tokens are never generated. Instruct variants never
# think, and passing the flag to them can error — so skip those.
_model_lower = OLLAMA_MODEL.lower()
if _model_lower.startswith(("qwen3", "deepseek-r1")) and "instruct" not in _model_lower:
    _llm_kwargs["reasoning"] = False

llm = ChatOllama(**_llm_kwargs)

_THINK_RE = re.compile(r"<think>.*?</think>\s*", re.DOTALL)

def strip_think(text: str) -> str:
    """Remove <think>...</think> reasoning blocks from a complete response."""
    return _THINK_RE.sub("", text).lstrip()

SYSTEM_PROMPT = """You are Wellora, a dietary recommendation assistant for patients managing medical conditions and medications.

RULES:
1. ALWAYS provide a specific, helpful response. Never say "I can't provide dietary advice."

2. Match your response LENGTH AND CONTENT strictly to the question type — do NOT add unrequested sections:

   A) Factual profile questions AND general nutrition questions:

      A1) Profile stats — questions about the user's own numbers:
          Examples: "what is my BMI?", "what is my weight?", "what is my calorie target?", "is my BMI healthy?"
          → Answer in 1-3 sentences using the Patient Health Profile numbers.
          → STOP. Do NOT append food lists, meal ideas, or tips.

      A2) General nutrition / health questions — educational or advisory questions:
          Examples: "what vitamins should I take?", "how much water should I drink?", "what is protein?",
                    "what foods have iron?", "is sugar bad?", "what does fibre do?"
          → Answer helpfully in 2-4 sentences with practical advice relevant to the user's profile.
          → STOP. Do NOT append a full meal plan or food list at the end.

   B) Meal suggestion questions:
      Examples: "what should I eat today?", "suggest meals", "give me a meal plan", "what to eat?"
      → Use the [Suggested Foods by Meal Slot] section ONLY. Do NOT invent foods not in that list.
      → Format: **Breakfast** / **Lunch** / **Dinner** / **Snacks** with kcal targets.

   C) Condition/medication questions:
      Examples: "I have diabetes", "I take warfarin", "foods to avoid with my medication"
      → Include food interactions from the Knowledge Graph Data plus a brief Recommended / Avoid list.
      → Do NOT append general meal suggestions unless explicitly asked.

   D) Specific meal slot questions:
      Examples: "what should I eat for breakfast?", "dinner ideas", "lunch options"
      → Answer only the requested slot using [Suggested Foods by Meal Slot]. Do NOT add other slots.

3. CRITICAL — Pre-calculated values: If context contains a [Pre-calculated Goal] section, use ONLY those numbers. Do NOT recalculate.
4. Always respect dietary preference — never suggest meat/seafood for vegetarian, never dairy for vegan.
5. Never suggest foods the user is allergic to.
6. When Knowledge Graph Data is present, always include those specific food interactions.
7. Use actual numbers from the Patient Health Profile in your response."""


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(title="Wellora Diet Chat Bot API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    condition: str = ""  # optional: diabetes, hypertension, etc.

def query_ollama(prompt: str) -> str:
    url = "http://localhost:11434/api/generate"
    response = requests.post(url, json={
        "model": "llama3.2:3b",
        "prompt": prompt,
        "stream": False
    })
    return response.json().get("response", "Sorry, I couldn't generate a response.")

@app.post("/chat")
    history: List[Message] = []
    user_metrics: Optional[dict] = None
    calorie_target_override: Optional[int] = None  # set by frontend after a weight goal calculation
    user_name: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str


# ── User metrics helpers ──────────────────────────────────

_ALLERGY_CANONICAL = {
    "nut":      ["nut", "nuts", "peanut", "cashew", "almond", "walnut", "pistachio",
                 "tree nut", "nut allergy", "nutd", "nutes", "nuss", "nuts allergy"],
    "dairy":    ["dairy", "milk", "lactose", "lactose intolerance", "dairy allergy",
                 "milk allergy", "lactos", "diry", "dairi"],
    "gluten":   ["gluten", "wheat", "gluten intolerance", "celiac", "coeliac",
                 "gluten free", "gluten-free", "gluton", "glouten"],
    "seafood":  ["seafood", "fish", "shellfish", "prawn", "shrimp", "crab",
                 "seafood allergy", "fish allergy"],
    "egg":      ["egg", "eggs", "egg allergy"],
    "soy":      ["soy", "soya", "soy allergy", "soya allergy"],
}

_ALLERGY_FLAT = {variant: canonical
                 for canonical, variants in _ALLERGY_CANONICAL.items()
                 for variant in variants}


def normalise_allergy(term: str) -> str:
    """Map a raw allergy string to a canonical type using exact then fuzzy matching."""
    t = term.strip().lower()
    if t in _ALLERGY_FLAT:
        return _ALLERGY_FLAT[t]
    # Fuzzy fallback — score ≥ 80 counts as a match
    all_variants = list(_ALLERGY_FLAT.keys())
    result = process.extractOne(t, all_variants, scorer=fuzz.WRatio)
    if result and result[1] >= 80:
        return _ALLERGY_FLAT[result[0]]
    return t  # return original if no confident match


def parse_allergy_string(allergy_str: str) -> list:
    """Split a comma-separated allergy string and normalise each entry."""
    if not allergy_str:
        return []
    raw = [a.strip().lower() for a in allergy_str.split(",") if a.strip()]
    return list(dict.fromkeys(normalise_allergy(a) for a in raw))


# Canonical allergen type → tag(s) in the allergens column
_ALLERGEN_COLUMN_MAP = {
    "nut":      ["nuts"],
    "dairy":    ["dairy"],
    "gluten":   ["gluten"],
    "seafood":  ["fish", "shellfish"],   # seafood covers both
    "fish":     ["fish"],
    "shellfish": ["shellfish"],
    "egg":      ["egg"],
    # soy not in allergens column — handled via ingredient fallback
}

def apply_allergy_filter(df, allergies: list):
    """
    Filter the food dataframe by the user's allergen list.
    Uses the pre-computed 'allergens' column when available;
    falls back to ingredient/category keyword search for soy.
    """
    if not allergies:
        return df
    has_col = "allergens" in df.columns
    for allergy in allergies:
        if has_col and allergy in _ALLERGEN_COLUMN_MAP:
            tags = _ALLERGEN_COLUMN_MAP[allergy]
            pattern = "|".join(tags)
            df = df[~df["allergens"].str.contains(pattern, na=False)]
        elif allergy == "soy":
            df = df[~df["main_ingredients"].str.contains("soy|soya", case=False, na=False)]
        elif not has_col:
            # Legacy fallback if allergens column absent
            if allergy == "nut":
                df = df[~df["category"].str.contains("Nuts & Seeds", case=False, na=False)]
                df = df[~df["main_ingredients"].str.contains(
                    "cashew|peanut|walnut|almond|pistachio", case=False, na=False)]
            elif allergy == "dairy":
                df = df[~df["category"].str.contains("Dairy", case=False, na=False)]
            elif allergy == "gluten":
                df = df[df["dietary_tags"].str.contains("Gluten-Free", case=False, na=False)]
            elif allergy == "seafood":
                df = df[~df["category"].str.contains("Seafood", case=False, na=False)]
            elif allergy == "egg":
                df = df[~df["main_ingredients"].str.contains("egg", case=False, na=False)]
    return df


def infer_conditions_from_metrics(metrics: dict) -> list:
    """Infer additional conditions from BMI category and health goal."""
    inferred = []
    bmi_cat = (metrics.get("bmi_category") or "").lower()
    if "obese" in bmi_cat:
        inferred.append("obesity")
    elif "overweight" in bmi_cat:
        inferred.append("overweight")
    return inferred


def build_user_metrics_context(metrics: dict) -> str:
    """Format health metrics as a structured context block for the LLM."""
    if not metrics:
        return ""

    lines = ["[Patient Health Profile]"]

    if metrics.get("weight_kg"):
        lines.append(f"Current weight: {metrics['weight_kg']} kg")

    if metrics.get("height_cm"):
        lines.append(f"Height: {metrics['height_cm']} cm")

    if metrics.get("bmi"):
        bmi_cat = metrics.get("bmi_category", "")
        lines.append(f"BMI: {metrics['bmi']} — {bmi_cat}")

    if metrics.get("health_goal"):
        lines.append(f"Health goal: {metrics['health_goal']}")

    if metrics.get("weight_to_goal_kg") is not None:
        lines.append(f"Weight to reach goal: {metrics['weight_to_goal_kg']} kg")

    if metrics.get("estimated_weeks_to_goal") is not None:
        lines.append(f"Estimated weeks to goal: {metrics['estimated_weeks_to_goal']}")

    if metrics.get("target_calories"):
        lines.append(f"Daily calorie target: {metrics['target_calories']} cal")

    if metrics.get("maintenance_calories"):
        lines.append(f"Maintenance calories: {metrics['maintenance_calories']} cal")

    macro_parts = []
    if metrics.get("protein_target_g"):
        macro_parts.append(f"protein {metrics['protein_target_g']}g")
    if metrics.get("carbs_target_g"):
        macro_parts.append(f"carbs {metrics['carbs_target_g']}g")
    if metrics.get("fat_target_g"):
        macro_parts.append(f"fat {metrics['fat_target_g']}g")
    if macro_parts:
        lines.append(f"Daily macro targets: {', '.join(macro_parts)}")

    if metrics.get("activity_level"):
        lines.append(f"Activity level: {metrics['activity_level']}")

    if metrics.get("dietary_preference"):
        lines.append(f"Dietary preference: {metrics['dietary_preference']}")

    if metrics.get("allergies"):
        lines.append(f"Allergies (from profile): {metrics['allergies']}")

    return "\n".join(lines)


def get_meal_slotted_foods(metrics: dict) -> str:
    """
    Filter the food DB by the user's dietary preference and allergies,
    then split into Breakfast / Lunch / Dinner / Snack slots with calorie budgets.
    """
    try:
        df = _food_df.copy()
    except Exception:
        return ""

    # 1. Dietary preference filter
    pref = (metrics.get("dietary_preference") or "").lower()
    if "vegan" in pref:
        df = df[~df["category"].str.contains("Poultry & Meat|Seafood|Dairy", case=False, na=False)]
        df = df[df["dietary_tags"].str.contains("Vegan", case=False, na=False)]
    elif "veg" in pref:
        df = df[~df["category"].str.contains("Poultry & Meat|Seafood", case=False, na=False)]

    # 2. Remove condiments — they are sides, not standalone meal suggestions
    if "meal_type" in df.columns:
        df = df[df["meal_type"] != "condiment"]

    # 3. Allergy filter — uses pre-computed allergens column
    allergies = parse_allergy_string(metrics.get("allergies", "") or "")
    df = apply_allergy_filter(df, allergies)

    # 4. Calorie split (25 / 35 / 30 / 10)
    target_cal = int(metrics.get("target_calories") or 2000)
    splits = {
        "Breakfast": round(target_cal * 0.25),
        "Lunch":     round(target_cal * 0.35),
        "Dinner":    round(target_cal * 0.30),
        "Snack":     round(target_cal * 0.10),
    }

    # 5. Build per-slot food lists
    lines = ["[Suggested Foods by Meal Slot]"]
    for slot, budget in splits.items():
        meal_type_filter = (
            ["lunch_dinner", "any"] if slot in ("Lunch", "Dinner")
            else [slot.lower(), "any"]
        )
        slot_df = df[df["meal_type"].isin(meal_type_filter)].copy() if "meal_type" in df.columns else df.copy()
        # Pick 5 items whose calories are closest to budget ÷ 2 (mix of items per meal)
        per_item = budget / 2
        slot_df["_diff"] = abs(slot_df["calories"] - per_item)
        top = slot_df.sort_values("_diff").head(5)
        foods = ", ".join(
            f"{r['food_item']} ({r['calories']} cal)" for _, r in top.iterrows()
        )
        lines.append(f"{slot} (~{budget} kcal target): {foods}")

    return "\n".join(lines)


# Cache the last generated meal plan so detail requests can look up real data
_plan_cache: dict = {}
_weekly_plan: dict = {}   # keyed "Day 1" ... "Day 7"
_DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Disk-backed cache so plan survives server reloads
_CACHE_FILE = pathlib.Path(__file__).parent / "DataSets" / ".meal_plan_cache.json"


def _persist_cache() -> None:
    """Write _plan_cache to disk."""
    try:
        _CACHE_FILE.write_text(json.dumps(_plan_cache, default=str))
    except Exception:
        pass


def _load_cache_from_disk() -> dict:
    """Read plan cache from disk (fallback after server reload)."""
    try:
        if _CACHE_FILE.exists():
            return json.loads(_CACHE_FILE.read_text())
    except Exception:
        pass
    return {}


# ── Disliked-food preference memory ───────────────────────────────────────────
_disliked_foods: set = set()
_DISLIKE_FILE = pathlib.Path(__file__).parent / "DataSets" / ".disliked_foods.json"

def _load_disliked() -> None:
    global _disliked_foods
    try:
        if _DISLIKE_FILE.exists():
            _disliked_foods = set(json.loads(_DISLIKE_FILE.read_text()))
    except Exception:
        pass

def _save_disliked() -> None:
    try:
        _DISLIKE_FILE.write_text(json.dumps(list(_disliked_foods)))
    except Exception:
        pass

_load_disliked()  # load on startup

# Also fix missing alias used in bypass 3
_save_cache_to_disk = _persist_cache

_DISLIKE_PATTERNS = [
    r"(?:i\s+)?(?:don'?t|do not|never)\s+(?:like|eat|want|enjoy|prefer)\s+(.+)",
    r"(?:i\s+)?(?:hate|dislike|despise|detest)\s+(.+)",
    r"(?:i'?m\s+)?not\s+(?:a\s+fan\s+of|fond\s+of|into)\s+(.+)",
    r"(?:please\s+)?(?:no|avoid|skip|remove|exclude)\s+(.+?)(?:\s+please)?$",
    r"(?:i\s+)?can'?t\s+stand\s+(.+)",
]
_LIKE_PATTERNS = [
    r"(?:i\s+)?(?:like|love|enjoy|want|prefer)\s+(.+)",
    r"(?:add|include|bring back)\s+(.+?)(?:\s+back)?(?:\s+please)?$",
    r"(?:i\s+)?(?:don'?t\s+mind|am\s+ok\s+with|am\s+fine\s+with)\s+(.+)",
]

def detect_food_preference(message: str):
    """
    Returns ('dislike', food_name), ('like', food_name), or (None, None).
    Fuzzy-matches the extracted term against food_df.
    """
    msg = message.strip().lower()

    for pat in _DISLIKE_PATTERNS:
        m = _re.search(pat, msg)
        if m:
            candidate = m.group(1).strip().rstrip(".,!?")
            matched = fuzzy_match_food(candidate)
            if matched:
                return "dislike", matched

    for pat in _LIKE_PATTERNS:
        m = _re.search(pat, msg)
        if m:
            candidate = m.group(1).strip().rstrip(".,!?")
            matched = fuzzy_match_food(candidate)
            if matched:
                return "like", matched

    return None, None

def fuzzy_match_food(candidate: str) -> str | None:
    """Return best-matching food_item name from the DB, or None if no good match."""
    from rapidfuzz import process as _rfp
    names = list(food_df["food_item"])
    result = _rfp.extractOne(candidate, names, score_cutoff=72)
    if result:
        return result[0]
    return None


# ── Meal logging ───────────────────────────────────────────────────────────────
import datetime as _dt

_meal_log: list = []          # [{"date","slot","food","calories","logged_at"}, ...]
_LOG_FILE = pathlib.Path(__file__).parent / "DataSets" / ".meal_log.json"

def _load_meal_log() -> None:
    global _meal_log
    try:
        if _LOG_FILE.exists():
            _meal_log = json.loads(_LOG_FILE.read_text())
    except Exception:
        pass

def _save_meal_log() -> None:
    try:
        _LOG_FILE.write_text(json.dumps(_meal_log[-200:]))  # keep last 200 entries
    except Exception:
        pass

_load_meal_log()

_LOG_PATTERNS = [
    r"(?:i\s+)?(?:just\s+)?(?:ate|had|consumed|finished)\s+(.+?)(?:\s+for\s+(\w+))?$",
    r"log\s+(.+?)(?:\s+(?:for|as)\s+(\w+))?(?:\s+please)?$",
    r"(?:i\s+)?(?:ate|had)\s+option\s+([123])(?:\s+for\s+(\w+))?",
    r"record\s+(?:my\s+)?(.+?)(?:\s+for\s+(\w+))?(?:\s+please)?$",
]
_LOG_SUMMARY_PATTERNS = [
    "what did i eat", "what have i eaten", "show my", "food log",
    "my log", "calorie log", "how many calories did i", "calories today",
    "what i ate", "daily log", "meal history", "show log",
]

_SLOT_WORDS = {"breakfast", "lunch", "dinner", "snack"}

def detect_log_request(message: str):
    """Returns (food_or_option, slot) or (None, None)."""
    msg = message.strip().lower()
    trigger_words = ["ate", "had", "consumed", "finished eating", "just ate",
                     "just had", "log ", "record "]
    if not any(w in msg for w in trigger_words):
        return None, None
    # Don't intercept plan/suggestion requests
    if any(w in msg for w in ["what should", "suggest", "recommend", "plan", "give me"]):
        return None, None
    for pat in _LOG_PATTERNS:
        m = _re.search(pat, msg)
        if m:
            item = m.group(1).strip().rstrip(".,!?")
            slot_raw = (m.group(2) or "").strip()
            slot = slot_raw.capitalize() if slot_raw in _SLOT_WORDS else None
            return item, slot
    return None, None

def detect_log_summary_request(message: str) -> bool:
    msg = message.strip().lower()
    return any(p in msg for p in _LOG_SUMMARY_PATTERNS)

def _calories_for_food(name: str) -> int | None:
    rows = food_df[food_df["food_item"] == name]
    if not rows.empty:
        return int(rows.iloc[0]["calories"])
    return None

def _log_option(opt_n: int, slot: str | None) -> list:
    """Log all foods from a cached option. Returns list of logged entries."""
    logged = []
    today = _dt.date.today().isoformat()
    # Find the option in cache
    search_slots = [slot] if slot else list(_plan_cache.keys())
    for sl in search_slots:
        if sl not in _plan_cache or "options" not in _plan_cache[sl]:
            continue
        opts = _plan_cache[sl]["options"]
        if opt_n <= len(opts):
            for fd in opts[opt_n - 1]["foods"]:
                entry = {
                    "date": today, "slot": sl,
                    "food": fd["name"], "calories": fd["calories"],
                    "logged_at": _dt.datetime.now().isoformat(timespec="minutes"),
                }
                _meal_log.append(entry)
                logged.append(entry)
            break
    return logged

def format_log_summary() -> str:
    today = _dt.date.today().isoformat()
    today_entries = [e for e in _meal_log if e.get("date") == today]
    if not today_entries:
        return "No meals logged today yet. Say *'I ate Kiribath for breakfast'* to start logging!"
    total_cal = sum(e.get("calories", 0) for e in today_entries)
    lines = [f"**Today's Food Log** ({today})\n"]
    by_slot = {}
    for e in today_entries:
        by_slot.setdefault(e.get("slot", "Other"), []).append(e)
    for slot in ("Breakfast", "Lunch", "Dinner", "Snack", "Other"):
        if slot not in by_slot:
            continue
        lines.append(f"  *{slot}:*")
        for e in by_slot[slot]:
            lines.append(f"    • {e['food']} — {e.get('calories','?')} cal")
    lines.append(f"\n**Total calories logged: {total_cal} kcal**")
    return "\n".join(lines)


# ── Food substitution ──────────────────────────────────────────────────────────
_SUBSTITUTION_PATTERNS = [
    r"replace\s+(.+?)\s+(?:with\s+something(?:\s+else)?|please)",
    r"swap(?:\s+out)?\s+(.+?)(?:\s+please)?$",
    r"(?:instead\s+of|not)\s+(.+?)(?:\s+please)?$",
    r"(?:substitute|change|switch)\s+(.+?)(?:\s+(?:with\s+something(?:\s+else)?|please))?$",
    r"(?:something|anything)\s+(?:else|different)\s+(?:instead\s+of|for|other\s+than)\s+(.+)",
    r"(?:can\s+i\s+have|give\s+me)\s+(?:something|anything)\s+(?:other\s+than|instead\s+of)\s+(.+)",
    r"(?:don'?t\s+(?:want|like))\s+(.+?)(?:\s+in\s+(?:my|the)\s+(?:meal|plan|option))?",
    r"remove\s+(.+?)\s+(?:from\s+(?:my|the)\s+(?:meal|option|plan))",
]

def detect_substitution_request(message: str):
    """Returns (food_name, opt_n) if message is asking to swap a food, else (None, None)."""
    msg = message.strip().lower()
    # Must contain a substitution intent word
    intent_words = ["replace", "swap", "substitute", "instead of", "something else",
                    "anything else", "change", "switch", "remove from", "other than"]
    if not any(w in msg for w in intent_words):
        return None, None

    for pat in _SUBSTITUTION_PATTERNS:
        m = _re.search(pat, msg)
        if m:
            candidate = m.group(1).strip().rstrip(".,!?")
            # Also check if option number mentioned
            opt_m = _re.search(r'\boption\s*([123])\b', msg)
            opt_n = int(opt_m.group(1)) if opt_m else None
            matched = fuzzy_match_food(candidate)
            if matched:
                return matched, opt_n
    return None, None


def _pick_substitute(food_name: str, slot: str, current_option: dict, metrics: dict) -> dict | None:
    """
    Find a replacement for food_name in the given slot.
    Returns a food dict (same structure as in options["foods"]) or None.
    """
    import random
    # Get the dish_role and calories of the food being replaced
    rows = food_df[food_df["food_item"] == food_name]
    if rows.empty:
        return None
    orig = rows.iloc[0]
    orig_role = orig.get("dish_role", "main")
    orig_cal  = float(orig["calories"])

    # Build candidate pool: same dish_role, same meal_type compatibility, ±40% calories
    if slot in ("Lunch", "Dinner"):
        pool = food_df[food_df["meal_type"].isin(["lunch_dinner", "any"])].copy()
    else:
        pool = food_df[food_df["meal_type"].isin([slot.lower(), "any"])].copy()

    if "dish_role" in pool.columns:
        pool = pool[pool["dish_role"] == orig_role]

    pool = pool[
        (pool["calories"] >= orig_cal * 0.6) &
        (pool["calories"] <= orig_cal * 1.4)
    ]

    # Exclude the original food, current option foods, and disliked foods
    current_names = {f["name"] for f in current_option["foods"]}
    pool = pool[~pool["food_item"].isin(current_names | _disliked_foods | {food_name})]

    if pool.empty:
        return None

    r = pool.sample(1, random_state=random.randint(0, 9999)).iloc[0]
    return {
        "name":            r["food_item"],
        "serving_size_g":  int(r["serving_size_g"])  if "serving_size_g"  in r.index and not pd.isna(r["serving_size_g"])  else None,
        "min_serving_g":   int(r["min_serving_g"])   if "min_serving_g"   in r.index and not pd.isna(r["min_serving_g"])   else None,
        "max_serving_g":   int(r["max_serving_g"])   if "max_serving_g"   in r.index and not pd.isna(r["max_serving_g"])   else None,
        "calories":        int(r["calories"]),
        "protein_g":       round(float(r["protein_g"]), 1),
        "carbs_g":         round(float(r["carbs_g"]),   1),
        "fat_g":           round(float(r["fat_g"]),     1),
        "gi":              int(r["gi"])            if "gi"            in r.index and not pd.isna(r["gi"])            else None,
        "gl":              round(float(r["gl"]),1) if "gl"            in r.index and not pd.isna(r["gl"])            else None,
        "gi_category":     str(r["gi_category"])   if "gi_category"   in r.index and not pd.isna(r["gi_category"])   else None,
        "prep_method":     str(r["prep_method"])   if "prep_method"   in r.index and not pd.isna(r["prep_method"])   else None,
        "sodium_mg":       int(r["sodium_mg"])     if "sodium_mg"     in r.index and not pd.isna(r["sodium_mg"])     else None,
        "sodium_category": str(r["sodium_category"]) if "sodium_category" in r.index and not pd.isna(r["sodium_category"]) else None,
        "fiber_g":         round(float(r["fiber_g"]),1) if "fiber_g"   in r.index and not pd.isna(r["fiber_g"])      else None,
    }


def build_meal_plan(target_calories: int, metrics: dict) -> dict:
    """
    Select foods from the DB for each meal slot and calculate EXACT macros
    from the CSV — no LLM estimation involved.
    Returns a structured dict with per-slot foods and totals.
    """
    import random
    df = _food_df.copy()

    # ── Dietary preference filter (uses KG-derived diet_type column) ────
    pref = (metrics.get("dietary_preference") or "").lower()
    # Precise checks: "non-veg"/"nonveg" must not match the "veg" branch
    _is_nonveg = any(p in pref for p in ("non-veg", "nonveg", "non veg"))
    _is_vegan  = "vegan" in pref and not _is_nonveg
    _is_veg    = "veg" in pref and not _is_vegan and not _is_nonveg
    if "diet_type" in df.columns:
        # Use the semantically-derived diet_type column
        if _is_vegan:
            _veg_f = df[df["diet_type"] == "vegan"]
            if len(_veg_f) >= 10:
                df = _veg_f
        elif _is_veg:
            # vegetarian = vegan + vegetarian (excludes pescatarian + non-veg)
            _veg_f = df[df["diet_type"].isin(["vegan", "vegetarian"])]
            if len(_veg_f) >= 10:
                df = _veg_f
        # non-veg: no filter — all foods available
    else:
        # Fallback: category-based filter if diet_type column not available
        if _is_vegan:
            df = df[~df["category"].str.contains("Poultry & Meat|Seafood|Dairy", case=False, na=False)]
        elif _is_veg:
            df = df[~df["category"].str.contains("Poultry & Meat|Seafood", case=False, na=False)]

    # Remove condiments
    if "meal_type" in df.columns:
        df = df[df["meal_type"] != "condiment"]

    # Allergy filter — uses pre-computed allergens column
    allergies = parse_allergy_string(metrics.get("allergies", "") or "")
    df = apply_allergy_filter(df, allergies)

    # Prep method filter — exclude cooking methods user wants to avoid
    _prep_exclude = metrics.get("_prep_exclude") or []
    if _prep_exclude and "prep_method" in df.columns:
        filtered = df[~df["prep_method"].isin(_prep_exclude)]
        if len(filtered) >= 10:   # only apply if enough foods remain
            df = filtered

    # Disliked food filter — exclude foods the user said they don't like
    if _disliked_foods:
        filtered_dl = df[~df["food_item"].isin(_disliked_foods)]
        if len(filtered_dl) >= 10:
            df = filtered_dl

    # ── Goal-aware calorie split ─────────────────────────────────────
    _hgoal     = (metrics.get("health_goal") or "").lower()
    _is_lose   = any(w in _hgoal for w in ("lose", "loss", "cut", "reduce"))
    _is_gain   = any(w in _hgoal for w in ("gain", "muscle", "bulk", "increase"))

    if _is_lose:
        # Smaller dinner; larger snack to curb hunger; strict budget
        splits = {
            "Breakfast": round(target_calories * 0.25),
            "Lunch":     round(target_calories * 0.35),
            "Dinner":    round(target_calories * 0.25),
            "Snack":     round(target_calories * 0.15),
        }
        _sa_tolerance = 0    # standalone must fit within budget exactly
    elif _is_gain:
        # Standard split; calorie surplus already baked into target_calories
        splits = {
            "Breakfast": round(target_calories * 0.25),
            "Lunch":     round(target_calories * 0.35),
            "Dinner":    round(target_calories * 0.30),
            "Snack":     round(target_calories * 0.10),
        }
        _sa_tolerance = 150  # allow denser standalones to hit calorie surplus
    else:
        # Maintain
        splits = {
            "Breakfast": round(target_calories * 0.25),
            "Lunch":     round(target_calories * 0.35),
            "Dinner":    round(target_calories * 0.30),
            "Snack":     round(target_calories * 0.10),
        }
        _sa_tolerance = 50

    N_OPTIONS = 3   # number of meal options per slot

    def pick_option(slot_df, budget, seed):
        """Pick 1 main + 1 appropriate side dish for a meal slot.
        Falls back to category-diversity picker if dish_role column is absent."""
        has_roles = "dish_role" in slot_df.columns

        if has_roles:
            main_df       = slot_df[slot_df["dish_role"] == "main"]
            side_df       = slot_df[slot_df["dish_role"] == "side"]
            standalone_df = slot_df[slot_df["dish_role"] == "standalone"]

            # ── Try: 1 main + 1 preferred side ───────────────────────────
            if len(main_df) > 0 and len(side_df) > 0:
                main_item = main_df.sample(1, random_state=seed).iloc[0]
                remaining = budget - int(main_item["calories"])
                fitting_sides = side_df[side_df["calories"] <= remaining + 80]

                if len(fitting_sides) > 0:
                    # Prefer culturally-matched sides via pairs_well_with
                    preferred_ids = set()
                    if "pairs_well_with" in main_item.index and pd.notna(main_item["pairs_well_with"]) and str(main_item["pairs_well_with"]).strip():
                        preferred_ids = set(str(main_item["pairs_well_with"]).split(","))
                    preferred = fitting_sides[fitting_sides["food_id"].isin(preferred_ids)]
                    side_item = (preferred if len(preferred) > 0 else fitting_sides).sample(1, random_state=seed + 7).iloc[0]
                    return [main_item, side_item]
                # No fitting side — return main alone
                return [main_item]

            # ── Standalone complete dish (budget-capped) ──────────────────
            if len(standalone_df) > 0:
                _fit_sa = standalone_df[standalone_df["calories"] <= budget + _sa_tolerance]
                if len(_fit_sa) > 0:
                    item = _fit_sa.sample(1, random_state=seed).iloc[0]
                    return [item]

        # ── Fallback: category-diversity picker ───────────────────────────
        shuffled = slot_df.sample(frac=1, random_state=seed).reset_index(drop=True)
        selected = []
        used_categories = set()
        remaining = budget
        for _, row in shuffled.iterrows():
            if len(selected) >= 2:
                break
            cat = str(row.get("category", "")).strip().lower()
            if selected and cat and cat in used_categories:
                continue
            if row["calories"] <= remaining + 50 or len(selected) == 0:
                selected.append(row)
                used_categories.add(cat)
                remaining -= row["calories"]
        return selected

    plan = {}
    total_cal = total_protein = total_carbs = total_fat = 0.0

    # Cross-slot variety: track main/standalone foods already used in earlier slots
    # Within-day variety tracker (resets each day)
    _cross_slot_used: set = set()
    # Cross-day variety: exclude main + standalone from prior days
    _week_mains_used: set = set(metrics.get("_week_used") or set())
    # Light side exclusion: avoid same side 2 days in a row (soft — only if 6+ remain)
    _week_sides_used: set = set(metrics.get("_week_sides_used") or set())

    # GI filter: prefer low/medium GI for diabetic or weight-loss users
    conditions_lower = [c.lower() for c in (metrics.get("conditions") or [])]
    health_goal_lower = (metrics.get("health_goal") or "").lower()
    _restrict_gi = (
        any("pcos" in c or "pcod" in c or "polycystic" in c for c in conditions_lower) or
        any("hypothyroid" in c or "thyroid" in c for c in conditions_lower) or
        any("diabetes" in c for c in conditions_lower) or
        any("obesity" in c for c in conditions_lower) or
        "lose" in health_goal_lower or "loss" in health_goal_lower
    )
    # Sodium filter: exclude high-sodium for hypertension / heart disease
    _restrict_sodium = (
        any("hypertension" in c or "blood pressure" in c for c in conditions_lower) or
        any("heart" in c for c in conditions_lower)
    )

    for slot, budget in splits.items():
        if "meal_type" in df.columns:
            if slot in ("Lunch", "Dinner"):
                slot_df = df[df["meal_type"].isin(["lunch_dinner", "any"])].copy()
            elif slot == "Snack":
                # Snack slot: meal_type snack OR any-typed standalones only
                # Exclude dish_role=main so breakfast/lunch mains (Thosai, Ragi Roti etc.)
                # with meal_type=any don't land in the snack pool
                _snack_pool = df[df["meal_type"] == "snack"]
                _any_snacks  = df[
                    (df["meal_type"] == "any") &
                    (df["dish_role"].isin(["standalone", "side", "condiment"]))
                ]
                slot_df = pd.concat([_snack_pool, _any_snacks]).drop_duplicates().copy()
            else:
                slot_df = df[df["meal_type"].isin([slot.lower(), "any"])].copy()
        else:
            slot_df = df.copy()

        # Prefer low/medium GI when diabetic or weight-loss — keep high-GI only as fallback
        if _restrict_gi and "gi_category" in slot_df.columns:
            low_med = slot_df[slot_df["gi_category"].isin(["low", "medium"])]
            if len(low_med) >= 4:
                slot_df = low_med

        # Prefer low/medium sodium for hypertension / heart disease
        if _restrict_sodium and "sodium_category" in slot_df.columns:
            low_sod = slot_df[slot_df["sodium_category"].isin(["low", "medium"])]
            if len(low_sod) >= 4:
                slot_df = low_sod

        # Cross-slot variety (within day): exclude mains already used in earlier slots
        if _cross_slot_used and "dish_role" in slot_df.columns:
            _roles_to_vary = {"main", "standalone"}
            _varied = slot_df[
                ~((slot_df["dish_role"].isin(_roles_to_vary)) &
                  (slot_df["food_item"].isin(_cross_slot_used)))
            ]
            if len(_varied) >= 6:
                slot_df = _varied

        # Cross-day variety: exclude main + standalone dishes used in previous days
        if _week_mains_used and "dish_role" in slot_df.columns:
            _wk_varied = slot_df[
                ~((slot_df["dish_role"].isin({"main", "standalone"})) &
                  (slot_df["food_item"].isin(_week_mains_used)))
            ]
            if len(_wk_varied) >= 6:
                slot_df = _wk_varied

        # Light side exclusion: avoid same side dish 2+ days running
        if _week_sides_used and "dish_role" in slot_df.columns:
            _wk_side_varied = slot_df[
                ~((slot_df["dish_role"] == "side") &
                  (slot_df["food_item"].isin(_week_sides_used)))
            ]
            if len(_wk_side_varied) >= 6:
                slot_df = _wk_side_varied

        # Generate N_OPTIONS distinct combinations
        # Strategy: first 2 options = main+side, 3rd = standalone (biryani/kottu) if available
        options = []
        used_names = set()
        base_seed = abs(hash(slot)) % 9999
        attempt = 0

        def pick_standalone_option(slot_df, budget, seed):
            """Pick a standalone complete dish that fits the budget (goal-aware tolerance)."""
            if "dish_role" not in slot_df.columns:
                return []
            sa_df   = slot_df[slot_df["dish_role"] == "standalone"]
            fitting = sa_df[sa_df["calories"] <= budget + _sa_tolerance]
            if len(fitting) == 0:
                return []
            return [fitting.sample(1, random_state=seed).iloc[0]]

        while len(options) < N_OPTIONS and attempt < 25:
            seed = (base_seed + attempt * 37) % 9999
            # 3rd option: try standalone first (for variety)
            if len(options) == N_OPTIONS - 1:
                selected = pick_standalone_option(slot_df, budget, seed)
                if not selected:
                    selected = pick_option(slot_df, budget, seed)
            else:
                selected = pick_option(slot_df, budget, seed)
            names = frozenset(r["food_item"] for r in selected)
            if names and names not in used_names:
                used_names.add(names)
                cal     = sum(r["calories"]  for r in selected)
                protein = sum(r["protein_g"] for r in selected)
                carbs   = sum(r["carbs_g"]   for r in selected)
                fat     = sum(r["fat_g"]     for r in selected)
                options.append({
                    "actual_kcal": round(cal),
                    "protein_g":   round(protein, 1),
                    "carbs_g":     round(carbs,   1),
                    "fat_g":       round(fat,     1),
                    "foods": [
                        {
                            "name":           r["food_item"],
                            "serving_size_g": int(r["serving_size_g"]) if "serving_size_g" in r.index and not pd.isna(r["serving_size_g"]) else None,
                            "min_serving_g":  int(r["min_serving_g"])  if "min_serving_g"  in r.index and not pd.isna(r["min_serving_g"])  else None,
                            "max_serving_g":  int(r["max_serving_g"])  if "max_serving_g"  in r.index and not pd.isna(r["max_serving_g"])  else None,
                            "calories":       int(r["calories"]),
                            "protein_g":      round(float(r["protein_g"]), 1),
                            "carbs_g":        round(float(r["carbs_g"]),   1),
                            "fat_g":          round(float(r["fat_g"]),     1),
                            "gi":             int(r["gi"])          if "gi"          in r.index and not pd.isna(r["gi"])          else None,
                            "gl":             round(float(r["gl"]), 1) if "gl"       in r.index and not pd.isna(r["gl"])          else None,
                            "gi_category":    str(r["gi_category"])    if "gi_category"    in r.index and not pd.isna(r["gi_category"])    else None,
                            "prep_method":    str(r["prep_method"])    if "prep_method"    in r.index and not pd.isna(r["prep_method"])    else None,
                            "sodium_mg":      int(r["sodium_mg"])      if "sodium_mg"      in r.index and not pd.isna(r["sodium_mg"])      else None,
                            "sodium_category":str(r["sodium_category"])if "sodium_category" in r.index and not pd.isna(r["sodium_category"]) else None,
                            "fiber_g":        round(float(r["fiber_g"]),1) if "fiber_g"    in r.index and not pd.isna(r["fiber_g"])         else None,
                        }
                        for r in selected
                    ],
                })
            attempt += 1

        # Register all mains/standalones used in this slot so next slots stay varied
        _main_roles = {"main", "standalone"}
        for _opt in options:
            for _fd in _opt["foods"]:
                # We don't have dish_role in the food dict, so match by name against slot_df
                _role_rows = slot_df[slot_df["food_item"] == _fd["name"]]
                if not _role_rows.empty:
                    _role = _role_rows.iloc[0].get("dish_role", "")
                    if _role in _main_roles:
                        _cross_slot_used.add(_fd["name"])

        # Use first option for daily totals
        first = options[0] if options else {"actual_kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}
        plan[slot] = {
            "target_kcal": budget,
            "options": options,
            # keep flat fields for totals calc
            "actual_kcal": first["actual_kcal"],
            "protein_g":   first["protein_g"],
            "carbs_g":     first["carbs_g"],
            "fat_g":       first["fat_g"],
        }
        total_cal     += first["actual_kcal"]
        total_protein += first["protein_g"]
        total_carbs   += first["carbs_g"]
        total_fat     += first["fat_g"]

    plan["totals"] = {
        "target_kcal": target_calories,
        "actual_kcal": round(total_cal),
        "protein_g":   round(total_protein, 1),
        "carbs_g":     round(total_carbs,   1),
        "fat_g":       round(total_fat,     1),
    }
    _plan_cache.clear()
    _plan_cache.update(plan)
    _persist_cache()
    return plan


def _format_option(opt: dict, label: str, conditions: list = None) -> list:
    """Format one meal option as lines, with GI tag and prep-method warnings."""
    conditions = conditions or []
    # Overall GI category for the option (worst of individual foods)
    gi_cats = [f.get("gi_category") for f in opt["foods"] if f.get("gi_category")]
    gi_rank = {"high": 2, "medium": 1, "low": 0}
    opt_gi  = max(gi_cats, key=lambda g: gi_rank.get(g, 0)) if gi_cats else None
    gi_tag  = f" | GI: {opt_gi}" if opt_gi else ""

    lines = [f"  *{label}* — {opt['actual_kcal']} kcal | P: {opt['protein_g']}g | C: {opt['carbs_g']}g | F: {opt['fat_g']}g{gi_tag}"]
    for f in opt["foods"]:
        if f.get("min_serving_g") and f.get("max_serving_g"):
            portion = f" ({f['min_serving_g']}–{f['max_serving_g']}g)"
        elif f.get("serving_size_g"):
            portion = f" ({f['serving_size_g']}g)"
        else:
            portion = ""
        lines.append(f"    • {f['name']}{portion} — {f['calories']} cal | P: {f['protein_g']}g | C: {f['carbs_g']}g | F: {f['fat_g']}g")

    # Deep-fried warning for relevant conditions
    has_fried = any(f.get("prep_method") == "deep_fried" for f in opt["foods"])
    warn_conditions = {"diabetes", "heart disease", "hypertension", "obesity"}
    if has_fried and (not conditions or warn_conditions.intersection(set(conditions))):
        lines.append("    ⚠️ *Contains deep-fried item — enjoy in moderation.*")

    # High-sodium warning for hypertension / heart disease
    has_high_sod = any(f.get("sodium_category") == "high" for f in opt["foods"])
    heart_hyp = {"heart disease", "hypertension"}
    if has_high_sod and conditions and heart_hyp.intersection(set(c.lower() for c in conditions)):
        lines.append("    ⚠️ *Contains high-sodium item — limit portions or request a low-sodium plan.*")

    return lines


def format_meal_plan_response(plan: dict, conditions: list = None,
                               prep_exclude: list = None, goal: str = "",
                               target_cal: int = 0) -> str:
    """Format the structured meal plan with multiple options per slot."""
    lines = []

    # Goal + calorie context banner
    _g = (goal or "").lower()
    if _g or target_cal:
        _goal_emoji = {"lose": "🔻", "gain": "📈", "maintain": "⚖️"}
        _gkey = "lose" if any(w in _g for w in ("lose","loss","cut")) else \
                "gain" if any(w in _g for w in ("gain","muscle","bulk")) else "maintain"
        _gem  = _goal_emoji.get(_gkey, "🎯")
        _goal_label = {"lose": "Weight Loss", "gain": "Weight Gain",
                       "maintain": "Maintain Weight"}.get(_gkey, goal.title())
        _banner_parts = []
        if _goal_label:
            _banner_parts.append(f"{_gem} **Goal: {_goal_label}**")
        if target_cal:
            _banner_parts.append(f"🔥 **Target: {target_cal:,} kcal/day**")
        if _gkey == "lose":
            _banner_parts.append("📋 *Dinner reduced to 25% — snack increased to 15% for satiety*")
        elif _gkey == "gain":
            _banner_parts.append("📋 *Calorie surplus included — choose calorie-dense options*")
        if _banner_parts:
            lines.append("  |  ".join(_banner_parts[:2]))
            if len(_banner_parts) > 2:
                lines.append(_banner_parts[2])
            lines.append("")

    # Show active prep filter note at the top
    if prep_exclude:
        _excl_readable = {
            "deep_fried": "deep-fried",
            "shallow_fried": "shallow-fried",
            "stir_fried": "stir-fried",
        }
        _excl_str = ", ".join(_excl_readable.get(p, p.replace("_", "-")) for p in prep_exclude)
        lines.append(f"*🥗 Filtering out {_excl_str} foods as requested.*\n")

    slots = ["Breakfast", "Lunch", "Dinner", "Snack"]
    for slot in slots:
        s = plan[slot]
        lines.append(f"**{slot}** (~{s['target_kcal']} kcal)")
        for i, opt in enumerate(s.get("options", []), 1):
            lines.extend(_format_option(opt, f"Option {i}", conditions=conditions))
            lines.append("")

    t = plan["totals"]
    lines.append(
        f"**Daily Total (Option 1): {t['actual_kcal']} kcal** "
        f"(target {t['target_kcal']} kcal)"
    )
    lines.append(f"Protein: {t['protein_g']}g | Carbs: {t['carbs_g']}g | Fat: {t['fat_g']}g")
    lines.append("\n*All values from the food database. Mix and match options to suit your taste!*")
    return "\n".join(lines)




# ── Weekly meal plan builder ────────────────────────────────────────────

def build_weekly_meal_plan(target_calories: int, metrics: dict) -> dict:
    """Build a 7-day meal plan with cross-day variety.
    Returns { "Day 1": plan_dict, ..., "Day 7": plan_dict }"""
    week: dict = {}
    _week_used: set = set()
    _week_sides_used: set = set()
    for i, day_name in enumerate(_DAYS_OF_WEEK, 1):
        day_metrics = dict(metrics)
        day_metrics["_week_used"]       = _week_used
        day_metrics["_week_sides_used"] = _week_sides_used
        day_plan = build_meal_plan(target_calories, day_metrics)
        _day_slot_df = _food_df[["food_item", "dish_role"]] if not _food_df.empty else None
        for slot in ("Breakfast", "Lunch", "Dinner", "Snack"):
            s = day_plan.get(slot, {})
            opts = s.get("options", [])
            if opts:
                for fd in opts[0].get("foods", []):
                    fname = fd["name"]
                    if _day_slot_df is not None:
                        _rows = _day_slot_df[_day_slot_df["food_item"] == fname]
                        _role = _rows.iloc[0]["dish_role"] if not _rows.empty else "main"
                    else:
                        _role = "main"
                    if _role in ("main", "standalone"):
                        _week_used.add(fname)       # excluded from ALL future days
                    elif _role == "side":
                        _week_sides_used.add(fname) # excluded for next day only (rolling)
        # Rolling side exclusion: keep only the LAST day worth of sides
        # so sides rotate without permanently locking out any curry
        if len(_week_sides_used) > 8:
            _week_sides_used = set(list(_week_sides_used)[-4:])
        week[f"Day {i}"] = day_plan
    return week


def _slot_emoji(slot: str) -> str:
    return {"Breakfast": "🌅", "Lunch": "☀️ ", "Dinner": "🌙", "Snack": "🍎"}.get(slot, "🍽️")


def format_weekly_plan_response(weekly_plan: dict, conditions: list = None,
                                 goal: str = "", target_cal: int = 0) -> str:
    """Compact 7-day overview showing Option 1 of each slot per day."""
    conditions = conditions or []
    # Goal banner
    _wg = (goal or "").lower()
    _wgkey = ("lose" if any(w in _wg for w in ("lose","loss","cut")) else
              "gain" if any(w in _wg for w in ("gain","muscle","bulk")) else
              "maintain" if "maintain" in _wg else "")
    _wglabel = {"lose": "🔻 Weight Loss", "gain": "📈 Weight Gain",
               "maintain": "⚖️ Maintain Weight"}.get(_wgkey, "")
    _w_banner = []
    if _wglabel:   _w_banner.append(_wglabel)
    if target_cal: _w_banner.append(f"🔥 Target: {target_cal:,} kcal/day")
    lines = ["📅 **Your 7-Day Sri Lankan Meal Plan**"]
    if _w_banner: lines.append("  |  ".join(_w_banner))
    lines += ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", ""]
    for i, day_name in enumerate(_DAYS_OF_WEEK, 1):
        day_key  = f"Day {i}"
        day_plan = weekly_plan.get(day_key, {})
        if not day_plan:
            continue
        lines.append(f"**{day_key} — {day_name}**")
        day_kcal = 0
        for slot in ("Breakfast", "Lunch", "Dinner", "Snack"):
            s = day_plan.get(slot, {})
            opts = s.get("options", [])
            if not opts:
                continue
            opt1   = opts[0]
            foods  = ", ".join(f["name"] for f in opt1["foods"])
            kcal   = opt1.get("actual_kcal", 0)
            day_kcal += kcal
            lines.append(f"  {_slot_emoji(slot)} {slot}: {foods} ({kcal} kcal)")
        lines.append(f"  📊 *Daily total: ~{day_kcal} kcal*")
        lines.append("")
    lines.append("─────────────────────────────────────────")
    lines.append("💡 *Say **\"Day 3 details\"** or **\"Wednesday plan\"** to see all options + full nutrition for any day.*")
    lines.append("💡 *Say **\"new weekly plan\"** to regenerate with fresh variety.*")
    return "\n".join(lines)


def format_week_day_detail(day_key: str, day_plan: dict, conditions: list = None) -> str:
    """Full detail (all options) for one day of the weekly plan."""
    conditions = conditions or []
    try:
        day_num  = int(day_key.split()[-1]) - 1
        day_name = _DAYS_OF_WEEK[day_num] if 0 <= day_num < 7 else ""
    except (ValueError, IndexError):
        day_name = ""
    header = f"📅 **{day_key}" + (f" — {day_name}" if day_name else "") + "**\n"
    body   = format_meal_plan_response(day_plan, conditions=conditions)
    return header + body


def detect_week_day_query(message: str, weekly_plan: dict):
    """Return "Day N" if message asks for a specific day's details. None otherwise."""
    if not weekly_plan:
        return None
    import re as _re_wd
    msg = message.lower().strip()
    m = _re_wd.search(r"\bday\s*([1-7])\b", msg)
    if m:
        return f"Day {m.group(1)}"
    for i, name in enumerate(_DAYS_OF_WEEK, 1):
        if name.lower() in msg:
            return f"Day {i}"
    return None

import re as _re

def detect_weight_change_goal(message: str, metrics: dict) -> str:
    """
    Detect 'gain/lose X kg in Y weeks' queries and return pre-calculated
    calorie targets so the LLM doesn't have to do the math.
    """
    msg = message.lower()
    # Match "gain/lose X kg/g/lbs/lb/pounds in/within/over/by Y days/weeks/months/years"
    pattern = (
        r'(gain|lose)\s+'
        r'(\d+(?:\.\d+)?)\s*(kg|g|lbs?|pounds?)'
        r'.*?'
        r'(?:in|within|over|by)\s+'
        r'(\d+(?:\.\d+)?)\s*(days?|weeks?|months?|years?)'
    )
    match = _re.search(pattern, msg)
    if not match:
        return ""

    direction   = match.group(1)
    weight_val  = float(match.group(2))
    weight_unit = match.group(3)
    time_val    = float(match.group(4))
    time_unit   = match.group(5)

    # Normalise weight → kg
    if weight_unit.startswith("g") and not weight_unit.startswith("ga"):
        kg = weight_val / 1000          # grams → kg
    elif weight_unit.startswith("lb") or weight_unit.startswith("pound"):
        kg = weight_val * 0.453592      # lbs → kg
    else:
        kg = weight_val                 # already kg

    # Normalise time → days
    if time_unit.startswith("day"):
        days = int(time_val)
    elif time_unit.startswith("week"):
        days = int(time_val * 7)
    elif time_unit.startswith("month"):
        days = int(time_val * 30)
    elif time_unit.startswith("year"):
        days = int(time_val * 365)
    else:
        days = int(time_val * 7)

    weeks = round(days / 7, 1)

    # 1 kg body mass ≈ 7700 kcal
    daily_adjustment = round((kg * 7700) / days)
    maintenance      = int(metrics.get("maintenance_calories") or 2000)

    if direction == "gain":
        new_target = maintenance + daily_adjustment
        label = f"+{daily_adjustment} cal/day surplus"
    else:
        new_target = maintenance - daily_adjustment
        label = f"-{daily_adjustment} cal/day deficit"

    # Feasibility thresholds:
    # Gain: safe max ~500 cal/day surplus (~0.5 kg/week)
    # Lose: safe max ~1000 cal/day deficit (~1 kg/week); never below 1200 cal/day
    SAFE_SURPLUS_MAX  = 500   # cal/day
    SAFE_DEFICIT_MAX  = 1000  # cal/day
    MIN_CALORIES      = 1200  # cal/day

    if direction == "gain" and daily_adjustment > SAFE_SURPLUS_MAX:
        safe_days   = round((kg * 7700) / SAFE_SURPLUS_MAX)
        safe_weeks  = round(safe_days / 7, 1)
        feasible = "no"
        safe_timeline = f"{safe_days} days ({safe_weeks} weeks)"
    elif direction == "lose" and (daily_adjustment > SAFE_DEFICIT_MAX or new_target < MIN_CALORIES):
        safe_days   = round((kg * 7700) / SAFE_DEFICIT_MAX)
        safe_weeks  = round(safe_days / 7, 1)
        feasible = "no"
        safe_timeline = f"{safe_days} days ({safe_weeks} weeks)"
    else:
        feasible = "yes"
        safe_timeline = ""

    kg_display = round(kg, 3)
    return (
        f"[Pre-calculated Goal — USE THESE EXACT NUMBERS, DO NOT RECALCULATE]\n"
        f"Goal: {direction} {kg_display} kg in {days} days ({weeks} weeks)\n"
        f"Required daily calorie adjustment: {label}\n"
        f"Maintenance calories: {maintenance} cal/day\n"
        f"New daily calorie target: {new_target} cal/day\n"
        f"Formula used: {kg_display} kg × 7,700 kcal ÷ {days} days = {daily_adjustment} cal/day\n"
        f"Feasible: {feasible}\n"
        f"Safe timeline: {safe_timeline}"
    )


def build_messages(req: ChatRequest):
    metrics = req.user_metrics or {}

    # Extend entity detection with metrics-derived data
    conditions, drugs, allergies = detect_entities(req.message)

    # Session memory: conditions/drugs mentioned earlier in the conversation
    # still matter ("I take warfarin" ... 3 messages later ... "what about snacks?")
    for h in req.history[-6:]:
        if h.role != "user":
            continue
        h_conds, h_drugs, h_allergies = detect_entities(h.content)
        for c in h_conds:
            if c not in conditions:
                conditions.append(c)
        for d in h_drugs:
            if d not in drugs:
                drugs.append(d)
        for a in h_allergies:
            if a not in allergies:
                allergies.append(a)

    # Add inferred conditions from BMI
    for cond in infer_conditions_from_metrics(metrics):
        if cond not in conditions:
            conditions.append(cond)

    # Merge DB allergies into the allergy list for KG retrieval
    db_allergies = parse_allergy_string(metrics.get("allergies", ""))
    for a in db_allergies:
        if a not in allergies:
            allergies.append(a)

    msg_lower = req.message.lower()

    # Decide what context is actually needed for this message
    MEAL_KEYWORDS = {
        "eat", "food", "meal", "breakfast", "lunch", "dinner", "snack",
        "diet", "recipe", "cook", "drink", "fruit", "vegetable", "protein",
        "calorie", "carb", "fat", "nutrition", "suggest", "recommend",
        "menu", "what should", "what can", "avoid", "safe to eat",
        # normalised variants / common typos
        "break fast", "breckfast", "brekfast", "supper", "tiffin", "snacks",
    }
    KG_KEYWORDS = {
        "condition", "diabetes", "hypertension", "heart", "blood pressure",
        "pressure", "obesity", "overweight", "medication", "drug", "medicine",
        "taking", "aspirin", "metformin", "warfarin", "paracetamol",
        "ibuprofen", "atorvastatin", "lisinopril", "amoxicillin",
    }
    needs_meal_context = any(kw in msg_lower for kw in MEAL_KEYWORDS)
    needs_kg_context   = any(kw in msg_lower for kw in KG_KEYWORDS) or bool(conditions or drugs)

    # Extract calorie override from current message or recent history
    # e.g. user says "meal plan for 4353 cal" or previous bot reply contained "New Daily Calorie Target: 4353"
    calorie_override = None
    explicit = _re.search(r'(\d{3,5})\s*(?:cal|kcal|calories)', msg_lower)
    if explicit:
        calorie_override = int(explicit.group(1))
    else:
        for h in reversed(req.history[-6:]):
            m = _re.search(r'New Daily Calorie Target[:\s]+(\d{3,5})', h.content, _re.IGNORECASE)
            if m:
                calorie_override = int(m.group(1))
                break

    effective_metrics = dict(metrics)
    if calorie_override and calorie_override != metrics.get("target_calories"):
        effective_metrics["target_calories"] = calorie_override

    # Build KG context only when relevant (includes session-history entities)
    kg_context = build_kg_context(req.message, entities=(conditions, drugs, allergies)) if needs_kg_context else ""

    # Always include the compact metrics summary
    metrics_context = build_user_metrics_context(effective_metrics)

    # Meal-slotted foods only for food/meal questions, using effective calorie target
    meal_context = get_meal_slotted_foods(effective_metrics) if (metrics and needs_meal_context) else ""

    # Assemble the full user content
    parts = []
    if metrics_context:
        parts.append(metrics_context)
    if calorie_override and calorie_override != metrics.get("target_calories"):
        parts.append(f"[Active Calorie Target for this request: {calorie_override} cal/day — use this for meal planning]")
    if meal_context:
        parts.append(meal_context)
    if kg_context:
        parts.append(f"[Knowledge Graph Data]\n{kg_context}")
    parts.append(f"User question: {req.message}")
    user_content = "\n\n".join(parts)

    # Cap history at last 6 exchanges to keep context small for 3B model
    recent = req.history[-6:]
    msgs = [SystemMessage(content=SYSTEM_PROMPT)]
    for m in recent:
        msgs.append(HumanMessage(content=m.content) if m.role == "user" else AIMessage(content=m.content))
    msgs.append(HumanMessage(content=user_content))
    return msgs


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": OLLAMA_MODEL,
        "drug_graph": {"nodes": len(drug_graph.nodes), "edges": len(drug_graph.edges)},
        "condition_graph": {"nodes": len(condition_graph.nodes), "edges": len(condition_graph.edges)},
    }


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    try:
        msgs = build_messages(req)
        response = llm.invoke(msgs)
        return ChatResponse(reply=strip_think(response.content))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def format_weight_goal_answer(calc: str, metrics: dict) -> str:
    """Format the pre-calculated weight goal result as a clean response."""
    data = {}
    for line in calc.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            data[k.strip()] = v.strip()

    goal_line   = data.get("Goal", "")
    direction   = goal_line.split()[0].lower() if goal_line else "change"
    target      = data.get("New daily calorie target", "?")
    adjustment  = data.get("Required daily calorie adjustment", "?")
    formula     = data.get("Formula used", "")
    maintenance = data.get("Maintenance calories", "?")
    feasible    = data.get("Feasible", "yes")
    safe_tl     = data.get("Safe timeline", "")

    protein = metrics.get("protein_target_g", "?")
    carbs   = metrics.get("carbs_target_g", "?")
    fat     = metrics.get("fat_target_g", "?")

    if feasible == "no":
        # Explain why it's not realistic and give the safe alternative
        verb = "gain" if direction == "gain" else "lose"
        kg_str = goal_line.split("kg")[0].split()[-1] + " kg" if "kg" in goal_line else ""
        days_str = goal_line.split("in")[-1].split("(")[0].strip() if "in" in goal_line else ""
        return (
            f"⚠️ **Not realistically possible.**\n\n"
            f"To {verb} {kg_str} in {days_str} would require **{adjustment}**, "
            f"which is well beyond what the body can safely handle.\n\n"
            f"Here's the math:\n"
            f"• Maintenance calories: {maintenance}\n"
            f"• Formula: {formula}\n"
            f"• Required daily target: {target}\n\n"
            f"**Safe guideline:** "
            + (f"max ~500 cal/day surplus (~0.5 kg/week) for weight gain." if direction == "gain"
               else f"max ~1,000 cal/day deficit (~1 kg/week) for weight loss.") +
            f"\n\n**Realistic timeline to {verb} {kg_str}: ~{safe_tl}**\n\n"
            f"⚕️ Rapid {'weight gain' if direction == 'gain' else 'weight loss'} can be harmful. "
            f"Please consult a doctor or dietitian for a safe plan."
        )

    # Feasible — show the normal answer
    return (
        f"**New Daily Calorie Target: {target}**\n\n"
        f"Here's how it's calculated:\n"
        f"• Maintenance calories: {maintenance}\n"
        f"• Required adjustment: {adjustment}\n"
        f"• Formula: {formula}\n\n"
        f"To support your {direction} goal, aim for **{target}** per day.\n\n"
        f"**Suggested Macros** (scaled to new target):\n"
        f"• Protein: {protein}g\n"
        f"• Carbs: {carbs}g\n"
        f"• Fat: {fat}g\n\n"
        f"*Consult a doctor before making significant dietary changes.*"
    )


MEAL_PLAN_TRIGGERS = {
    "meal plan", "day plan", "full day", "daily plan",
    "give me a plan", "plan for the day", "what to eat today",
    "suggest a day", "one day meal", "today's meal",
}

GREETING_PATTERNS = {
    "hi", "hello", "hey", "hiya", "sup", "good morning", "good afternoon",
    "good evening", "good night", "howdy", "greetings",
}

SINGLE_MEAL_SLOTS = {
    "breakfast": "Breakfast",
    "lunch":     "Lunch",
    "dinner":    "Dinner",
    "snack":     "Snack",
}


def get_time_greeting() -> str:
    from datetime import datetime
    hour = datetime.now().hour
    if 5 <= hour < 12:
        return "Good morning"
    elif 12 <= hour < 17:
        return "Good afternoon"
    elif 17 <= hour < 21:
        return "Good evening"
    return "Good night"


def is_greeting(message: str) -> bool:
    msg = message.strip().lower().rstrip("!?.,")
    return msg in GREETING_PATTERNS or (len(msg.split()) <= 2 and msg in GREETING_PATTERNS)


def detect_time_to_goal_query(message: str, metrics: dict) -> str:
    """
    Handle 'how long / how many weeks to reach my goal weight' queries.
    Returns exact answer from metrics, or "" if no match.
    """
    msg = message.lower()
    time_ask = any(w in msg for w in (
        "how long", "how much time", "how many weeks", "how many days",
        "how many months", "when will", "when can", "time to reach",
        "time it will", "time will it", "take to reach", "take to lose",
        "take to gain", "take to achieve", "take to get",
    ))
    goal_ref = any(w in msg for w in (
        "goal", "target", "ideal weight", "correct weight", "that weight",
        "lose", "gain", "reach", "achieve", "get there",
    ))
    if not (time_ask and goal_ref):
        return ""

    # If user mentions a specific weight amount (e.g. "gain 3kg", "lose 5kg"),
    # let bypass 1d (detect_safe_timeline_query) handle it instead
    if _re.search(r'\d+(?:\.\d+)?\s*(?:kg|g\b|lbs?|pounds?)', msg):
        return ""

    est_weeks  = metrics.get("estimated_weeks_to_goal")
    to_goal_kg = abs(float(metrics.get("weight_to_goal_kg") or 0))
    ideal_kg   = metrics.get("ideal_weight_kg")
    health_goal = (metrics.get("health_goal") or "").lower()
    target_cal  = metrics.get("target_calories")

    if not est_weeks:
        return ""

    est_months = round(int(est_weeks) / 4.3, 1)
    direction  = "lose" if "lose" in health_goal else "gain"

    return (
        f"At your current calorie target of **{target_cal} kcal/day**, "
        f"you'll reach your ideal weight of **{ideal_kg} kg** in approximately:\n\n"
        f"• **{est_weeks} weeks** (~{est_months} months)\n\n"
        f"This is based on {direction}ing {round(to_goal_kg, 1)} kg at a safe, "
        f"sustainable pace of ~0.5 kg/week.\n\n"
        f"*Stay consistent and you'll get there!*"
    )


def detect_goal_calorie_query(message: str, metrics: dict) -> str:
    """
    Handle 'what calorie do I need to achieve my goal weight / lose weight' queries.
    Answers directly from metrics without LLM calculation.
    """
    msg = message.lower()
    if not any(w in msg for w in ("calorie", "calories", "kcal", "caloric", "intake")):
        return ""
    if not any(w in msg for w in ("achieve", "reach", "goal", "target weight", "lose", "loss",
                                   "correct weight", "ideal weight", "get to", "attain")):
        return ""

    target_cal   = metrics.get("target_calories")
    maintenance  = metrics.get("maintenance_calories")
    health_goal  = (metrics.get("health_goal") or "").lower()
    deficit      = metrics.get("calorie_deficit_surplus")
    est_weeks    = metrics.get("estimated_weeks_to_goal")
    to_goal_kg   = abs(float(metrics.get("weight_to_goal_kg") or 0))
    ideal_kg     = metrics.get("ideal_weight_kg")

    if not target_cal or not maintenance:
        return ""

    direction = "lose" if "lose" in health_goal or float(deficit or 0) < 0 else "gain"
    adj       = abs(int(deficit or 0))

    lines = [
        f"To reach your ideal weight of **{ideal_kg} kg** (losing {round(to_goal_kg, 1)} kg), "
        f"your daily calorie target is already set:\n",
        f"• Maintenance calories: {maintenance} kcal/day",
        f"• Daily {'deficit' if direction == 'lose' else 'surplus'}: {adj} kcal/day",
        f"• **Your current target: {target_cal} kcal/day**",
    ]
    if est_weeks:
        lines.append(f"• Estimated time to goal: ~{est_weeks} weeks at this rate")
    lines.append("\nStick to this target and you're on track. No changes needed.")
    return "\n".join(lines)


def detect_ideal_weight_query(message: str, metrics: dict) -> str:
    """
    Handle 'what is my ideal/correct/target/healthy weight' queries.
    Returns a clean answer from metrics, or "" if no match.
    """
    msg = message.lower()
    # If asking about calories, don't intercept — let calorie bypass or LLM handle it
    if any(w in msg for w in ("calorie", "calories", "kcal", "maintenance", "deficit", "surplus", "tdee")):
        return ""
    if not any(w in msg for w in ("ideal", "correct", "target", "healthy", "right", "should be",
                                   "supposed to", "recommended", "good weight", "perfect weight",
                                   "according to", "for my", "for my bmi", "for my height")):
        return ""
    if not any(w in msg for w in ("weight", "weigh", "kg", "bmi")):
        return ""

    ideal      = float(metrics.get("ideal_weight_kg") or 0)
    current    = float(metrics.get("weight_kg") or 0)
    height_cm  = float(metrics.get("height_cm") or 0)
    bmi        = float(metrics.get("bmi") or 0)
    bmi_cat    = (metrics.get("bmi_category") or "").strip()
    to_goal    = float(metrics.get("weight_to_goal_kg") or 0)
    est_weeks  = metrics.get("estimated_weeks_to_goal")

    if not ideal or not current:
        return ""

    height_m = height_cm / 100 if height_cm else 1.70
    # Healthy BMI range weights for user's height
    low_healthy  = round(18.5 * height_m ** 2, 1)
    high_healthy = round(24.9 * height_m ** 2, 1)

    diff = round(current - ideal, 1)
    direction = "lose" if diff > 0 else "gain"
    diff_abs = abs(diff)

    status = ""
    if bmi < 18.5:
        status = f"currently **underweight** (BMI {bmi})"
    elif bmi < 25:
        status = f"currently within a **healthy weight range** (BMI {bmi})"
    elif bmi < 30:
        status = f"currently **overweight** (BMI {bmi})"
    else:
        status = f"currently in the **obese range** (BMI {bmi})"

    lines = [
        f"Based on your height ({height_cm} cm), your **ideal weight is {ideal} kg**.\n",
        f"• Current weight: {current} kg — {status}",
        f"• Healthy weight range for your height: {low_healthy}–{high_healthy} kg",
        f"• You need to **{direction} {diff_abs} kg** to reach your ideal weight.",
    ]
    if est_weeks:
        lines.append(f"• At a safe pace, this takes approximately **{est_weeks} weeks**.")

    return "\n".join(lines)


def detect_weight_recommendation_query(message: str, metrics: dict) -> str:
    """
    Handle 'which is better for me — weight loss or weight gain?' queries.
    Returns a clean recommendation from metrics, or "" if no match.
    """
    msg = message.lower()
    # Must mention both loss and gain (or lose and gain) as a comparison
    has_comparison = (
        ("loss" in msg or "lose" in msg or "losing" in msg) and
        ("gain" in msg or "gaining" in msg)
    )
    if not has_comparison:
        return ""
    # Must be asking for a recommendation, not a calculation
    if not any(w in msg for w in [
        "which", "what", "should", "better", "good", "recommend",
        "best", "suitable", "right", "ideal", "prefer", "advice",
        "according", "for me", "my condition", "my health",
    ]):
        return ""

    bmi          = float(metrics.get("bmi") or 0)
    raw_goal     = (metrics.get("health_goal") or "").lower().replace("_", " ")
    GOAL_LABELS  = {"lose": "Lose weight", "gain": "Gain weight", "maintain": "Maintain weight"}
    health_goal  = GOAL_LABELS.get(raw_goal, raw_goal)
    weight_kg    = float(metrics.get("weight_kg") or 0)
    ideal_kg     = float(metrics.get("ideal_weight_kg") or 0)
    to_goal_kg   = float(metrics.get("weight_to_goal_kg") or 0)
    est_weeks    = metrics.get("estimated_weeks_to_goal")
    target_cal   = metrics.get("target_calories")
    bmi_cat      = (metrics.get("bmi_category") or "").strip()

    goal_wants_lose = any(w in raw_goal for w in ["lose", "loss", "cut", "reduce"])
    goal_wants_gain = any(w in raw_goal for w in ["gain", "muscle", "bulk", "increase"])

    if goal_wants_lose or bmi >= 25:
        recommendation = "weight loss"
        icon = "✅"
        reason_bmi = f"Your BMI is {bmi} ({bmi_cat})" + (" — above the healthy range of 18.5–24.9." if bmi >= 25 else ".")
        reason_goal = f"Your health goal is set to **{health_goal}**."
        detail = (
            f"• Target weight: {round(ideal_kg, 1)} kg (lose {round(abs(to_goal_kg), 1)} kg)\n"
            f"• Estimated timeline at safe pace: ~{est_weeks} weeks\n"
            f"• Recommended daily calories: {target_cal} kcal"
        )
        counter = "Weight gain would move you further from your goal and increase health risks."
    elif goal_wants_gain or bmi < 18.5:
        recommendation = "weight gain"
        icon = "✅"
        reason_bmi = f"Your BMI is {bmi} ({bmi_cat})" + (" — below the healthy range of 18.5–24.9." if bmi < 18.5 else ".")
        reason_goal = f"Your health goal is set to **{health_goal}**."
        detail = (
            f"• Target weight: {round(ideal_kg, 1)} kg (gain {round(abs(to_goal_kg), 1)} kg)\n"
            f"• Estimated timeline at safe pace: ~{est_weeks} weeks\n"
            f"• Recommended daily calories: {target_cal} kcal"
        )
        counter = "Weight loss would move you further from your goal."
    else:
        recommendation = "maintaining your current weight"
        icon = "✅"
        reason_bmi = f"Your BMI is {bmi} ({bmi_cat}) — within the healthy range."
        reason_goal = f"Your health goal is set to **{health_goal}**."
        detail = f"• Current daily calories: {target_cal} kcal"
        counter = "Focus on maintaining this through a balanced diet and regular activity."

    return (
        f"{icon} **{recommendation.capitalize()} is recommended for you.**\n\n"
        f"Why:\n"
        f"• {reason_bmi}\n"
        f"• {reason_goal}\n\n"
        f"{detail}\n\n"
        f"{counter}\n\n"
        f"*Consult your doctor or dietitian for a personalised plan.*"
    )


def detect_weight_assessment_query(message: str, metrics: dict) -> str:
    """
    Handle 'is it good/safe/healthy/ok/possible/realistic to gain/lose X kg' queries.
    Returns a health-assessment answer using user metrics, or "" if no match.
    """
    msg = message.lower()
    pattern = (
        r'(?:is it|would it be|should i|can i|could i|is|are)\s+'
        r'(?:good|safe|healthy|ok|okay|possible|realistic|advisable|recommended|wise|fine|bad|dangerous|harmful)?\s*'
        r'(?:to|for me to)?\s*'
        r'(gain|lose)\s+(\d+(?:\.\d+)?)\s*(kg|g|lbs?|pounds?)'
    )
    match = _re.search(pattern, msg)
    if not match:
        return ""

    direction   = match.group(1)
    weight_val  = float(match.group(2))
    weight_unit = match.group(3)

    # Normalise → kg
    if weight_unit.startswith("g") and not weight_unit.startswith("ga"):
        kg = weight_val / 1000
    elif weight_unit.startswith("lb") or weight_unit.startswith("pound"):
        kg = weight_val * 0.453592
    else:
        kg = weight_val

    current_weight = float(metrics.get("weight_kg") or 0)
    height_cm      = float(metrics.get("height_cm") or 170)
    health_goal    = (metrics.get("health_goal") or "").lower()
    ideal_weight   = float(metrics.get("ideal_weight_kg") or 0)
    current_bmi    = float(metrics.get("bmi") or 0)

    if direction == "gain":
        new_weight = current_weight + kg
    else:
        new_weight = max(current_weight - kg, 0)

    new_bmi = round(new_weight / ((height_cm / 100) ** 2), 1) if height_cm else 0

    def bmi_category(b):
        if b < 18.5: return "Underweight"
        if b < 25:   return "Normal weight"
        if b < 30:   return "Overweight"
        return "Obese"

    new_cat = bmi_category(new_bmi)

    # Alignment check
    goal_wants_gain = any(w in health_goal for w in ["gain", "muscle", "bulk", "increase"])
    goal_wants_lose = any(w in health_goal for w in ["lose", "loss", "weight loss", "cut", "reduce"])

    aligned = (direction == "gain" and goal_wants_gain) or (direction == "lose" and goal_wants_lose)
    conflicts = (direction == "gain" and goal_wants_lose) or (direction == "lose" and goal_wants_gain)

    verdict = ""
    if conflicts:
        verdict = f"⚠️ **This conflicts with your current health goal ({health_goal.replace('_',' ')}).**"
    elif new_bmi > 30:
        verdict = f"⚠️ **This would put you in the Obese BMI range ({new_bmi}), which is not recommended.**"
    elif new_bmi < 18.5:
        verdict = f"⚠️ **This would put you in the Underweight BMI range ({new_bmi}), which is not recommended.**"
    elif aligned:
        verdict = f"✅ **This aligns with your health goal ({health_goal.replace('_',' ')}).**"
    else:
        verdict = f"ℹ️ **This is a significant weight change — consider consulting a doctor first.**"

    safe_days  = round((kg * 7700) / (500 if direction == "gain" else 1000))
    safe_weeks = round(safe_days / 7, 1)

    return (
        f"{verdict}\n\n"
        f"Here's what {'gaining' if direction == 'gain' else 'losing'} {round(kg, 1)} kg means for you:\n"
        f"• Current weight: {current_weight} kg (BMI {current_bmi} — {bmi_category(current_bmi)})\n"
        f"• New weight: {round(new_weight, 1)} kg (BMI {new_bmi} — {new_cat})\n"
        + (f"• Ideal weight: {ideal_weight} kg\n" if ideal_weight else "") +
        f"\n**Safe timeline:** ~{safe_days} days ({safe_weeks} weeks) at "
        f"{'500 cal/day surplus' if direction == 'gain' else '1,000 cal/day deficit'}.\n\n"
        f"*Consult your doctor or dietitian before making major weight changes.*"
    )


def detect_safe_timeline_query(message: str, metrics: dict) -> str:
    """
    Handle 'how long / how many days to gain/lose X kg safely' queries
    where the user gives a weight target but no timeframe.
    Returns a formatted answer string, or "" if no match.
    """
    msg = message.lower()
    pattern = (
        r'(?:how\s+(?:long|many\s+(?:days?|weeks?|months?))'
        r'|(?:how\s+(?:much\s+)?time)'
        r'|(?:time\s+(?:will\s+it\s+take|to|for)))'
        r'.*?(gain|lose)\s+(\d+(?:\.\d+)?)\s*(kg|g|lbs?|pounds?)'
    )
    match = _re.search(pattern, msg)
    if not match:
        # Also catch "gain X kg in a healthy way" without a timeframe
        match = _re.search(
            r'(gain|lose)\s+(\d+(?:\.\d+)?)\s*(kg|g|lbs?|pounds?)'
            r'.*?(?:health|safe|proper|correct|right|realistic)',
            msg
        )
    if not match:
        return ""

    direction   = match.group(1)
    weight_val  = float(match.group(2))
    weight_unit = match.group(3)

    # Normalise weight → kg
    if weight_unit.startswith("g") and not weight_unit.startswith("ga"):
        kg = weight_val / 1000
    elif weight_unit.startswith("lb") or weight_unit.startswith("pound"):
        kg = weight_val * 0.453592
    else:
        kg = weight_val

    maintenance = int(metrics.get("maintenance_calories") or 2000)

    if direction == "gain":
        safe_daily  = 500          # cal/day surplus
        safe_days   = round((kg * 7700) / safe_daily)
        new_target  = maintenance + safe_daily
        rate_desc   = "~0.5 kg/week (500 cal/day surplus)"
    else:
        safe_daily  = 1000         # cal/day deficit
        safe_days   = round((kg * 7700) / safe_daily)
        new_target  = max(maintenance - safe_daily, 1200)
        rate_desc   = "~1 kg/week (1,000 cal/day deficit)"

    safe_weeks = round(safe_days / 7, 1)

    verb = "gain" if direction == "gain" else "lose"
    return (
        f"✅ **To {verb} {round(kg, 1)} kg safely, aim for ~{safe_days} days ({safe_weeks} weeks).**\n\n"
        f"Here's why:\n"
        f"• Safe rate: {rate_desc}\n"
        f"• Formula: {round(kg,1)} kg × 7,700 kcal ÷ {safe_daily} cal/day = {safe_days} days\n"
        f"• Recommended daily calorie target: **{new_target} cal/day** "
        f"({'surplus' if direction == 'gain' else 'deficit'} from your maintenance of {maintenance} cal/day)\n\n"
        f"Stick to this rate for steady, sustainable results. "
        f"Going faster risks muscle loss (for weight loss) or excess fat gain (for weight gain).\n\n"
        f"*Always consult a doctor or dietitian for a personalised plan.*"
    )


def is_meal_plan_request(message: str) -> bool:
    msg = message.lower()
    return any(t in msg for t in MEAL_PLAN_TRIGGERS)




def is_weekly_plan_request(message: str) -> bool:
    """Detect requests for a full 7-day / weekly meal plan."""
    msg = message.lower()
    weekly_triggers = [
        "7 day", "7-day", "seven day", "weekly plan", "week plan",
        "full week", "whole week", "week meal", "meal plan for the week",
        "meal plan for a week", "7 days meal", "7days",
    ]
    return any(t in msg for t in weekly_triggers)

# ── Prep method preference detection ─────────────────────────────────────────
_PREP_EXCLUDE_PATTERNS = [
    # No frying at all
    (["no fried", "avoid fried", "without fried", "not fried", "no fry",
      "oil free", "oil-free", "no oily", "without oil", "less oil",
      "reduce oil", "low oil", "no deep fry", "no shallow fry"],
     ["deep_fried", "shallow_fried"]),
    # Light cooking — steamed/boiled only
    (["only steamed", "steamed only", "only boiled", "boiled only",
      "light cooking", "healthy cooking", "no stir fry", "no stir-fry",
      "no wok", "no kottu", "without kottu"],
     ["deep_fried", "shallow_fried", "stir_fried"]),
    # No deep fried specifically
    (["no deep fried", "avoid deep fried", "without deep fried",
      "not deep fried", "no deep-fried"],
     ["deep_fried"]),
]

def detect_prep_filter(message: str, history: list) -> list:
    """
    Scan the current message and recent history for prep method preferences.
    Returns a list of prep_method values to EXCLUDE from the food DB.
    """
    # Combine current message + last 6 history turns
    combined = message.lower()
    for h in (history or [])[-6:]:
        combined += " " + h.content.lower()

    excluded = set()
    for keywords, methods in _PREP_EXCLUDE_PATTERNS:
        if any(k in combined for k in keywords):
            excluded.update(methods)

    return list(excluded)


_MEAL_NORMALISE = {
    "break fast": "breakfast",
    "break-fast": "breakfast",
    "breckfast":  "breakfast",
    "brekfast":   "breakfast",
    "luch":       "lunch",
    "diner":      "dinner",
    "supper":     "dinner",
    "snacks":     "snack",
    "tiffin":     "snack",
}

def _normalise_meal_msg(message: str) -> str:
    msg = message.strip().lower()
    for variant, canonical in _MEAL_NORMALISE.items():
        msg = msg.replace(variant, canonical)
    return msg


def detect_single_meal_slot(message: str) -> str | None:
    """Return slot name if message asks only about one meal (breakfast/lunch/dinner/snack)."""
    msg = _normalise_meal_msg(message)

    # If the user is asking about calorie allocation only — let LLM answer with the number
    calorie_only = any(p in msg for p in (
        "allocated calorie", "calorie allocation", "calorie for", "calories for",
        "how many calorie", "how much calorie", "calorie target for", "calorie budget",
    ))
    if calorie_only:
        return None

    # Words that indicate the user wants food/meal suggestions for a slot
    food_ask = any(w in msg for w in (
        "eat", "food", "suggest", "have", "recommend", "give",
        "order", "get", "prepare", "cook", "make", "plan", "idea",
        "option", "choice", "menu", "show", "list",
        "for", "about",
    ))
    for keyword, slot in SINGLE_MEAL_SLOTS.items():
        if keyword not in msg:
            continue
        # Always match if there's a food-action keyword
        if food_ask:
            return slot
        # Also match short follow-ups like "for the dinner?" or "and dinner?"
        if len(msg.split()) <= 5:
            return slot
    return None


def format_single_slot_response(slot: str, plan: dict) -> str:
    s = plan[slot]
    lines = [f"**{slot}** (~{s['target_kcal']} kcal) — Pick an option:\n"]
    for i, opt in enumerate(s.get("options", []), 1):
        lines.extend(_format_option(opt, f"Option {i}"))
        lines.append("")
    lines.append("*Foods sourced from your personalised food database. Mix and match to your preference!*")
    return "\n".join(lines)


def resolve_calorie_target(req: ChatRequest, metrics: dict) -> int:
    """
    Priority: explicit override field → calorie in current message
    → calorie found in recent history → DB target.
    """
    if req.calorie_target_override:
        return req.calorie_target_override

    msg_lower = req.message.lower()
    explicit = _re.search(r'(\d{3,5})\s*(?:cal|kcal|calories)', msg_lower)
    if explicit:
        val = int(explicit.group(1))
        if val > 500:   # sanity check
            return val

    for h in reversed(req.history[-6:]):
        m = _re.search(r'New Daily Calorie Target[:\s]+(\d{3,5})', h.content, _re.IGNORECASE)
        if m:
            return int(m.group(1))

    return int(metrics.get("target_calories") or 2000)


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """Server-Sent Events streaming endpoint."""
    metrics = req.user_metrics or {}

    # ── Bypass 0: greeting ────────────────────────────────────────
    if is_greeting(req.message):
        time_greet = get_time_greeting()
        name_part  = f", {req.user_name.split()[0]}" if req.user_name else ""
        _raw_goal  = (metrics.get("health_goal") or "").lower().replace("_", " ").strip()
        _goal_map  = {"lose": "weight loss", "gain": "weight gain", "maintain": "maintaining a healthy weight"}
        goal_phrase = _goal_map.get(_raw_goal, _raw_goal)
        answer = (
            f"{time_greet}{name_part}! 👋 Hi, I'm your Diet AI. "
            + (f"You're currently focused on **{goal_phrase}**. " if goal_phrase else "")
            + "Ask me about your diet, foods to eat or avoid, meal suggestions, or calorie targets!"
        )

        async def stream_greeting() -> AsyncGenerator[str, None]:
            for token in answer:
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(stream_greeting(), media_type="text/event-stream")

    # ── Bypass 1: weight change goal math ────────────────────────
    goal_calc = detect_weight_change_goal(req.message, metrics)
    if goal_calc:
        answer = format_weight_goal_answer(goal_calc, metrics)

        async def stream_goal() -> AsyncGenerator[str, None]:
            for token in answer:
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(stream_goal(), media_type="text/event-stream")

    # ── Bypass 1a: time to goal query ─────────────────────────────
    time_to_goal = detect_time_to_goal_query(req.message, metrics)
    if time_to_goal:
        async def stream_ttg():
            for ch in time_to_goal:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_ttg(), media_type="text/event-stream")

    # ── Bypass 1b: goal calorie query ──────────────────────────────
    goal_cal = detect_goal_calorie_query(req.message, metrics)
    if goal_cal:
        async def stream_goal_cal():
            for ch in goal_cal:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_goal_cal(), media_type="text/event-stream")

    # ── Bypass 1b: ideal weight query ──────────────────────────────
    ideal_wt = detect_ideal_weight_query(req.message, metrics)
    if ideal_wt:
        async def stream_ideal_wt():
            for ch in ideal_wt:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_ideal_wt(), media_type="text/event-stream")

    # ── Bypass 1c: weight loss vs gain recommendation ─────────────
    weight_rec = detect_weight_recommendation_query(req.message, metrics)
    if weight_rec:
        async def stream_rec():
            for ch in weight_rec:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_rec(), media_type="text/event-stream")

    # ── Bypass 1b: health assessment (is it good/safe to gain/lose X kg) ─
    weight_assessment = detect_weight_assessment_query(req.message, metrics)
    if weight_assessment:
        async def stream_assessment():
            for ch in weight_assessment:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_assessment(), media_type="text/event-stream")


    # Bypass 1d: safe timeline query (how long to gain/lose X kg)
    safe_tl = detect_safe_timeline_query(req.message, metrics)
    if safe_tl:
        async def stream_safe_tl():
            for ch in safe_tl:
                yield "data: " + json.dumps({"token": ch}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_safe_tl(), media_type="text/event-stream")

    # Detect prep method preference (persists for this request)
    _prep_exclude = detect_prep_filter(req.message, req.history)
    _prep_in_msg  = detect_prep_filter(req.message, [])  # current message only (no history)
    if _prep_exclude:
        metrics = dict(metrics)
        metrics["_prep_exclude"] = _prep_exclude
        # Auto-generate plan only when current message ITSELF states a prep preference
        # (not just history carryover — avoids firing on condition/drug/FAQ questions)
        if _prep_in_msg and not is_meal_plan_request(req.message) and not detect_single_meal_slot(req.message):
            _target_cal_p = resolve_calorie_target(req, metrics)
            _prep_plan    = build_meal_plan(_target_cal_p, metrics)
            _plan_cache.update(_prep_plan)
            _persist_cache()
            # format_meal_plan_response already prepends the filter header when prep_exclude is passed
            _p_ans = format_meal_plan_response(_prep_plan, conditions=metrics.get("conditions") or [], prep_exclude=_prep_exclude)
            async def stream_prep_auto():
                for ch in _p_ans:
                    yield "data: " + json.dumps({"token": ch}) + "\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(stream_prep_auto(), media_type="text/event-stream")

    # Food preference memory (dislike / like)
    _pref_action, _pref_food = detect_food_preference(req.message)
    if _pref_action and _pref_food:
        if _pref_action == "dislike":
            _disliked_foods.add(_pref_food)
            _save_disliked()
            _pref_reply = ("Got it! I'll avoid **" + _pref_food + "** in all your future meal suggestions. \U0001f645\n\n"
                           + "*You can say \"I like " + _pref_food + "\" any time to add it back.*")
        else:
            _disliked_foods.discard(_pref_food)
            _save_disliked()
            _pref_reply = "Great! I've added **" + _pref_food + "** back to your meal options. ✅"
        async def stream_pref():
            for ch in _pref_reply:
                yield "data: " + json.dumps({"token": ch}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_pref(), media_type="text/event-stream")

    # Meal log summary bypass
    if detect_log_summary_request(req.message):
        _log_reply = format_log_summary()
        async def stream_log_sum():
            for ch in _log_reply:
                yield "data: " + json.dumps({"token": ch}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_log_sum(), media_type="text/event-stream")

    # Meal log entry bypass
    _log_item, _log_slot = detect_log_request(req.message)
    if _log_item:
        today = _dt.date.today().isoformat()
        _opt_log_m = _re.search(r"option\s*([123])", _log_item)
        if _opt_log_m:
            _logged = _log_option(int(_opt_log_m.group(1)), _log_slot)
            if _logged:
                _cal_total = sum(e["calories"] for e in _logged)
                _names     = ", ".join(e["food"] for e in _logged)
                _log_ack   = ("\U0001f4dd Logged **Option " + _opt_log_m.group(1) + "**"
                              + (" for " + _logged[0]["slot"] if _logged else "") + ":\n"
                              + "  " + _names + " (" + str(_cal_total) + " kcal)")
            else:
                _log_ack = "Couldn't find that option in your plan. Generate a meal plan first!"
        else:
            _matched_food = fuzzy_match_food(_log_item)
            if _matched_food:
                _cal      = _calories_for_food(_matched_food)
                _slot_str = _log_slot or "Other"
                _meal_log.append({
                    "date": today, "slot": _slot_str,
                    "food": _matched_food, "calories": _cal or 0,
                    "logged_at": _dt.datetime.now().isoformat(timespec="minutes"),
                })
                _save_meal_log()
                _cal_str = " (" + str(_cal) + " kcal)" if _cal else ""
                _log_ack = ("\U0001f4dd Logged **" + _matched_food + "**" + _cal_str
                            + (" for " + _slot_str if _log_slot else "") + ". ✅\n\n"
                            + "*Say \"show my food log\" to see today's total.*")
            else:
                _log_ack = "I couldn't match \"" + _log_item + "\" to a food in my database. Try being more specific."
        _save_meal_log()
        async def stream_log():
            for ch in _log_ack:
                yield "data: " + json.dumps({"token": ch}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_log(), media_type="text/event-stream")

    # Food substitution bypass — always returns when a substitution request is detected
    _sub_food, _sub_opt_n = detect_substitution_request(req.message)
    if _sub_food:
        if not _plan_cache:
            _plan_cache.update(_load_cache_from_disk())
        if not _plan_cache:
            _sub_reply = "No meal plan yet — ask me for a plan first, then I can swap foods for you!"
        else:
            _sub_slot, _sub_idx = None, None
            for _sl, _sdata in _plan_cache.items():
                if not isinstance(_sdata, dict) or "options" not in _sdata:
                    continue
                for _oi, _opt in enumerate(_sdata["options"]):
                    if _sub_opt_n and (_oi + 1) != _sub_opt_n:
                        continue
                    if any(f["name"] == _sub_food for f in _opt["foods"]):
                        _sub_slot, _sub_idx = _sl, _oi
                        break
                if _sub_slot:
                    break
            if _sub_slot is not None:
                _orig_opt   = _plan_cache[_sub_slot]["options"][_sub_idx]
                _replacement = _pick_substitute(_sub_food, _sub_slot, _orig_opt, metrics)
                if _replacement:
                    import copy
                    _new_opt = copy.deepcopy(_orig_opt)
                    for _fi in _new_opt["foods"]:
                        if _fi["name"] == _sub_food:
                            _fi.update(_replacement)
                            _fi["name"] = _replacement["name"]
                            break
                    _new_opt["actual_kcal"] = round(sum(f["calories"] for f in _new_opt["foods"]))
                    _new_opt["protein_g"]   = round(sum(f["protein_g"] for f in _new_opt["foods"]), 1)
                    _new_opt["carbs_g"]     = round(sum(f["carbs_g"]   for f in _new_opt["foods"]), 1)
                    _new_opt["fat_g"]       = round(sum(f["fat_g"]     for f in _new_opt["foods"]), 1)
                    _plan_cache[_sub_slot]["options"][_sub_idx] = _new_opt
                    _persist_cache()
                    _sub_label = "Option " + str(_sub_idx + 1)
                    _sub_lines = ["✅ Swapped **" + _sub_food + "** → **" + _replacement["name"]
                                  + "** in " + _sub_slot + " " + _sub_label + "!\n"]
                    _sub_lines.extend(_format_option(_new_opt, _sub_label, metrics.get("conditions") or []))
                    _sub_reply = "\n".join(_sub_lines)
                else:
                    _sub_reply = "Sorry, I couldn't find a suitable replacement for **" + _sub_food + "** right now. Try a fresh meal plan!"
            else:
                _sub_reply = ("Couldn't find **" + _sub_food + "** in your current meal plan. "
                              "Generate a fresh plan first, then ask me to swap it!")
        async def stream_sub():
            for ch in _sub_reply:
                yield "data: " + json.dumps({"token": ch}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_sub(), media_type="text/event-stream")

    # Bypass W1: 7-day weekly plan
    if is_weekly_plan_request(req.message):
        _w_target = resolve_calorie_target(req, metrics)
        _new_week  = build_weekly_meal_plan(_w_target, metrics)
        _weekly_plan.clear()
        _weekly_plan.update(_new_week)
        _w_ans = format_weekly_plan_response(
            _new_week,
            conditions=metrics.get("conditions") or [],
            goal=metrics.get("health_goal") or "",
            target_cal=_w_target,
        )
        async def stream_weekly():
            for ch in _w_ans:
                yield "data: " + json.dumps({"token": ch}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_weekly(), media_type="text/event-stream")

    # Bypass W2: specific day detail from the cached weekly plan
    _week_day_key = detect_week_day_query(req.message, _weekly_plan)
    if _week_day_key:
        _wd_plan = _weekly_plan.get(_week_day_key, {})
        _wd_ans  = format_week_day_detail(_week_day_key, _wd_plan, conditions=metrics.get("conditions") or [])
        async def stream_week_day():
            for ch in _wd_ans:
                yield "data: " + json.dumps({"token": ch}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_week_day(), media_type="text/event-stream")

    # Bypass 2: full day meal plan
    if is_meal_plan_request(req.message):
        target_cal = resolve_calorie_target(req, metrics)
        plan       = build_meal_plan(target_cal, metrics)
        answer     = format_meal_plan_response(
            plan,
            conditions=metrics.get("conditions") or [],
            prep_exclude=_prep_exclude,
            goal=metrics.get("health_goal") or "",
            target_cal=target_cal,
        )
        async def stream_plan() -> AsyncGenerator[str, None]:
            for token in answer:
                yield "data: " + json.dumps({"token": token}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_plan(), media_type="text/event-stream")

    # Bypass 2b: option selection
    _opt_match      = _re.search(r"\boption\s*([123])\b", req.message.strip().lower())
    _detail_request = any(w in req.message.lower() for w in (
        "detail", "more", "about", "tell me", "explain", "what is", "what are",
        "info", "information", "describe", "show me", "ingredients",
    ))
    if _opt_match and not _detail_request:
        _n    = _opt_match.group(1)
        _slot = ""
        for _h in reversed(req.history):
            if _h.role == "assistant":
                for _s in ("Breakfast", "Lunch", "Dinner", "Snack"):
                    if _s.lower() in _h.content.lower():
                        _slot = _s
                        break
                break
        _slot_str   = " for **" + _slot + "**" if _slot else ""
        _opt_answer = ("✅ Great choice! You've selected **Option " + _n + "**" + _slot_str + ". Enjoy your meal! \U0001f37d\n\n"
                       + "*Ask me about your next meal slot, or anything else about your diet!*")
        async def stream_opt():
            for ch in _opt_answer:
                yield "data: " + json.dumps({"token": ch}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_opt(), media_type="text/event-stream")

    # Bypass 2c: option detail
    if _detail_request and not _plan_cache:
        _plan_cache.update(_load_cache_from_disk())
    if _detail_request and _plan_cache:
        _conf_n, _conf_slot = None, None
        if _opt_match:
            _conf_n = int(_opt_match.group(1))
            for _h in reversed(req.history):
                if _h.role == "assistant":
                    for _s in ("Breakfast", "Lunch", "Dinner", "Snack"):
                        if _s.lower() in _h.content.lower():
                            _conf_slot = _s
                            break
                    if _conf_slot:
                        break
        if not _conf_n:
            for _h in reversed(req.history):
                if _h.role == "assistant":
                    _cm = _re.search(r"You've selected \*\*Option (\d)\*\*(?: for \*\*(\w+)\*\*)?", _h.content)
                    if _cm:
                        _conf_n    = int(_cm.group(1))
                        _conf_slot = _cm.group(2) or ""
                        break
        if _conf_n and _conf_slot and _conf_slot in _plan_cache:
            _opts = _plan_cache[_conf_slot].get("options", [])
            if _conf_n <= len(_opts):
                _opt = _opts[_conf_n - 1]
                _det_lines = [("**" + _conf_slot + " — Option " + str(_conf_n) + "** ("
                               + str(_opt["actual_kcal"]) + " kcal | P: " + str(_opt["protein_g"])
                               + "g | C: " + str(_opt["carbs_g"]) + "g | F: " + str(_opt["fat_g"]) + "g)\n")]
                for _fi in _opt["foods"]:
                    if _fi.get("min_serving_g") and _fi.get("max_serving_g"):
                        _srv = (" (" + str(_fi["min_serving_g"]) + "–" + str(_fi["max_serving_g"])
                                + "g, typical " + str(_fi.get("serving_size_g", "?")) + "g)")
                    elif _fi.get("serving_size_g"):
                        _srv = " (" + str(_fi["serving_size_g"]) + "g)"
                    else:
                        _srv = ""
                    _gi   = "GI: " + str(_fi["gi"]) + " (" + str(_fi["gi_category"]) + ")" if _fi.get("gi") is not None else ""
                    _gl   = "GL: " + str(_fi["gl"]) if _fi.get("gl") is not None else ""
                    _prep = "Prep: " + _fi["prep_method"].replace("_", " ") if _fi.get("prep_method") else ""
                    _sod  = "Sodium: " + str(_fi["sodium_mg"]) + "mg" if _fi.get("sodium_mg") is not None else ""
                    _fib  = "Fiber: " + str(_fi["fiber_g"]) + "g" if _fi.get("fiber_g") is not None else ""
                    _meta = "  |  ".join(x for x in [_gi, _gl, _sod, _fib, _prep] if x)
                    _line = ("• **" + _fi["name"] + "**" + _srv + "\n"
                             + "  Calories: " + str(_fi["calories"]) + " kcal  |  Protein: " + str(_fi["protein_g"])
                             + "g  |  Carbs: " + str(_fi["carbs_g"]) + "g  |  Fat: " + str(_fi["fat_g"]) + "g"
                             + ("\n  " + _meta if _meta else ""))
                    _det_lines.append(_line)
                _det_answer = "\n".join(_det_lines)
                async def stream_det():
                    for ch in _det_answer:
                        yield "data: " + json.dumps({"token": ch}) + "\n\n"
                    yield "data: [DONE]\n\n"
                return StreamingResponse(stream_det(), media_type="text/event-stream")

    # Bypass 3: single meal slot
    _single_slot = detect_single_meal_slot(req.message)
    if _single_slot:
        target_cal  = resolve_calorie_target(req, metrics)
        _prep_excl3 = detect_prep_filter(req.message, req.history)
        if _prep_excl3:
            metrics = dict(metrics)
            metrics["_prep_exclude"] = _prep_excl3
        slot_plan   = build_meal_plan(target_cal, metrics)
        slot_answer = format_single_slot_response(_single_slot, slot_plan)
        if _prep_excl3:
            _excl_rd2 = {"deep_fried": "deep-fried", "shallow_fried": "shallow-fried", "stir_fried": "stir-fried"}
            _excl_s2  = ", ".join(_excl_rd2.get(p, p.replace("_", "-")) for p in _prep_excl3)
            slot_answer = "*\U0001f957 Filtering out " + _excl_s2 + " foods as requested.*\n\n" + slot_answer
        _plan_cache.update(slot_plan)
        _persist_cache()
        async def stream_slot():
            for ch in slot_answer:
                yield "data: " + json.dumps({"token": ch}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_slot(), media_type="text/event-stream")

    # ── Knowledge graph bypasses (no LLM needed) ─────────────────────────────
    _cond_entities, _drug_entities, _ = detect_entities(req.message)

    # Condition knowledge bypass
    _is_cond_q = any(p in req.message.lower() for p in [
        "what food", "what should i eat", "what can i eat", "what to eat",
        "what should i avoid", "what to avoid", "foods for", "food for",
        "foods to eat", "avoid with", "should avoid", "what not to eat",
        "good for", "recommend", "dietary advice", "diet advice", "diet for",
    ])
    if _cond_entities and _is_cond_q:
        _cond_lines = []
        for _cond in _cond_entities:
            _canonical   = _CONDITION_ALIAS.get(_cond.lower(), _cond.title())
            _rec, _avd   = retrieve_condition_foods(_cond)
            _diet_note   = _CONDITION_DIET_NOTES.get(_canonical, "")
            _cond_lines.append("**" + _canonical + " — Dietary Guidance**\n")
            if _rec:
                _cond_lines.append("✅ **Recommended:** " + ", ".join(_rec[:12]) + "\n")
            if _avd:
                _cond_lines.append("\U0001f6ab **Avoid:** " + ", ".join(_avd[:12]) + "\n")
            if _diet_note:
                _cond_lines.append("\n\U0001f4cb **Evidence-based guidance:** " + _diet_note)
        if _cond_lines:
            _cond_answer = "\n".join(_cond_lines)
            async def stream_cond_kg():
                for ch in _cond_answer:
                    yield "data: " + json.dumps({"token": ch}) + "\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(stream_cond_kg(), media_type="text/event-stream")

    # Drug interaction bypass
    _is_drug_q = any(p in req.message.lower() for p in [
        "what should i avoid", "food restriction", "any food", "what food",
        "can i eat", "should not eat", "avoid", "take", "interaction",
        "food", "eat", "diet", "restriction", "on metformin", "on warfarin",
    ])
    if _drug_entities and _is_drug_q:
        _drug_lines = []
        for _drug in _drug_entities:
            _avd_foods, _drug_notes = retrieve_drug_foods(_drug)
            _supp = DRUG_SUPPLEMENTAL_NOTES.get(_drug, "")
            _drug_lines.append("**" + _drug + " — Food Interactions**\n")
            if _avd_foods:
                _drug_lines.append("\U0001f6ab **Avoid:** " + ", ".join(_avd_foods[:12]) + "\n")
            if _supp:
                _drug_lines.append("\U0001f4cb **Clinical guidance:** " + _supp + "\n")
            elif _drug_notes:
                _drug_lines.append("\U0001f4cb **Notes:** " + " | ".join(list(_drug_notes)[:4]) + "\n")
            _drug_lines.append("\n⚠️ Always consult your doctor or pharmacist about drug-food interactions.")
        if _drug_lines:
            _drug_answer = "\n".join(_drug_lines)
            async def stream_drug_kg():
                for ch in _drug_answer:
                    yield "data: " + json.dumps({"token": ch}) + "\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(stream_drug_kg(), media_type="text/event-stream")

    # Nutrition FAQ bypass (common questions answered without LLM)
    _msg_faq  = req.message.lower()
    _faq_ans  = None
    if _re.search(r"glycemic\s+index|what\s+is\s+gi\b|explain\s+gi\b|gi\s+mean", _msg_faq):
        _faq_ans = (
            "**Glycemic Index (GI)** measures how quickly foods raise blood sugar (0–100 scale).\n\n"
            "• **Low GI (≤55):** Oats, lentils, legumes, most fruits — slow, steady blood sugar rise\n"
            "• **Medium GI (56–69):** Basmati rice, whole wheat, sweet potato\n"
            "• **High GI (≥70):** White rice, white bread, sugary drinks — rapid spike\n\n"
            "Low-GI foods support blood sugar control, weight management, PCOS, and diabetes."
        )
    elif _re.search(r"how\s+much\s+protein|protein\s+(?:per|each|a|every)\s+day|daily\s+protein|protein\s+(?:need|require|target|intake)", _msg_faq):
        _pt  = metrics.get("protein_target_g", 0)
        _wt  = metrics.get("weight_kg", 0)
        _faq_ans = (
            "**Daily Protein Needs**\n\n"
            + (("Your target (from your profile): **" + str(_pt) + "g/day**\n\n") if _pt else "")
            + "General guideline: **0.8–1.2g per kg of body weight** for most adults.\n"
            + "For weight loss or muscle building: **1.5–2.0g/kg**.\n"
            + (("Based on your weight (" + str(_wt) + "kg): " + str(round(_wt * 1.5)) + "–" + str(round(_wt * 2.0)) + "g/day recommended.\n\n") if _wt else "\n")
            + "Good Sri Lankan protein sources: dhal, chickpeas, tempe, eggs, fish, Greek yogurt."
        )
    elif _re.search(r"coconut\s+oil|is\s+coconut\s+(?:oil\s+)?(?:healthy|good|bad)|coconut\s+fat", _msg_faq):
        _faq_ans = (
            "**Coconut Oil** — Is it healthy?\n\n"
            "Coconut oil is high in saturated fat (~90%) and medium-chain triglycerides (MCTs).\n\n"
            "• MCTs are metabolised quickly and may support energy\n"
            "• Raises both HDL (good) and LDL (bad) cholesterol — moderation is key\n"
            "• Better than trans fats or hydrogenated oils\n"
            "• Limit to **1–2 tsp/day** as part of a balanced diet\n\n"
            "Traditional in Sri Lankan cooking — moderate amounts are fine in a healthy diet."
        )
    if _faq_ans:
        async def stream_faq():
            for ch in _faq_ans:
                yield "data: " + json.dumps({"token": ch}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(stream_faq(), media_type="text/event-stream")

    # LLM fallback
    msgs = build_messages(req)

    async def stream_llm() -> AsyncGenerator[str, None]:
        # Safety net: if the model still emits a <think>...</think> block
        # (reasoning models), swallow it instead of streaming it to the UI.
        _THINK_OPEN, _THINK_CLOSE = "<think>", "</think>"
        mode = "detect"   # detect -> think -> stream
        buf = ""
        try:
            async for chunk in llm.astream(msgs):
                text = chunk.content or ""
                if not text:
                    continue
                if mode == "stream":
                    yield "data: " + json.dumps({"token": text}) + "\n\n"
                    continue
                buf += text
                if mode == "detect":
                    head = buf.lstrip()
                    if head.startswith(_THINK_OPEN):
                        mode = "think"
                    elif _THINK_OPEN.startswith(head[:len(_THINK_OPEN)]):
                        continue  # could still be a partial "<think>" — keep buffering
                    else:
                        mode = "stream"
                        yield "data: " + json.dumps({"token": buf}) + "\n\n"
                        buf = ""
                        continue
                if mode == "think":
                    end = buf.find(_THINK_CLOSE)
                    if end != -1:
                        rest = buf[end + len(_THINK_CLOSE):].lstrip("\n")
                        mode = "stream"
                        buf = ""
                        if rest:
                            yield "data: " + json.dumps({"token": rest}) + "\n\n"
            # Flush anything still buffered (short responses never leave detect mode)
            if buf and mode == "detect":
                yield "data: " + json.dumps({"token": buf}) + "\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield "data: " + json.dumps({"error": str(e)}) + "\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(stream_llm(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=API_PORT)