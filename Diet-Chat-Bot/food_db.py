"""
food_db.py — Food database loading, diet-type derivation, allergy filtering,
             and user metrics / slotted-food context builders.
"""
import pathlib
import pandas as pd
from rapidfuzz import process, fuzz

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
        per_item = budget / 2
        slot_df["_diff"] = abs(slot_df["calories"] - per_item)
        top = slot_df.sort_values("_diff").head(5)
        foods = ", ".join(
            f"{r['food_item']} ({r['calories']} cal)" for _, r in top.iterrows()
        )
        lines.append(f"{slot} (~{budget} kcal target): {foods}")

    return "\n".join(lines)
