"""
bypass_handlers.py — All bypass detectors, build_messages, weight-goal formatters,
                     prep-filter helpers, and slot helpers used by the stream route.
"""
import re as _re
import json
import datetime as _dt

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from config import SYSTEM_PROMPT
from models import ChatRequest
from kg_queries import (
    detect_entities, build_kg_context, retrieve_condition_foods,
    retrieve_drug_foods, DRUG_SUPPLEMENTAL_NOTES, _CONDITION_ALIAS,
    _CONDITION_DIET_NOTES,
)
from food_db import (
    infer_conditions_from_metrics, build_user_metrics_context,
    get_meal_slotted_foods, parse_allergy_string,
)
from meal_logger import (
    _plan_cache, _weekly_plan, _disliked_foods,
    _persist_cache, _load_cache_from_disk, _save_disliked,
    detect_food_preference, fuzzy_match_food,
    detect_log_summary_request, detect_log_request,
    _log_option, _meal_log, _save_meal_log, _calories_for_food,
    detect_substitution_request, _pick_substitute,
)
from meal_planner import (
    build_meal_plan, build_weekly_meal_plan,
    format_meal_plan_response, format_weekly_plan_response,
    format_week_day_detail, detect_week_day_query,
    detect_weight_change_goal, _format_option,
)

# Lazy import — don't crash if ChromaDB isn't available
try:
    from chroma_food_db import handle_semantic_food_query
    _CHROMA_AVAILABLE = True
except Exception:
    _CHROMA_AVAILABLE = False
    def handle_semantic_food_query(*args, **kwargs):  # type: ignore
        return None

# ── Constants ─────────────────────────────────────────────────────────────────

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

_PREP_EXCLUDE_PATTERNS = [
    (["no fried", "avoid fried", "without fried", "not fried", "no fry",
      "oil free", "oil-free", "no oily", "without oil", "less oil",
      "reduce oil", "low oil", "no deep fry", "no shallow fry"],
     ["deep_fried", "shallow_fried"]),
    (["only steamed", "steamed only", "only boiled", "boiled only",
      "light cooking", "healthy cooking", "no stir fry", "no stir-fry",
      "no wok", "no kottu", "without kottu"],
     ["deep_fried", "shallow_fried", "stir_fried"]),
    (["no deep fried", "avoid deep fried", "without deep fried",
      "not deep fried", "no deep-fried"],
     ["deep_fried"]),
]


# ── Greeting ──────────────────────────────────────────────────────────────────

def get_time_greeting() -> str:
    hour = _dt.datetime.now().hour
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


# ── build_messages (LLM context assembly) ─────────────────────────────────────

def build_messages(req: ChatRequest):
    metrics = req.user_metrics or {}
    conditions, drugs, allergies = detect_entities(req.message)

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

    for cond in infer_conditions_from_metrics(metrics):
        if cond not in conditions:
            conditions.append(cond)

    db_allergies = parse_allergy_string(metrics.get("allergies", ""))
    for a in db_allergies:
        if a not in allergies:
            allergies.append(a)

    msg_lower = req.message.lower()

    MEAL_KEYWORDS = {
        "eat", "food", "meal", "breakfast", "lunch", "dinner", "snack",
        "diet", "recipe", "cook", "drink", "fruit", "vegetable", "protein",
        "calorie", "carb", "fat", "nutrition", "suggest", "recommend",
        "menu", "what should", "what can", "avoid", "safe to eat",
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

    kg_context     = build_kg_context(req.message, entities=(conditions, drugs, allergies)) if needs_kg_context else ""
    metrics_context = build_user_metrics_context(effective_metrics)
    meal_context    = get_meal_slotted_foods(effective_metrics) if (metrics and needs_meal_context) else ""

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

    recent = req.history[-6:]
    msgs = [SystemMessage(content=SYSTEM_PROMPT)]
    for m in recent:
        msgs.append(HumanMessage(content=m.content) if m.role == "user" else AIMessage(content=m.content))
    msgs.append(HumanMessage(content=user_content))
    return msgs


# ── Weight goal formatters ────────────────────────────────────────────────────

def format_weight_goal_answer(calc: str, metrics: dict) -> str:
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
        verb   = "gain" if direction == "gain" else "lose"
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


# ── Weight query detectors ────────────────────────────────────────────────────

def detect_time_to_goal_query(message: str, metrics: dict) -> str:
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
    if _re.search(r'\d+(?:\.\d+)?\s*(?:kg|g\b|lbs?|pounds?)', msg):
        return ""

    est_weeks   = metrics.get("estimated_weeks_to_goal")
    to_goal_kg  = abs(float(metrics.get("weight_to_goal_kg") or 0))
    ideal_kg    = metrics.get("ideal_weight_kg")
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
    msg = message.lower()
    if not any(w in msg for w in ("calorie", "calories", "kcal", "caloric", "intake")):
        return ""
    if not any(w in msg for w in ("achieve", "reach", "goal", "target weight", "lose", "loss",
                                   "correct weight", "ideal weight", "get to", "attain")):
        return ""

    target_cal  = metrics.get("target_calories")
    maintenance = metrics.get("maintenance_calories")
    health_goal = (metrics.get("health_goal") or "").lower()
    deficit     = metrics.get("calorie_deficit_surplus")
    est_weeks   = metrics.get("estimated_weeks_to_goal")
    to_goal_kg  = abs(float(metrics.get("weight_to_goal_kg") or 0))
    ideal_kg    = metrics.get("ideal_weight_kg")

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
    msg = message.lower()
    if any(w in msg for w in ("calorie", "calories", "kcal", "maintenance", "deficit", "surplus", "tdee")):
        return ""
    if not any(w in msg for w in ("ideal", "correct", "target", "healthy", "right", "should be",
                                   "supposed to", "recommended", "good weight", "perfect weight",
                                   "according to", "for my", "for my bmi", "for my height")):
        return ""
    if not any(w in msg for w in ("weight", "weigh", "kg", "bmi")):
        return ""

    ideal     = float(metrics.get("ideal_weight_kg") or 0)
    current   = float(metrics.get("weight_kg") or 0)
    height_cm = float(metrics.get("height_cm") or 0)
    bmi       = float(metrics.get("bmi") or 0)
    bmi_cat   = (metrics.get("bmi_category") or "").strip()
    to_goal   = float(metrics.get("weight_to_goal_kg") or 0)
    est_weeks = metrics.get("estimated_weeks_to_goal")

    if not ideal or not current:
        return ""

    height_m     = height_cm / 100 if height_cm else 1.70
    low_healthy  = round(18.5 * height_m ** 2, 1)
    high_healthy = round(24.9 * height_m ** 2, 1)
    diff         = round(current - ideal, 1)
    direction    = "lose" if diff > 0 else "gain"
    diff_abs     = abs(diff)

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
    msg = message.lower()
    has_comparison = (
        ("loss" in msg or "lose" in msg or "losing" in msg) and
        ("gain" in msg or "gaining" in msg)
    )
    if not has_comparison:
        return ""
    if not any(w in msg for w in [
        "which", "what", "should", "better", "good", "recommend",
        "best", "suitable", "right", "ideal", "prefer", "advice",
        "according", "for me", "my condition", "my health",
    ]):
        return ""

    bmi         = float(metrics.get("bmi") or 0)
    raw_goal    = (metrics.get("health_goal") or "").lower().replace("_", " ")
    GOAL_LABELS = {"lose": "Lose weight", "gain": "Gain weight", "maintain": "Maintain weight"}
    health_goal = GOAL_LABELS.get(raw_goal, raw_goal)
    weight_kg   = float(metrics.get("weight_kg") or 0)
    ideal_kg    = float(metrics.get("ideal_weight_kg") or 0)
    to_goal_kg  = float(metrics.get("weight_to_goal_kg") or 0)
    est_weeks   = metrics.get("estimated_weeks_to_goal")
    target_cal  = metrics.get("target_calories")
    bmi_cat     = (metrics.get("bmi_category") or "").strip()

    goal_wants_lose = any(w in raw_goal for w in ["lose", "loss", "cut", "reduce"])
    goal_wants_gain = any(w in raw_goal for w in ["gain", "muscle", "bulk", "increase"])

    if goal_wants_lose or bmi >= 25:
        recommendation = "weight loss"
        icon = "✅"
        reason_bmi  = f"Your BMI is {bmi} ({bmi_cat})" + (" — above the healthy range of 18.5–24.9." if bmi >= 25 else ".")
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
        reason_bmi  = f"Your BMI is {bmi} ({bmi_cat})" + (" — below the healthy range of 18.5–24.9." if bmi < 18.5 else ".")
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
        reason_bmi  = f"Your BMI is {bmi} ({bmi_cat}) — within the healthy range."
        reason_goal = f"Your health goal is set to **{health_goal}**."
        detail   = f"• Current daily calories: {target_cal} kcal"
        counter  = "Focus on maintaining this through a balanced diet and regular activity."

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

    new_weight = current_weight + kg if direction == "gain" else max(current_weight - kg, 0)
    new_bmi    = round(new_weight / ((height_cm / 100) ** 2), 1) if height_cm else 0

    def bmi_category(b):
        if b < 18.5: return "Underweight"
        if b < 25:   return "Normal weight"
        if b < 30:   return "Overweight"
        return "Obese"

    new_cat      = bmi_category(new_bmi)
    goal_wants_gain = any(w in health_goal for w in ["gain", "muscle", "bulk", "increase"])
    goal_wants_lose = any(w in health_goal for w in ["lose", "loss", "weight loss", "cut", "reduce"])
    aligned  = (direction == "gain" and goal_wants_gain) or (direction == "lose" and goal_wants_lose)
    conflicts = (direction == "gain" and goal_wants_lose) or (direction == "lose" and goal_wants_gain)

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
    msg = message.lower()
    pattern = (
        r'(?:how\s+(?:long|many\s+(?:days?|weeks?|months?))'
        r'|(?:how\s+(?:much\s+)?time)'
        r'|(?:time\s+(?:will\s+it\s+take|to|for)))'
        r'.*?(gain|lose)\s+(\d+(?:\.\d+)?)\s*(kg|g|lbs?|pounds?)'
    )
    match = _re.search(pattern, msg)
    if not match:
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

    if weight_unit.startswith("g") and not weight_unit.startswith("ga"):
        kg = weight_val / 1000
    elif weight_unit.startswith("lb") or weight_unit.startswith("pound"):
        kg = weight_val * 0.453592
    else:
        kg = weight_val

    maintenance = int(metrics.get("maintenance_calories") or 2000)
    if direction == "gain":
        safe_daily = 500
        safe_days  = round((kg * 7700) / safe_daily)
        new_target = maintenance + safe_daily
        rate_desc  = "~0.5 kg/week (500 cal/day surplus)"
    else:
        safe_daily = 1000
        safe_days  = round((kg * 7700) / safe_daily)
        new_target = max(maintenance - safe_daily, 1200)
        rate_desc  = "~1 kg/week (1,000 cal/day deficit)"

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


# ── Meal request detectors ────────────────────────────────────────────────────

def is_meal_plan_request(message: str) -> bool:
    return any(t in message.lower() for t in MEAL_PLAN_TRIGGERS)


def is_weekly_plan_request(message: str) -> bool:
    weekly_triggers = [
        "7 day", "7-day", "seven day", "weekly plan", "week plan",
        "full week", "whole week", "week meal", "meal plan for the week",
        "meal plan for a week", "7 days meal", "7days",
    ]
    return any(t in message.lower() for t in weekly_triggers)


def detect_prep_filter(message: str, history: list) -> list:
    combined = message.lower()
    for h in (history or [])[-6:]:
        combined += " " + h.content.lower()
    excluded = set()
    for keywords, methods in _PREP_EXCLUDE_PATTERNS:
        if any(k in combined for k in keywords):
            excluded.update(methods)
    return list(excluded)


def _normalise_meal_msg(message: str) -> str:
    msg = message.strip().lower()
    for variant, canonical in _MEAL_NORMALISE.items():
        msg = msg.replace(variant, canonical)
    return msg


def detect_single_meal_slot(message: str):
    msg = _normalise_meal_msg(message)
    calorie_only = any(p in msg for p in (
        "allocated calorie", "calorie allocation", "calorie for", "calories for",
        "how many calorie", "how much calorie", "calorie target for", "calorie budget",
    ))
    if calorie_only:
        return None
    food_ask = any(w in msg for w in (
        "eat", "food", "suggest", "have", "recommend", "give",
        "order", "get", "prepare", "cook", "make", "plan", "idea",
        "option", "choice", "menu", "show", "list", "for", "about",
    ))
    for keyword, slot in SINGLE_MEAL_SLOTS.items():
        if keyword not in msg:
            continue
        if food_ask:
            return slot
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
    if req.calorie_target_override:
        return req.calorie_target_override
    msg_lower = req.message.lower()
    explicit = _re.search(r'(\d{3,5})\s*(?:cal|kcal|calories)', msg_lower)
    if explicit:
        val = int(explicit.group(1))
        if val > 500:
            return val
    for h in reversed(req.history[-6:]):
        m = _re.search(r'New Daily Calorie Target[:\s]+(\d{3,5})', h.content, _re.IGNORECASE)
        if m:
            return int(m.group(1))
    return int(metrics.get("target_calories") or 2000)


# ── Semantic food query bypass ────────────────────────────────────────────────

def detect_semantic_query(
    message: str,
    metrics: dict,
    exclude_names: set | None = None,
) -> str | None:
    """
    Route natural-language food queries through ChromaDB semantic search.
    Examples:
      "something light and spicy for lunch"
      "high protein breakfast without eggs"
      "low GI dinner options"

    exclude_names : set of food_item strings to exclude from results
                    (used for continuation requests so shown foods are skipped)

    Returns formatted answer string, or None if not a semantic food query
    or if ChromaDB is unavailable.
    """
    if not _CHROMA_AVAILABLE:
        return None
    return handle_semantic_food_query(message, metrics, top_k=5, exclude_names=exclude_names)
