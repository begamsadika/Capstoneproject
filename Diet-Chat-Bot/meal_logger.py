"""
meal_logger.py — Meal plan cache, disliked-food preferences, meal intake log,
                 food substitution, and food preference detection.
"""
import re as _re
import json
import random
import pathlib
import datetime as _dt

import pandas as pd
from rapidfuzz import process as _rfp, fuzz

from food_db import _food_df, food_df

BASE_DIR = pathlib.Path(__file__).parent

# ── Meal plan cache ───────────────────────────────────────────────────────────
_plan_cache:  dict = {}
_weekly_plan: dict = {}   # keyed "Day 1" … "Day 7"
_DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

_CACHE_FILE = BASE_DIR / "DataSets" / ".meal_plan_cache.json"


def _persist_cache() -> None:
    """Write _plan_cache to disk."""
    try:
        _CACHE_FILE.write_text(json.dumps(_plan_cache, default=str))
    except Exception:
        pass

# Alias used in legacy code
_save_cache_to_disk = _persist_cache


def _load_cache_from_disk() -> dict:
    """Read plan cache from disk (fallback after server reload)."""
    try:
        if _CACHE_FILE.exists():
            return json.loads(_CACHE_FILE.read_text())
    except Exception:
        pass
    return {}


# ── Disliked-food preference memory ──────────────────────────────────────────
_disliked_foods: set = set()
_DISLIKE_FILE = BASE_DIR / "DataSets" / ".disliked_foods.json"


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


_load_disliked()

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
_meal_log: list = []
_LOG_FILE = BASE_DIR / "DataSets" / ".meal_log.json"


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
    by_slot: dict = {}
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


def _pick_substitute(food_name: str, slot: str, current_option: dict, metrics: dict) -> dict | None:
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

    pool = pool[
        (pool["calories"] >= orig_cal * 0.6) &
        (pool["calories"] <= orig_cal * 1.4)
    ]

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
