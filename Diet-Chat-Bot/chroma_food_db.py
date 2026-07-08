from __future__ import annotations
"""
chroma_food_db.py — ChromaDB food index using sentence-transformers.

Architecture:
  - Embedding model : all-MiniLM-L6-v2  (80 MB, fully offline)
  - Persistence     : DataSets/.chroma_food_index/  (survives server restart)
  - Collection      : "wellora_foods"
  - Document text   : rich description built from food_item + category +
                      main_ingredients + dietary_tags + nutrition_notes +
                      meal_type + dish_role + prep_method
  - Metadata        : all numeric/categorical columns for where-filter support

Public API
----------
  get_collection()                        → chroma Collection (lazy-init)
  semantic_search_foods(query, candidate_names, top_k, filters)
                                          → list[str] of food_item names
  build_option_queries(slot, goal)        → list[str]  # 3 diversity queries
  diverse_foods_from_pool(slot, pool_names, goal, n_options, budget_per_option)
                                          → list[str]  # one name per option
"""

import pathlib
import pickle
import time
import pandas as pd
import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

from food_db import _food_df   # already-loaded DataFrame

BASE_DIR   = pathlib.Path(__file__).parent
CHROMA_DIR = str(BASE_DIR / "DataSets" / ".chroma_food_index")
MODEL_NAME = "all-MiniLM-L6-v2"
COLLECTION = "wellora_foods"

# ── Lazy singletons ───────────────────────────────────────────────────────────
_client:     chromadb.PersistentClient | None = None
_collection: chromadb.Collection       | None = None
_embed_fn:   SentenceTransformerEmbeddingFunction | None = None


def _get_embed_fn() -> SentenceTransformerEmbeddingFunction:
    global _embed_fn
    if _embed_fn is None:
        print(f"[ChromaDB] Loading embedding model: {MODEL_NAME} …")
        _embed_fn = SentenceTransformerEmbeddingFunction(
            model_name=MODEL_NAME,
            device="cpu",
        )
        print("[ChromaDB] Embedding model ready.")
    return _embed_fn


def _build_doc_text(row) -> str:
    """
    Build a rich natural-language description for one food row.
    This is what gets embedded — richer text → better semantic matches.
    """
    parts = [str(row["food_item"])]

    cat = str(row.get("category", "") or "")
    if cat:
        parts.append(cat)

    ingr = str(row.get("main_ingredients", "") or "")
    if ingr:
        parts.append(ingr)

    tags = str(row.get("dietary_tags", "") or "")
    if tags:
        parts.append(tags)

    notes = str(row.get("nutrition_notes", "") or "")
    if notes:
        parts.append(notes)

    mt = str(row.get("meal_type", "") or "")
    if mt:
        parts.append(mt)

    dr = str(row.get("dish_role", "") or "")
    if dr:
        parts.append(dr)

    pm = str(row.get("prep_method", "") or "")
    if pm:
        parts.append(pm.replace("_", " "))

    gi_cat = str(row.get("gi_category", "") or "")
    if gi_cat:
        parts.append(f"{gi_cat} GI")

    sod_cat = str(row.get("sodium_category", "") or "")
    if sod_cat:
        parts.append(f"{sod_cat} sodium")

    return " | ".join(p for p in parts if p and p != "nan")


def _row_to_metadata(row) -> dict:
    """Convert a CSV row to ChromaDB metadata (must be str/int/float/bool)."""
    def _safe_int(v, default=0):
        try: return int(v) if pd.notna(v) else default
        except: return default

    def _safe_float(v, default=0.0):
        try: return round(float(v), 2) if pd.notna(v) else default
        except: return default

    def _safe_str(v, default=""):
        return str(v) if pd.notna(v) else default

    return {
        "food_item":        _safe_str(row.get("food_item")),
        "category":         _safe_str(row.get("category")),
        "calories":         _safe_int(row.get("calories")),
        "protein_g":        _safe_float(row.get("protein_g")),
        "carbs_g":          _safe_float(row.get("carbs_g")),
        "fat_g":            _safe_float(row.get("fat_g")),
        "fiber_g":          _safe_float(row.get("fiber_g")),
        "meal_type":        _safe_str(row.get("meal_type")),
        "dish_role":        _safe_str(row.get("dish_role")),
        "dietary_tags":     _safe_str(row.get("dietary_tags")),
        "allergens":        _safe_str(row.get("allergens")),
        "gi":               _safe_int(row.get("gi"), -1),
        "gl":               _safe_float(row.get("gl")),
        "gi_category":      _safe_str(row.get("gi_category")),
        "prep_method":      _safe_str(row.get("prep_method")),
        "sodium_mg":        _safe_int(row.get("sodium_mg"), -1),
        "sodium_category":  _safe_str(row.get("sodium_category")),
        "min_serving_g":    _safe_int(row.get("min_serving_g")),
        "max_serving_g":    _safe_int(row.get("max_serving_g")),
        "serving_size_g":   _safe_int(row.get("serving_size_g")),
    }


def _build_collection(client: chromadb.PersistentClient) -> chromadb.Collection:
    """Embed all food items and upsert into the ChromaDB collection."""
    if _food_df.empty:
        raise RuntimeError("[ChromaDB] food_df is empty — cannot build index.")

    df = _food_df.copy()
    print(f"[ChromaDB] Building food index: {len(df)} items …")
    t0 = time.time()

    embed_fn = _get_embed_fn()
    col = client.get_or_create_collection(
        name=COLLECTION,
        embedding_function=embed_fn,
        metadata={"hnsw:space": "cosine"},
    )

    # Upsert in batches of 100 to avoid memory spikes
    BATCH = 100
    ids, docs, metas = [], [], []

    for _, row in df.iterrows():
        food_id = str(row.get("food_id") or row.get("food_item", f"f_{_}"))
        ids.append(food_id)
        docs.append(_build_doc_text(row))
        metas.append(_row_to_metadata(row))

        if len(ids) >= BATCH:
            col.upsert(ids=ids, documents=docs, metadatas=metas)
            ids, docs, metas = [], [], []

    if ids:
        col.upsert(ids=ids, documents=docs, metadatas=metas)

    elapsed = round(time.time() - t0, 1)
    print(f"[ChromaDB] Index built: {col.count()} items in {elapsed}s")
    return col


def get_collection() -> chromadb.Collection:
    """
    Return the ChromaDB food collection, building it on first call.
    Subsequent calls return the cached singleton.
    """
    global _client, _collection

    if _collection is not None:
        return _collection

    _client = chromadb.PersistentClient(path=CHROMA_DIR)

    # Check if a valid collection already exists
    existing = [c.name for c in _client.list_collections()]
    if COLLECTION in existing:
        col = _client.get_collection(
            name=COLLECTION,
            embedding_function=_get_embed_fn(),
        )
        n = col.count()
        expected = len(_food_df) if not _food_df.empty else 0
        if n >= expected * 0.95:          # allow 5% tolerance for CSV updates
            print(f"[ChromaDB] Loaded existing index: {n} food items.")
            _collection = col
            return _collection
        else:
            print(f"[ChromaDB] Index stale ({n} vs {expected} expected) — rebuilding.")
            _client.delete_collection(COLLECTION)

    _collection = _build_collection(_client)
    return _collection


# ── Semantic search ───────────────────────────────────────────────────────────

def semantic_search_foods(
    query: str,
    candidate_names: list[str] | None = None,
    top_k: int = 10,
    extra_filters: dict | None = None,
) -> list[str]:
    """
    Search the food index semantically.

    Parameters
    ----------
    query           : Natural-language query, e.g. "light spicy lunch"
    candidate_names : If given, restrict results to these food names only
                      (applied as a post-filter after vector search).
    top_k           : Number of results to return.
    extra_filters   : ChromaDB where-filter dict for hard constraints,
                      e.g. {"gi_category": {"$in": ["low", "medium"]}}

    Returns
    -------
    List of food_item names, best match first.
    """
    col = get_collection()

    # Over-fetch so we have room for post-filtering
    fetch_k = max(top_k * 5, 50)

    kwargs: dict = {"query_texts": [query], "n_results": min(fetch_k, col.count())}
    if extra_filters:
        kwargs["where"] = extra_filters

    results = col.query(**kwargs)

    names = []
    if results and results.get("metadatas"):
        for meta in results["metadatas"][0]:
            name = meta.get("food_item", "")
            if candidate_names is not None:
                if name in candidate_names:
                    names.append(name)
            else:
                names.append(name)
            if len(names) >= top_k:
                break

    return names


# ── Diversity queries for meal plan options ───────────────────────────────────

# Per-slot diversity seeds: each option gets a different "flavour query"
_SLOT_QUERIES: dict[str, list[str]] = {
    "Breakfast": [
        "traditional Sri Lankan rice breakfast filling",
        "light healthy nutritious morning meal",
        "high protein energising breakfast",
    ],
    "Lunch": [
        "hearty traditional Sri Lankan rice curry lunch",
        "balanced light nutritious midday meal",
        "high protein satisfying Sri Lankan lunch",
    ],
    "Dinner": [
        "traditional Sri Lankan flavourful dinner",
        "light low-calorie evening meal",
        "warming comforting Sri Lankan dinner",
    ],
    "Snack": [
        "crunchy savory Sri Lankan snack",
        "sweet light healthy snack",
        "high protein low calorie snack",
    ],
}


def build_option_queries(slot: str, goal: str = "") -> list[str]:
    """
    Return 3 diversity queries for the given meal slot.
    Goal modifier (lose/gain/maintain) slightly adjusts the third query.
    """
    base = _SLOT_QUERIES.get(slot, [
        f"traditional Sri Lankan {slot.lower()} dish",
        f"light healthy {slot.lower()} option",
        f"nutritious {slot.lower()} meal",
    ])
    queries = list(base[:3])   # make a copy

    _g = (goal or "").lower()
    if any(w in _g for w in ("lose", "loss", "cut")):
        queries[2] = f"low calorie light {slot.lower()} weight loss"
    elif any(w in _g for w in ("gain", "muscle", "bulk")):
        queries[2] = f"high calorie protein rich {slot.lower()} muscle gain"

    return queries


def diverse_foods_from_pool(
    slot: str,
    pool_names: list[str],
    goal: str = "",
    n_options: int = 3,
    budget_per_option: int = 600,
) -> list[str]:
    """
    Given a pre-filtered list of candidate food names (from pandas hard filter),
    return n_options representative "headline" foods via semantic diversity.

    Each returned name is the top semantic match for a different query,
    ensuring the 3 meal plan options feel stylistically different.

    Returns list of food_item names (may be shorter than n_options if pool is small).
    """
    if not pool_names:
        return []

    queries  = build_option_queries(slot, goal)
    selected = []
    used     = set()

    for q in queries[:n_options]:
        hits = semantic_search_foods(q, candidate_names=pool_names, top_k=20)
        for name in hits:
            if name not in used:
                selected.append(name)
                used.add(name)
                break

    return selected


# ── User-facing semantic query handler ────────────────────────────────────────

def handle_semantic_food_query(
    message: str,
    metrics: dict,
    top_k: int = 5,
    exclude_names: set | None = None,
) -> str | None:
    """
    Detect and answer natural-language food queries like
    "something light and spicy for lunch" or "high protein meal ideas".

    Intent detection uses two independent keyword sets so either a suggestion
    verb ("suggest", "ideas") OR a food-adjective ("low GI", "high protein")
    paired with any food-context word is enough to trigger.

    Returns a formatted answer string, or None if the message doesn't qualify.
    """
    msg = message.strip().lower()

    # ── Intent keywords — suggestion/request verbs ────────────────────────────
    food_intent = any(w in msg for w in (
        "something", "suggest", "recommend", "give me", "show me",
        "what can i", "find me", "any", "options for",
        # expanded set
        "ideas", "idea", "options", "want", "need",
        "looking for", "tell me", "list", "which",
    ))

    # ── Food-context keywords — nouns / adjectives that signal food domain ────
    food_ctx = any(w in msg for w in (
        "eat", "food", "meal", "breakfast", "lunch", "dinner", "snack",
        "dish", "recipe", "option", "protein", "calorie", "light", "heavy",
        "spicy", "sweet", "healthy", "low", "high", "vegan", "vegetarian",
        # expanded set
        "gi", "glycemic", "carb", "fat", "fibre", "fiber",
        "gluten", "dairy", "sodium", "salt", "sugar",
        "filling", "nutritious", "energy", "weight",
    ))

    if not (food_intent and food_ctx):
        return None

    # Don't intercept structured plan requests — let plan bypasses handle those
    plan_triggers = {"meal plan", "day plan", "full day", "daily plan", "give me a plan"}
    if any(t in msg for t in plan_triggers):
        return None

    # Don't intercept purely educational questions ("what is", "explain", "define")
    educational = any(msg.startswith(p) for p in (
        "what is", "what are", "what does", "explain", "define",
        "how does", "how do", "why is", "why are", "tell me about",
    ))
    if educational:
        return None

    # ── Build ChromaDB hard filter from user profile ──────────────────────────
    extra: dict = {}
    from food_db import parse_allergy_string
    allergies = parse_allergy_string(metrics.get("allergies", "") or "")

    pref = (metrics.get("dietary_preference") or "").lower()
    if "vegan" in pref:
        extra["dietary_tags"] = {"$contains": "Vegan"}

    # ── Keyword-to-hard-filter mapping ────────────────────────────────────────
    # Detected query attributes drive post-filtering to avoid contradictory results
    _want_low_gi    = any(p in msg for p in ("low gi", "low glycemic", "low-gi", "low-glycemic"))
    _want_high_prot = any(p in msg for p in ("high protein", "protein rich", "protein-rich"))
    _want_low_cal   = any(p in msg for p in (
        "low calorie", "low-calorie", "low cal", "light", "fewer calories",
    ))
    _want_low_sod   = any(p in msg for p in ("low sodium", "low salt", "low-sodium"))

    # Fetch a larger pool so post-filters have room to work
    names = semantic_search_foods(message, top_k=top_k * 5, extra_filters=extra or None)

    # ── Post-filter: allergies, dislikes, hard constraints ───────────────────
    from meal_logger import _disliked_foods
    from food_db import _food_df, apply_allergy_filter

    filtered_df = _food_df[_food_df["food_item"].isin(names)].copy()

    if allergies:
        filtered_df = apply_allergy_filter(filtered_df, allergies)
    if _disliked_foods:
        filtered_df = filtered_df[~filtered_df["food_item"].isin(_disliked_foods)]
    if exclude_names:
        filtered_df = filtered_df[~filtered_df["food_item"].isin(exclude_names)]

    # ── Dietary preference post-filter (catches vegetarian / pescatarian) ──
    # ChromaDB where-filter only covers vegan; this covers all diet types.
    if "diet_type" in filtered_df.columns:
        _pref = (metrics.get("dietary_preference") or "").lower()
        if "vegan" in _pref:
            _diet_f = filtered_df[filtered_df["diet_type"] == "vegan"]
            if not _diet_f.empty:
                filtered_df = _diet_f
        elif "veg" in _pref:
            _diet_f = filtered_df[filtered_df["diet_type"].isin(["vegan", "vegetarian"])]
            if not _diet_f.empty:
                filtered_df = _diet_f
        elif "pescatarian" in _pref:
            _diet_f = filtered_df[filtered_df["diet_type"].isin(["vegan", "vegetarian", "pescatarian"])]
            if not _diet_f.empty:
                filtered_df = _diet_f

    # ── Condiment filter ─────────────────────────────────────────────────────
    # Exclude condiments/seasonings unless the user explicitly asked for one.
    _condiment_intent = any(w in msg for w in (
        "condiment", "chutney", "sambol", "pickle", "sauce", "dip",
        "relish", "seasoning", "spice", "paste",
    ))
    if not _condiment_intent:
        _non_condiment = filtered_df.copy()
        # Filter by meal_type
        if "meal_type" in _non_condiment.columns:
            _non_condiment = _non_condiment[_non_condiment["meal_type"] != "condiment"]
        # Filter by dish_role
        if "dish_role" in _non_condiment.columns:
            _non_condiment = _non_condiment[_non_condiment["dish_role"] != "condiment"]
        # Filter by category
        _condiment_cats = ("condiments & pickles", "spices & seasonings")
        if "category" in _non_condiment.columns:
            _non_condiment = _non_condiment[
                ~_non_condiment["category"].str.lower().isin(_condiment_cats)
            ]
        if not _non_condiment.empty:
            filtered_df = _non_condiment

    # Apply hard attribute filters derived from query keywords
    if _want_low_gi and "gi_category" in filtered_df.columns:
        gi_filtered = filtered_df[filtered_df["gi_category"].str.lower().isin(["low", "medium"])]
        if not gi_filtered.empty:
            filtered_df = gi_filtered

    if _want_low_sod and "sodium_category" in filtered_df.columns:
        sod_filtered = filtered_df[filtered_df["sodium_category"].str.lower() == "low"]
        if not sod_filtered.empty:
            filtered_df = sod_filtered

    # ── Sort by attribute when explicitly requested ───────────────────────────
    if _want_high_prot and "protein_g" in filtered_df.columns:
        filtered_df = filtered_df.sort_values("protein_g", ascending=False)
    elif _want_low_cal and "calories" in filtered_df.columns:
        filtered_df = filtered_df.sort_values("calories", ascending=True)
    else:
        # Default: keep original semantic ranking
        name_order = {n: i for i, n in enumerate(names)}
        filtered_df["_rank"] = filtered_df["food_item"].map(name_order).fillna(999)
        filtered_df = filtered_df.sort_values("_rank")

    filtered_df = filtered_df.head(top_k)

    if filtered_df.empty:
        return None

    # ── Format results ────────────────────────────────────────────────────────
    lines = [f"🔍 **Semantic food search:** *\"{message.strip()}\"*\n"]
    for _, row in filtered_df.iterrows():
        name    = row["food_item"]
        cal     = int(row["calories"])
        prot    = round(float(row["protein_g"]), 1)
        cat     = str(row.get("category", "") or "")
        gi_cat  = str(row.get("gi_category", "") or "")
        tags    = str(row.get("dietary_tags", "") or "")
        tag_str = f" | {tags}" if tags and tags != "nan" else ""
        gi_str  = f" | GI: {gi_cat}" if gi_cat and gi_cat != "nan" else ""
        lines.append(f"• **{name}** — {cal} kcal | Protein: {prot}g{gi_str}{tag_str}")
        if cat and cat != "nan":
            lines.append(f"  *{cat}*")

    lines.append("\n*Say \"meal plan\" for a full day plan, or ask about a specific slot.*")
    return "\n".join(lines)
