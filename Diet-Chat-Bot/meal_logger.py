"""
meal_logger.py — Meal plan cache, disliked-food preferences, meal intake log,
                 food substitution, and food preference detection.
"""
import re as _re
import json
import random
import pathlib
import datetime as _dt
import uuid
import logging
import threading
from dataclasses import dataclass, field

import pandas as pd
from rapidfuzz import process as _rfp, fuzz

from food_db import (
    _food_df,
    canonical_food_key,
    food_df,
    apply_allergy_filter,
    apply_medical_condition_filter,
    medical_food_reasons,
    parse_allergy_string,
    rank_foods_for_medical_profile,
)
from medication_rules import apply_medication_food_filter, medication_food_notes

BASE_DIR = pathlib.Path(__file__).parent
logger = logging.getLogger(__name__)

# ── Meal plan cache ───────────────────────────────────────────────────────────
_DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

_STATE_DIR = BASE_DIR / "DataSets" / ".user_state"
_user_states: dict[int, "UserDietState"] = {}
_states_lock = threading.RLock()


@dataclass
class UserDietState:
    """All mutable Diet AI state belonging to exactly one authenticated user."""

    user_id: int
    plan_cache: dict = field(default_factory=dict)
    weekly_plan: dict = field(default_factory=dict)
    disliked_foods: set[str] = field(default_factory=set)
    meal_log: list[dict] = field(default_factory=list)
    lock: threading.RLock = field(default_factory=threading.RLock, repr=False)


def _state_path(user_id: int) -> pathlib.Path:
    return _STATE_DIR / f"{user_id}.json"


def _normalise_user_id(user_id: int) -> int:
    try:
        normalised = int(user_id)
    except (TypeError, ValueError) as exc:
        raise ValueError("A valid authenticated user_id is required") from exc
    if normalised <= 0:
        raise ValueError("user_id must be a positive integer")
    return normalised


def _load_user_state(user_id: int) -> UserDietState:
    state = UserDietState(user_id=user_id)
    path = _state_path(user_id)
    if not path.exists():
        return state

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload.get("plan_cache"), dict):
            state.plan_cache.update(payload["plan_cache"])
        if isinstance(payload.get("weekly_plan"), dict):
            state.weekly_plan.update(payload["weekly_plan"])
        if isinstance(payload.get("disliked_foods"), list):
            state.disliked_foods.update(str(item) for item in payload["disliked_foods"])
        if isinstance(payload.get("meal_log"), list):
            state.meal_log.extend(
                item for item in payload["meal_log"] if isinstance(item, dict)
            )
    except (OSError, json.JSONDecodeError, TypeError) as exc:
        logger.warning("Could not load Diet AI state for user %s: %s", user_id, exc)
    return state


def get_user_state(user_id: int) -> UserDietState:
    """Return the isolated state container for an authenticated user."""
    normalised = _normalise_user_id(user_id)
    with _states_lock:
        state = _user_states.get(normalised)
        if state is None:
            state = _load_user_state(normalised)
            _user_states[normalised] = state
        return state


def persist_user_state(state: UserDietState) -> None:
    """Atomically persist one user's state without touching any other user."""
    path = _state_path(state.user_id)
    temp_path = path.with_suffix(".tmp")
    with state.lock:
        payload = {
            "plan_cache": state.plan_cache,
            "weekly_plan": state.weekly_plan,
            "disliked_foods": sorted(state.disliked_foods),
            "meal_log": state.meal_log[-200:],
        }
        try:
            _STATE_DIR.mkdir(parents=True, exist_ok=True)
            temp_path.write_text(
                json.dumps(payload, default=str),
                encoding="utf-8",
            )
            temp_path.replace(path)
        except OSError as exc:
            logger.warning(
                "Could not persist Diet AI state for user %s: %s",
                state.user_id,
                exc,
            )


def clear_user_state_cache() -> None:
    """Clear only the in-memory state cache, primarily for reload tests."""
    with _states_lock:
        _user_states.clear()


# ── Disliked-food preference memory ──────────────────────────────────────────
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


def fuzzy_match_food(candidate: str) -> str | None:
    """Return best-matching food_item name from the DB, or None if no good match."""
    names = list(food_df["food_item"])
    result = _rfp.extractOne(candidate, names, score_cutoff=72)
    return result[0] if result else None


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


# ── Meal intake log ───────────────────────────────────────────────────────────
_LOG_PATTERNS = [
    r"(?:i\s+)?(?:just\s+)?(?:ate|had|consumed|finished)\s+(.+?)(?:\s+for\s+(\w+))?$",
    r"(?:i\s+)?(?:just\s+)?(?:drink|drank|drunk|sipped)\s+(.+?)(?:\s+for\s+(\w+))?$",
    r"log\s+(.+?)(?:\s+(?:for|as)\s+(\w+))?(?:\s+please)?$",
    r"(?:i\s+)?(?:ate|had)\s+option\s+([123])(?:\s+for\s+(\w+))?",
    r"record\s+(?:my\s+)?(.+?)(?:\s+for\s+(\w+))?(?:\s+please)?$",
]
_LOG_SUMMARY_PATTERNS = [
    "what did i eat", "what have i eaten", "show my food log", "show my meal log", "food log",
    "my log", "calorie log", "how many calories did i", "calories today",
    "what i ate", "daily log", "meal history", "show log",
    "calories left", "calories do i have left", "remaining calories",
    "remaining macros", "nutrition left", "daily progress", "today's progress",
]
_SLOT_WORDS = {"breakfast", "lunch", "dinner", "snack"}


def detect_log_request(message: str):
    """Returns (food_or_option, slot) or (None, None)."""
    # Remove sentence punctuation before matching so "for breakfast." still
    # resolves Breakfast instead of becoming part of the food name.
    msg = message.strip().lower().rstrip(" .,!?:;")
    trigger_words = ["ate", "had", "consumed", "finished eating", "just ate",
                     "just had", "drink", "drank", "drunk", "sipped",
                     "log ", "record "]
    if not any(w in msg for w in trigger_words):
        return None, None
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
    if any(term in msg for term in (
        "suggest", "recommend", "meal plan", "plan the", "plan my",
        "what should i eat", "adjust", "rest of today", "rest of the day",
    )):
        return False
    return any(p in msg for p in _LOG_SUMMARY_PATTERNS)


def detect_combined_log_and_request(message: str):
    """Split requests such as 'I ate option 1. Suggest lunch.' safely."""
    match = _re.search(
        r"[.;]|,\s*(?=(?:suggest|recommend|what should|give me|plan|adjust)\b)",
        message,
        _re.IGNORECASE,
    )
    if not match:
        return None, None, None
    log_clause = message[: match.start()].strip()
    follow_up = message[match.end() :].strip()
    if not follow_up or not _re.match(
        r"(?:suggest|recommend|what should|give me|plan|adjust)\b",
        follow_up,
        _re.IGNORECASE,
    ):
        return None, None, None
    item, slot = detect_log_request(log_clause)
    if not item:
        return None, None, None
    return item, slot, follow_up


def _calories_for_food(name: str) -> int | None:
    nutrition = _nutrition_for_food(name)
    return int(nutrition["calories"]) if nutrition else None


def _number(value, default: float = 0.0) -> float:
    try:
        if value is None or pd.isna(value):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _nutrition_for_food(name: str) -> dict | None:
    """Return the database serving and macros for a named food."""
    rows = food_df[food_df["food_item"] == name]
    if rows.empty:
        return None
    row = rows.iloc[0]
    return {
        "food": str(row["food_item"]),
        "serving_size_g": round(_number(row.get("serving_size_g")), 1) or None,
        "calories": round(_number(row.get("calories"))),
        "protein_g": round(_number(row.get("protein_g")), 1),
        "carbs_g": round(_number(row.get("carbs_g")), 1),
        "fat_g": round(_number(row.get("fat_g")), 1),
        "fiber_g": round(_number(row.get("fiber_g")), 1),
        "sodium_mg": round(_number(row.get("sodium_mg"))),
    }


def _log_entry_from_food(
    food: dict,
    slot: str,
    *,
    source: str,
    option_number: int | None = None,
    date: str | None = None,
) -> dict:
    return {
        "entry_id": uuid.uuid4().hex,
        "date": date or _dt.date.today().isoformat(),
        "slot": slot,
        "food": food.get("name") or food.get("food"),
        "serving_size_g": food.get("serving_size_g"),
        "calories": round(_number(food.get("calories"))),
        "protein_g": round(_number(food.get("protein_g")), 1),
        "carbs_g": round(_number(food.get("carbs_g")), 1),
        "fat_g": round(_number(food.get("fat_g")), 1),
        "fiber_g": round(_number(food.get("fiber_g")), 1),
        "sodium_mg": round(_number(food.get("sodium_mg"))),
        "source": source,
        "option_number": option_number,
        "logged_at": _dt.datetime.now().isoformat(timespec="minutes"),
    }


def _is_duplicate_log_entry(state: UserDietState, candidate: dict) -> bool:
    """Prevent accidental repeat logging of the same food in the same slot/day."""
    candidate_key = (
        candidate.get("date"),
        str(candidate.get("slot") or "Other").lower(),
        canonical_food_key(str(candidate.get("food") or "")),
    )
    return any(
        (
            entry.get("date"),
            str(entry.get("slot") or "Other").lower(),
            canonical_food_key(str(entry.get("food") or "")),
        ) == candidate_key
        for entry in state.meal_log
    )


def log_food(
    state: UserDietState,
    food_name: str,
    slot: str | None = None,
) -> tuple[dict | None, bool]:
    """Log one database food and return ``(entry, was_duplicate)``."""
    nutrition = _nutrition_for_food(food_name)
    if not nutrition:
        return None, False
    entry = _log_entry_from_food(
        nutrition,
        slot or "Other",
        source="manual",
    )
    with state.lock:
        if _is_duplicate_log_entry(state, entry):
            return None, True
        state.meal_log.append(entry)
    return entry, False


def completed_meal_slots(state: UserDietState, date: str | None = None) -> list[str]:
    target_date = date or _dt.date.today().isoformat()
    with state.lock:
        completed = {
            str(entry.get("slot"))
            for entry in state.meal_log
            if entry.get("date") == target_date
            and entry.get("slot") in {"Breakfast", "Lunch", "Dinner", "Snack"}
        }
    return [
        slot for slot in ("Breakfast", "Lunch", "Dinner", "Snack")
        if slot in completed
    ]


def is_meal_slot_completed(
    state: UserDietState,
    slot: str,
    date: str | None = None,
) -> bool:
    return slot in completed_meal_slots(state, date)


def _entry_nutrient(entry: dict, field: str) -> float:
    if entry.get(field) is not None:
        return _number(entry.get(field))
    # Backward compatibility for calorie-only entries saved before macro logs.
    nutrition = _nutrition_for_food(str(entry.get("food") or "")) or {}
    return _number(nutrition.get(field))


def get_daily_progress(
    state: UserDietState,
    metrics: dict | None = None,
    *,
    target_calories: int | None = None,
    date: str | None = None,
) -> dict:
    """Calculate consumed and remaining nutrition for one user and day."""
    metrics = metrics or {}
    target_date = date or _dt.date.today().isoformat()
    with state.lock:
        entries = [
            dict(entry)
            for entry in state.meal_log
            if entry.get("date") == target_date
        ]
    targets = {
        "calories": round(_number(target_calories or metrics.get("target_calories"))),
        "protein_g": round(_number(metrics.get("protein_target_g")), 1),
        "carbs_g": round(_number(metrics.get("carbs_target_g")), 1),
        "fat_g": round(_number(metrics.get("fat_target_g")), 1),
    }
    consumed = {
        "calories": round(sum(_entry_nutrient(entry, "calories") for entry in entries)),
        "protein_g": round(sum(_entry_nutrient(entry, "protein_g") for entry in entries), 1),
        "carbs_g": round(sum(_entry_nutrient(entry, "carbs_g") for entry in entries), 1),
        "fat_g": round(sum(_entry_nutrient(entry, "fat_g") for entry in entries), 1),
    }
    remaining_raw = {
        field: round(targets[field] - consumed[field], 1 if field != "calories" else 0)
        for field in targets
    }
    remaining = {field: max(0, value) for field, value in remaining_raw.items()}
    return {
        "date": target_date,
        "entries": entries,
        "entry_count": len(entries),
        "targets": targets,
        "consumed": consumed,
        "remaining": remaining,
        "remaining_raw": remaining_raw,
        "completed_slots": completed_meal_slots(state, target_date),
    }


def _log_option(state: UserDietState, opt_n: int, slot: str | None) -> list:
    """Log all foods from a cached option. Returns list of logged entries."""
    logged = []
    today = _dt.date.today().isoformat()
    search_slots = [slot] if slot else list(state.plan_cache.keys())
    for sl in search_slots:
        slot_data = state.plan_cache.get(sl)
        if not isinstance(slot_data, dict) or "options" not in slot_data:
            continue
        opts = slot_data["options"]
        if opt_n <= len(opts):
            with state.lock:
                for fd in opts[opt_n - 1]["foods"]:
                    entry = _log_entry_from_food(
                        fd,
                        sl,
                        source="meal_plan_option",
                        option_number=opt_n,
                        date=today,
                    )
                    if _is_duplicate_log_entry(state, entry):
                        continue
                    state.meal_log.append(entry)
                    logged.append(entry)
            break
    return logged


def format_log_summary(
    state: UserDietState,
    metrics: dict | None = None,
    target_calories: int | None = None,
) -> str:
    progress = get_daily_progress(
        state,
        metrics,
        target_calories=target_calories,
    )
    today = progress["date"]
    today_entries = progress["entries"]
    if not today_entries:
        return "No meals logged today yet. Say *'I ate Kiribath for breakfast'* to start logging!"
    lines = [f"**Today's Food Log** ({today})\n"]
    by_slot: dict = {}
    for e in today_entries:
        by_slot.setdefault(e.get("slot", "Other"), []).append(e)
    for slot in ("Breakfast", "Lunch", "Dinner", "Snack", "Other"):
        if slot not in by_slot:
            continue
        lines.append(f"  *{slot}:*")
        for e in by_slot[slot]:
            lines.append(f"    • {e['food']} — {e.get('calories','?')} cal")
    consumed = progress["consumed"]
    targets = progress["targets"]
    remaining = progress["remaining"]
    lines.append(f"\n**Total calories logged: {consumed['calories']} kcal**")
    lines.append(
        f"Protein: {consumed['protein_g']}g | Carbs: {consumed['carbs_g']}g | "
        f"Fat: {consumed['fat_g']}g"
    )
    if targets["calories"] > 0:
        if progress["remaining_raw"]["calories"] >= 0:
            lines.append(
                f"\n**Remaining today:** {remaining['calories']} kcal | "
                f"Protein: {remaining['protein_g']}g | Carbs: {remaining['carbs_g']}g | "
                f"Fat: {remaining['fat_g']}g"
            )
        else:
            lines.append(
                f"\n⚠️ **Daily calorie target exceeded by "
                f"{abs(round(progress['remaining_raw']['calories']))} kcal.**"
            )
    if progress["completed_slots"]:
        lines.append("Completed meals: " + ", ".join(progress["completed_slots"]))
    return "\n".join(lines)


# ── Food substitution ─────────────────────────────────────────────────────────
_SUBSTITUTION_PATTERNS = [
    # "swap/replace X for/with something (else)"
    r"swap(?:\s+out)?\s+(?:the\s+)?(.+?)\s+(?:for|with)\s+(?:something|anything)(?:\s+else)?",
    r"replace\s+(?:the\s+)?(.+?)\s+(?:for|with)\s+(?:something|anything)(?:\s+else)?",
    # "replace X with something" / "replace X please"
    r"replace\s+(?:the\s+)?(.+?)\s+(?:with\s+something(?:\s+else)?|please)",
    # "can you replace/change/swap the X"
    r"can\s+(?:you\s+)?(?:replace|change|swap|substitute)\s+(?:the\s+)?(.+?)(?:\s+please|\?|$)",
    # "change/switch/substitute the X"
    r"(?:substitute|change|switch)\s+(?:the\s+)?(.+?)(?:\s+(?:with\s+something(?:\s+else)?|please))?$",
    # "skip the X" / "skip X"
    r"skip\s+(?:the\s+)?(.+?)(?:\s+please|\?|$)",
    # "get rid of X" / "remove X from my meal"
    r"get\s+rid\s+of\s+(?:the\s+)?(.+?)(?:\s+please|\?|$)",
    r"remove\s+(?:the\s+)?(.+?)\s+(?:from\s+(?:my|the)\s+(?:meal|option|plan))",
    # "no X please" / "no X in my plan"
    r"no\s+(.+?)\s+(?:please|in\s+(?:my|the)\s+(?:meal|plan|option))",
    # bare "swap X" (fallback)
    r"swap(?:\s+out)?\s+(?:the\s+)?(.+?)(?:\s+please)?$",
    # "instead of X" / "not X"
    r"(?:instead\s+of|not)\s+(?:the\s+)?(.+?)(?:\s+please)?$",
    # "something/anything else instead of / for / other than X"
    r"(?:something|anything)\s+(?:else|different)\s+(?:instead\s+of|for|other\s+than)\s+(?:the\s+)?(.+)",
    # "can I have something other than / instead of X"
    r"(?:can\s+i\s+have|give\s+me)\s+(?:something|anything)\s+(?:other\s+than|instead\s+of)\s+(?:the\s+)?(.+)",
    # "don't want/like X"
    r"don'?t\s+(?:want|like)\s+(?:the\s+)?(.+?)(?:\s+in\s+(?:my|the)\s+(?:meal|plan|option))?",
    # "I'd prefer not to have X" / "prefer not X"
    r"prefer\s+not\s+(?:to\s+have\s+)?(?:the\s+)?(.+?)(?:\s+please|\?|$)",
]

# Intent gate — expanded to cover skip / no / get rid of / prefer
_SUBSTITUTION_INTENT = [
    "replace", "swap", "substitute", "instead of", "something else",
    "anything else", "change", "switch", "remove from", "other than",
    "skip", "get rid of", "no ", "don't want", "dont want",
    "don't like", "dont like", "prefer not", "can you replace",
    "can you change", "can you swap",
]


def detect_substitution_request(message: str):
    """Returns (food_name, opt_n) if message is asking to swap a food, else (None, None)."""
    msg = message.strip().lower()

    if not any(w in msg for w in _SUBSTITUTION_INTENT):
        return None, None

    opt_m = _re.search(r'\boption\s*([123])\b', msg)
    opt_n = int(opt_m.group(1)) if opt_m else None

    for pat in _SUBSTITUTION_PATTERNS:
        m = _re.search(pat, msg)
        if m:
            candidate = m.group(1).strip().rstrip(".,!?")
            # Strip leading articles that confuse fuzzy matching
            candidate = _re.sub(r'^(?:the|a|an|my)\s+', '', candidate)
            matched = fuzzy_match_food(candidate)
            if matched:
                return matched, opt_n

    return None, None


def _pick_substitute(
    state: UserDietState,
    food_name: str,
    slot: str,
    current_option: dict,
    metrics: dict,
) -> dict | None:
    """
    Find a replacement for food_name in the given slot.
    Returns a food dict (same structure as options["foods"]) or None.
    """
    rows = food_df[food_df["food_item"] == food_name]
    if rows.empty:
        return None
    orig = rows.iloc[0]
    orig_role = orig.get("dish_role", "main")
    orig_cal  = float(orig["calories"])

    if slot in ("Lunch", "Dinner"):
        pool = food_df[food_df["meal_type"].isin(["lunch_dinner", "any"])].copy()
    else:
        pool = food_df[food_df["meal_type"].isin([slot.lower(), "any"])].copy()

    if "dish_role" in pool.columns:
        pool = pool[pool["dish_role"] == orig_role]

    allergies = parse_allergy_string(metrics.get("allergies", "") or "")
    pool = apply_allergy_filter(pool, allergies)
    pool = apply_medication_food_filter(pool, metrics)
    pool = apply_medical_condition_filter(pool, metrics)
    pool = rank_foods_for_medical_profile(pool, metrics)

    pool = pool[
        (pool["calories"] >= orig_cal * 0.6) &
        (pool["calories"] <= orig_cal * 1.4)
    ]

    current_names = {f["name"] for f in current_option["foods"]}
    pool = pool[
        ~pool["food_item"].isin(
            current_names | state.disliked_foods | {food_name}
        )
    ]

    if pool.empty:
        return None

    weights = None
    if "_medical_score" in pool.columns:
        scores = pd.to_numeric(pool["_medical_score"], errors="coerce").fillna(0)
        weights = scores - scores.min() + 1.0
    r = pool.sample(
        1,
        random_state=random.randint(0, 9999),
        weights=weights,
    ).iloc[0]
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
        "profile_reasons": medical_food_reasons(r, metrics),
        "medication_notes": medication_food_notes(r, metrics),
        "fiber_g":         round(float(r["fiber_g"]),1) if "fiber_g"   in r.index and not pd.isna(r["fiber_g"])      else None,
    }
