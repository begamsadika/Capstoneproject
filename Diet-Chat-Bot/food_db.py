"""
food_db.py — Food database loading, diet-type derivation, allergy filtering,
             and user metrics / slotted-food context builders.
"""
import pathlib
import re
import pandas as pd
from rapidfuzz import process, fuzz
from medication_rules import apply_medication_food_filter, medication_food_notes

BASE_DIR = pathlib.Path(__file__).parent
_FOOD_CSV = BASE_DIR / "DataSets" / "food_ingredient_my.csv"

# ── Non-veg keyword list (for diet_type derivation) ──────────────────────────
_NON_VEG_KEYWORDS = [
    "fish", "prawn", "chicken", "mutton", "beef", "pork", "crab", "squid",
    "tuna", "sardine", "shrimp", "lamb", "duck", "turkey", "anchovy",
    "lobster", "oyster", "clam", "mussel", "maldive",
]

_SEAFOOD_KEYWORDS = {"fish", "prawn", "shrimp", "crab", "squid", "tuna",
                     "sardine", "anchovy", "lobster", "oyster", "clam",
                     "mussel", "maldive"}


# Different rows in the source dataset sometimes describe the same dish using
# English, Sinhala transliteration, or spacing variants. Recommendation lists
# use these keys for diversity while retaining the original display name.
_FOOD_NAME_ALIASES = {
    "kiribath": "kiribath",
    "kiri bath": "kiribath",
    "milk rice": "kiribath",
    "string hopper": "string hoppers",
    "string hoppers": "string hoppers",
    "idiyappam": "string hoppers",
}


def canonical_food_key(name: str) -> str:
    """Return a stable key used to collapse spelling and naming variants."""
    normalized = re.sub(r"[^a-z0-9]+", " ", str(name).lower()).strip()
    return _FOOD_NAME_ALIASES.get(normalized, normalized)


def _has_repeated_name_tokens(name: str) -> bool:
    """Reject low-quality names such as 'Pani Pani' from recommendations."""
    tokens = canonical_food_key(name).split()
    return len(tokens) > 1 and len(set(tokens)) == 1


def _select_unique_foods(
    slot_df: pd.DataFrame,
    used_food_keys: set[str],
    limit: int = 5,
) -> pd.DataFrame:
    """Select calorie-ranked foods without aliases or cross-slot repeats."""
    selected_indices = []
    selected_keys = set()
    sort_columns = ["_diff"]
    ascending = [True]
    if "_medical_score" in slot_df.columns:
        sort_columns.insert(0, "_medical_score")
        ascending.insert(0, False)
    for index, row in slot_df.sort_values(sort_columns, ascending=ascending).iterrows():
        name = str(row.get("food_item") or "").strip()
        key = canonical_food_key(name)
        if not key or _has_repeated_name_tokens(name):
            continue
        if key in selected_keys or key in used_food_keys:
            continue
        selected_indices.append(index)
        selected_keys.add(key)
        if len(selected_indices) == limit:
            break
    used_food_keys.update(selected_keys)
    return slot_df.loc[selected_indices]


def _derive_diet_type(row) -> str:
    """
    Derive a single diet_type label for a food item.
    Priority: dietary_tags column → category → name keywords → default (vegetarian).
    Returns: "vegan" | "vegetarian" | "pescatarian" | "non-veg"
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
    for kw in _NON_VEG_KEYWORDS:
        if kw in name:
            return "pescatarian" if kw in _SEAFOOD_KEYWORDS else "non-veg"
    # 4. Default
    return "vegetarian"


# ── Load food DataFrame ───────────────────────────────────────────────────────
try:
    _food_df = pd.read_csv(_FOOD_CSV)
    food_df  = _food_df
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


# ── Allergy normalisation ─────────────────────────────────────────────────────

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

_ALLERGEN_COLUMN_MAP = {
    "nut":      ["nuts"],
    "dairy":    ["dairy"],
    "gluten":   ["gluten"],
    "seafood":  ["fish", "shellfish"],
    "fish":     ["fish"],
    "shellfish": ["shellfish"],
    "egg":      ["egg"],
    # soy not in allergens column — handled via ingredient fallback
}

_STANDARD_ALLERGY_FALLBACK_PATTERNS = {
    "nut": r"\b(?:nut|nuts|peanut|cashew|almond|walnut|pistachio)\b",
    "seafood": r"\b(?:seafood|fish|prawn|shrimp|crab|squid|tuna|sardine|anchovy|lobster|oyster|clam|mussel)\b",
    "egg": r"\beggs?\b",
    "soy": r"\b(?:soy|soya|tofu|tempeh)\b",
    "gluten": r"\b(?:wheat|barley|rye|semolina|godamba|atta)\b",
}


def normalise_allergy(term: str) -> str:
    """Map a raw allergy string to a canonical type using exact then fuzzy matching."""
    t = term.strip().lower()
    if t in _ALLERGY_FLAT:
        return _ALLERGY_FLAT[t]
    all_variants = list(_ALLERGY_FLAT.keys())
    result = process.extractOne(t, all_variants, scorer=fuzz.WRatio)
    if result and result[1] >= 80:
        return _ALLERGY_FLAT[result[0]]
    return t


def parse_allergy_string(allergy_str: str) -> list:
    """Split a comma-separated allergy string and normalise each entry."""
    if not allergy_str:
        return []
    raw = [a.strip().lower() for a in allergy_str.split(",") if a.strip()]
    return list(dict.fromkeys(normalise_allergy(a) for a in raw))


def _custom_avoidance_pattern(term: str) -> str:
    """Build a word-aware regex for a user-entered ingredient or food name."""
    normalized = re.sub(r"[^a-z0-9]+", " ", str(term).lower()).strip()
    if not normalized:
        return ""

    variants = {normalized}
    words = normalized.split()
    last = words[-1]
    singular = ""
    if last.endswith("ies") and len(last) > 3:
        singular = last[:-3] + "y"
    elif last.endswith("oes") and len(last) > 3:
        singular = last[:-2]
    elif last.endswith("s") and not last.endswith("ss") and len(last) > 2:
        singular = last[:-1]
    if singular:
        variants.add(" ".join(words[:-1] + [singular]))

    patterns = []
    for variant in sorted(variants):
        phrase = r"[\s_-]+".join(re.escape(word) for word in variant.split())
        patterns.append(rf"(?<![a-z0-9]){phrase}(?![a-z0-9])")
    return "(?:" + "|".join(patterns) + ")"


def _remove_custom_avoidance(df: pd.DataFrame, term: str) -> pd.DataFrame:
    """Remove rows containing a custom avoidance term in searchable food data."""
    pattern = _custom_avoidance_pattern(term)
    if not pattern:
        return df

    matches = pd.Series(False, index=df.index)
    for column in ("food_item", "main_ingredients", "category", "allergens"):
        if column in df.columns:
            matches |= df[column].astype(str).str.contains(
                pattern,
                case=False,
                regex=True,
                na=False,
            )
    return df[~matches]


def apply_allergy_filter(df, allergies: list):
    """
    Filter foods by both standard allergens and custom avoided ingredients.

    Standard allergies use curated allergen mappings. Other profile entries,
    such as tomato or onion, are matched as complete words against the food
    name, ingredients, category, and allergen columns.
    """
    if not allergies:
        return df
    has_col = "allergens" in df.columns
    for allergy in allergies:
        if has_col and allergy in _ALLERGEN_COLUMN_MAP:
            tags = _ALLERGEN_COLUMN_MAP[allergy]
            pattern = "|".join(tags)
            df = df[~df["allergens"].str.contains(pattern, na=False)]
            fallback_pattern = _STANDARD_ALLERGY_FALLBACK_PATTERNS.get(allergy)
            if fallback_pattern:
                matches = pd.Series(False, index=df.index)
                for column in ("food_item", "main_ingredients", "category"):
                    if column in df.columns:
                        matches |= df[column].astype(str).str.contains(
                            fallback_pattern,
                            case=False,
                            regex=True,
                            na=False,
                        )
                df = df[~matches]
            continue
        if allergy == "soy":
            df = df[~df["main_ingredients"].str.contains("soy|soya", case=False, na=False)]
            continue
        if not has_col:
            if allergy == "nut":
                df = df[~df["category"].str.contains("Nuts & Seeds", case=False, na=False)]
                df = df[~df["main_ingredients"].str.contains(
                    "cashew|peanut|walnut|almond|pistachio", case=False, na=False)]
                continue
            elif allergy == "dairy":
                df = df[~df["category"].str.contains("Dairy", case=False, na=False)]
                continue
            elif allergy == "gluten":
                df = df[df["dietary_tags"].str.contains("Gluten-Free", case=False, na=False)]
                continue
            elif allergy == "seafood":
                df = df[~df["category"].str.contains("Seafood", case=False, na=False)]
                continue
            elif allergy == "egg":
                df = df[~df["main_ingredients"].str.contains("egg", case=False, na=False)]
                continue
        df = _remove_custom_avoidance(df, allergy)
    return df


# ── User metrics / profile context ───────────────────────────────────────────

def infer_conditions_from_metrics(metrics: dict) -> list:
    """Infer additional conditions from BMI category and health goal."""
    inferred = []
    bmi_cat = (metrics.get("bmi_category") or "").lower()
    if "obese" in bmi_cat:
        inferred.append("obesity")
    elif "overweight" in bmi_cat:
        inferred.append("overweight")
    return inferred


def parse_medical_conditions(metrics: dict) -> list[str]:
    """Return normalized user-reported conditions from either supported key."""
    raw = metrics.get("medical_conditions") or metrics.get("conditions") or []
    if isinstance(raw, str):
        items = re.split(r"[,;|\n]+", raw)
    else:
        items = [str(item) for item in raw]
    return list(dict.fromkeys(item.strip().lower() for item in items if item.strip()))


def get_medical_profile_flags(metrics: dict) -> dict[str, bool]:
    """Map saved conditions and the health goal to food-selection concerns."""
    condition_text = " ".join(parse_medical_conditions(metrics))
    goal = str(metrics.get("health_goal") or "").lower()
    bmi_category = str(metrics.get("bmi_category") or "").lower()

    glucose_control = any(term in condition_text for term in (
        "diabetes", "prediabetes", "high blood sugar", "pcos", "pcod",
        "polycystic",
    ))
    blood_pressure = any(term in condition_text for term in (
        "hypertension", "high blood pressure", "heart disease", "cardiac",
        "heart failure",
    ))
    heart_health = any(term in condition_text for term in (
        "heart disease", "cardiac", "heart failure", "high cholesterol",
        "hyperlipidemia",
    ))
    weight_management = (
        any(term in condition_text for term in ("obesity", "overweight"))
        or bmi_category in {"overweight", "obese"}
        or any(term in goal for term in ("lose", "loss", "reduce", "cut"))
    )
    weight_gain = any(term in goal for term in ("gain", "bulk", "increase", "muscle"))

    return {
        "glucose_control": glucose_control,
        "blood_pressure": blood_pressure,
        "heart_health": heart_health,
        "weight_management": weight_management,
        "weight_gain": weight_gain,
    }


def apply_medical_condition_filter(
    df: pd.DataFrame,
    metrics: dict,
) -> pd.DataFrame:
    """Apply condition-aware exclusions before foods are ranked or sampled."""
    flags = get_medical_profile_flags(metrics)
    filtered = df

    if flags["glucose_control"] and "gi_category" in filtered.columns:
        filtered = filtered[
            filtered["gi_category"].astype(str).str.lower().isin(["low", "medium"])
        ]

    if (flags["blood_pressure"] or flags["heart_health"]) and "sodium_category" in filtered.columns:
        filtered = filtered[
            filtered["sodium_category"].astype(str).str.lower().isin(["low", "medium"])
        ]

    if (flags["heart_health"] or flags["weight_management"]) and "prep_method" in filtered.columns:
        filtered = filtered[
            filtered["prep_method"].astype(str).str.lower() != "deep_fried"
        ]

    return filtered


def rank_foods_for_medical_profile(df: pd.DataFrame, metrics: dict) -> pd.DataFrame:
    """Add a medical/profile suitability score without changing source data."""
    ranked = df.copy()
    flags = get_medical_profile_flags(metrics)
    score = pd.Series(0.0, index=ranked.index)

    def numeric_column(name: str) -> pd.Series:
        values = ranked[name] if name in ranked.columns else pd.Series(0, index=ranked.index)
        return pd.to_numeric(values, errors="coerce").fillna(0)

    gi_category = ranked.get("gi_category", pd.Series("", index=ranked.index)).astype(str).str.lower()
    sodium_category = ranked.get("sodium_category", pd.Series("", index=ranked.index)).astype(str).str.lower()
    prep_method = ranked.get("prep_method", pd.Series("", index=ranked.index)).astype(str).str.lower()
    fibre = numeric_column("fiber_g")
    protein = numeric_column("protein_g")
    calories = numeric_column("calories")
    glycemic_load = numeric_column("gl")
    sodium_mg = numeric_column("sodium_mg")

    if flags["glucose_control"]:
        score += gi_category.map({"low": 6.0, "medium": 3.0, "high": -8.0}).fillna(0)
        score -= (glycemic_load / 20).clip(upper=3)
        score += fibre.clip(upper=8) * 0.35
        score += protein.clip(upper=20) * 0.08
    if flags["blood_pressure"] or flags["heart_health"]:
        score += sodium_category.map({"low": 6.0, "medium": 2.0, "high": -8.0}).fillna(0)
        score -= (sodium_mg / 500).clip(upper=3)
    if flags["heart_health"]:
        score += fibre.clip(upper=8) * 0.3
        score += protein.clip(upper=20) * 0.05
        score += prep_method.map({"raw": 2.0, "steamed": 2.0, "boiled": 1.5, "deep_fried": -8.0}).fillna(0)
    if flags["weight_management"]:
        score += fibre.clip(upper=8) * 0.4
        score += protein.clip(upper=20) * 0.08
        if "cal_per_100g" in ranked.columns:
            density = pd.to_numeric(ranked["cal_per_100g"], errors="coerce").fillna(0)
            score -= (density / 200).clip(upper=3)
    if flags["weight_gain"]:
        # Medical scores above remain dominant; this only favors nourishing,
        # higher-energy choices among foods that already passed condition rules.
        score += (calories / 250).clip(upper=2)
        score += protein.clip(upper=20) * 0.06

    ranked["_medical_score"] = score.round(3)
    return ranked


def medical_food_reasons(row, metrics: dict) -> list[str]:
    """Explain which stored-profile attributes made a food rank well."""
    flags = get_medical_profile_flags(metrics)
    reasons = []
    gi_category = str(row.get("gi_category") or "").lower()
    sodium_category = str(row.get("sodium_category") or "").lower()
    prep_method = str(row.get("prep_method") or "").lower()
    fibre = float(row.get("fiber_g") or 0)
    protein = float(row.get("protein_g") or 0)
    calories = float(row.get("calories") or 0)

    if flags["glucose_control"] and gi_category in {"low", "medium"}:
        reasons.append(f"{gi_category} GI")
    if (flags["blood_pressure"] or flags["heart_health"]) and sodium_category in {"low", "medium"}:
        reasons.append(f"{sodium_category} sodium")
    if (flags["heart_health"] or flags["weight_management"]) and fibre >= 3:
        reasons.append("fibre-rich")
    if protein >= 8 and any(flags.values()):
        reasons.append("protein-rich")
    if flags["heart_health"] and prep_method in {"raw", "steamed", "boiled"}:
        reasons.append("not fried")
    if flags["weight_gain"] and calories >= 250:
        reasons.append("energy-dense for weight gain")
    return reasons[:3]


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
    if metrics.get("medical_conditions"):
        lines.append(
            f"Medical conditions (user-reported): {metrics['medical_conditions']}"
        )
    if metrics.get("medications"):
        lines.append(f"Medications (user-reported): {metrics['medications']}")

    return "\n".join(lines)


def get_meal_slotted_foods(metrics: dict) -> str:
    """
    Filter the food DB by the user's dietary preference and allergies,
    then split into Breakfast / Lunch / Dinner / Snack slots with calorie budgets.
    Returns a formatted string for LLM context.
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

    # 2. Remove condiments
    if "meal_type" in df.columns:
        df = df[df["meal_type"] != "condiment"]

    # 3. Allergy filter
    allergies = parse_allergy_string(metrics.get("allergies", "") or "")
    df = apply_allergy_filter(df, allergies)

    # 4. Verified medication hard-avoid filter
    df = apply_medication_food_filter(df, metrics)

    # 5. Medical-condition filter
    df = apply_medical_condition_filter(df, metrics)

    # 6. Calorie split (25 / 35 / 30 / 10)
    target_cal = int(metrics.get("target_calories") or 2000)
    splits = {
        "Breakfast": round(target_cal * 0.25),
        "Lunch":     round(target_cal * 0.35),
        "Dinner":    round(target_cal * 0.30),
        "Snack":     round(target_cal * 0.10),
    }

    # 7. Build per-slot food lists
    lines = ["[Suggested Foods by Meal Slot]"]
    used_food_keys: set[str] = set()
    for slot, budget in splits.items():
        meal_type_filter = (
            ["lunch_dinner", "any"] if slot in ("Lunch", "Dinner")
            else [slot.lower(), "any"]
        )
        slot_df = df[df["meal_type"].isin(meal_type_filter)].copy() if "meal_type" in df.columns else df.copy()
        per_item = budget / 2
        slot_df["_diff"] = abs(slot_df["calories"] - per_item)
        slot_df = rank_foods_for_medical_profile(slot_df, metrics)
        top = _select_unique_foods(slot_df, used_food_keys, limit=5)
        if top.empty:
            foods = "No suitable foods found after applying your profile restrictions"
        else:
            food_parts = []
            for _, row in top.iterrows():
                reasons = medical_food_reasons(row, metrics)
                interaction_notes = medication_food_notes(row, metrics)
                annotations = reasons + interaction_notes
                reason_text = f" [{'; '.join(annotations)}]" if annotations else ""
                food_parts.append(f"{row['food_item']} ({row['calories']} cal){reason_text}")
            foods = ", ".join(food_parts)
            if len(top) < 5:
                foods += f" — only {len(top)} suitable option{'s' if len(top) != 1 else ''} found"
        lines.append(f"{slot} (~{budget} kcal target): {foods}")

    return "\n".join(lines)
