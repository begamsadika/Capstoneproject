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
    retrieve_drug_foods, _CONDITION_ALIAS,
    _CONDITION_DIET_NOTES,
)
from food_db import (
    infer_conditions_from_metrics, build_user_metrics_context,
    get_meal_slotted_foods, parse_allergy_string, parse_medical_conditions,
    apply_allergy_filter, apply_medical_condition_filter,
    canonical_food_key, rank_foods_for_medical_profile, _food_df,
)
from meal_logger import fuzzy_match_food
from meal_planner import (
    detect_weight_change_goal, _format_option,
)
from medication_rules import (
    apply_medication_food_filter,
    medication_guidance,
    parse_medications,
)


GENERAL_SYSTEM_PROMPT = """You are Wellora, a concise dietary and health education assistant.
Answer the user's general question directly in 2-4 clear sentences. Personalize only
when a supplied health-profile fact is genuinely relevant. Do not invent diagnoses,
food records, nutrition values, or medication instructions. Do not add meal plans or
food lists unless the user explicitly asks for them. For medical concerns, give general
education and recommend professional advice when appropriate."""

# Lazy import — don't crash if ChromaDB isn't available
_CHROMA_AVAILABLE = True


def handle_semantic_food_query(*args, **kwargs):
    """Load the optional semantic-search stack only for semantic queries."""
    from chroma_food_db import handle_semantic_food_query as _implementation
    return _implementation(*args, **kwargs)

# ── Constants ─────────────────────────────────────────────────────────────────

MEAL_PLAN_TRIGGERS = {
    "meal plan", "day plan", "full day", "daily plan",
    "give me a plan", "plan for the day", "what to eat today",
    "suggest a day", "one day meal", "today's meal",
}

REMAINING_DAY_PLAN_TRIGGERS = {
    "rest of today", "rest of the day", "remaining day", "remaining meals",
    "meals left today", "based on what i ate", "based on what i've eaten",
    "based on what i have eaten", "adjust my remaining", "adjust the remaining",
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


def detect_profile_fact_query(message: str, metrics: dict) -> str:
    """Answer direct requests for recorded body facts without calling the LLM."""
    msg = " ".join(message.lower().strip().rstrip("!?.,").split())
    recommendation_words = (
        "should", "ideal", "target", "healthy", "correct", "recommended",
    )

    bmi_request = bool(
        _re.search(
            r"\b(?:what(?:'s| is)|tell me|show me)\s+my\s+(?:current\s+)?bmi\b",
            msg,
        )
        or _re.search(r"\bmy current bmi\b", msg)
    )
    if bmi_request and not any(word in msg for word in recommendation_words):
        try:
            bmi = float(metrics.get("bmi"))
        except (TypeError, ValueError):
            return (
                "Your current BMI is not available because your health profile is "
                "incomplete. Please update your height and weight."
            )

        category = str(metrics.get("bmi_category") or "").strip()
        category_text = f" ({category})" if category else ""
        lines = [f"Your current recorded BMI is **{bmi:g}{category_text}**."]

        try:
            weight = float(metrics.get("weight_kg"))
            height_cm = float(metrics.get("height_cm"))
        except (TypeError, ValueError):
            weight = height_cm = 0
        if weight > 0 and height_cm > 0:
            height_m = height_cm / 100
            lines.extend([
                "",
                f"Calculation: {weight:g} kg ÷ ({height_m:g} m × {height_m:g} m) "
                f"= **{bmi:g}**.",
            ])
        if bmi < 16:
            lines.extend([
                "",
                "⚠️ Because your recorded BMI is very low, discuss a safe weight-gain "
                "plan with a doctor or registered dietitian.",
            ])
        return "\n".join(lines)

    current_weight_request = bool(
        _re.search(
            r"\bwhat(?:'s| is)\s+my\s+(?:current\s+)?(?:body\s+)?weight\b",
            msg,
        )
        or _re.search(r"\bhow much do i weigh\b", msg)
    )
    if current_weight_request and not any(word in msg for word in recommendation_words):
        try:
            weight = float(metrics.get("weight_kg"))
        except (TypeError, ValueError):
            return "Your current weight is not available in your health profile."
        answer = f"Your current recorded body weight is **{weight:g} kg**."
        try:
            bmi = float(metrics.get("bmi"))
        except (TypeError, ValueError):
            bmi = 0
        if bmi > 0:
            answer += f"\n\nYour recorded BMI is **{bmi:g}**."
        return answer

    height_request = bool(
        _re.search(r"\bwhat(?:'s| is)\s+my\s+(?:current\s+)?height\b", msg)
        or _re.search(r"\bhow tall am i\b", msg)
    )
    if height_request:
        try:
            height_cm = float(metrics.get("height_cm"))
        except (TypeError, ValueError):
            return "Your height is not available in your health profile."
        return f"Your recorded height is **{height_cm:g} cm**."

    return ""


def detect_bmi_faq_query(message: str) -> str:
    """Explain BMI generally without treating the question as a profile lookup."""
    msg = " ".join(message.lower().strip().rstrip("!?.,").split())
    if not (
        _re.fullmatch(r"what(?:'s| is) (?:a )?bmi", msg)
        or _re.fullmatch(r"what does bmi mean", msg)
        or _re.fullmatch(r"(?:explain|define) bmi", msg)
        or _re.fullmatch(r"what is the meaning of bmi", msg)
        or _re.fullmatch(r"how is bmi calculated", msg)
    ):
        return ""

    return (
        "**BMI (Body Mass Index)** is a screening measurement that compares your "
        "weight with your height.\n\n"
        "**Formula:** weight in kilograms ÷ height in metres²\n\n"
        "For adults, the commonly used categories are:\n"
        "- **Below 18.5:** Underweight\n"
        "- **18.5–24.9:** Healthy weight range\n"
        "- **25.0–29.9:** Overweight\n"
        "- **30 or higher:** Obesity range\n\n"
        "BMI is a screening tool, not a diagnosis. It does not directly measure body "
        "fat or account for factors such as muscle mass, age, pregnancy, or individual "
        "medical history."
    )


# ── build_messages (LLM context assembly) ─────────────────────────────────────

def _bounded_recent_history(history, *, max_messages: int = 6, max_chars: int = 2000):
    """Keep recent turns useful without overflowing the local model context."""
    selected = []
    remaining = max_chars
    for message in reversed(history[-max_messages:]):
        content = str(message.content or "").strip()
        if not content:
            continue
        if len(content) > remaining:
            if not selected and remaining >= 500:
                content = content[-remaining:]
            else:
                break
        selected.append((message.role, content))
        remaining -= len(content)
        if remaining <= 0:
            break
    selected.reverse()
    return selected


def build_messages(req: ChatRequest):
    metrics = req.user_metrics or {}
    conditions, drugs, allergies = detect_entities(req.message)

    profile_medical_text = "\n".join(
        str(metrics.get(key) or "")
        for key in ("medical_conditions", "medications")
    )
    p_conds, p_drugs, p_allergies = detect_entities(profile_medical_text)
    for c in p_conds:
        if c not in conditions:
            conditions.append(c)
    for d in p_drugs:
        if d not in drugs:
            drugs.append(d)
    for a in p_allergies:
        if a not in allergies:
            allergies.append(a)

    if req.conversation_summary:
        s_conds, s_drugs, s_allergies = detect_entities(req.conversation_summary)
        for c in s_conds:
            if c not in conditions:
                conditions.append(c)
        for d in s_drugs:
            if d not in drugs:
                drugs.append(d)
        for a in s_allergies:
            if a not in allergies:
                allergies.append(a)

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

    MEAL_REQUEST_KEYWORDS = {
        "meal", "breakfast", "lunch", "dinner", "snack", "recipe", "menu",
        "suggest", "recommend", "what should i eat", "what can i eat",
        "what to eat", "foods for", "food for", "foods to avoid",
        "food to avoid", "safe to eat", "break fast", "breckfast",
        "brekfast", "supper", "tiffin", "snacks",
    }
    KG_KEYWORDS = {
        "condition", "diabetes", "hypertension", "heart", "blood pressure",
        "pressure", "obesity", "overweight", "medication", "drug", "medicine",
        "taking", "aspirin", "metformin", "warfarin", "paracetamol",
        "ibuprofen", "atorvastatin", "lisinopril", "amoxicillin",
    }
    MEDICAL_FOOD_KEYWORDS = {
        "interaction", "avoid", "safe to eat", "foods for my condition",
        "food for my condition", "foods for my medication",
        "food for my medication", "diet for", "what can i eat",
    }
    needs_meal_context = any(
        keyword in msg_lower for keyword in MEAL_REQUEST_KEYWORDS
    )
    needs_kg_context = any(keyword in msg_lower for keyword in KG_KEYWORDS) or (
        bool(conditions or drugs)
        and any(keyword in msg_lower for keyword in MEDICAL_FOOD_KEYWORDS)
    )

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
        if calorie_override is None and req.conversation_summary:
            m = _re.search(
                r'(?:New Daily Calorie Target|calorie target)[:\s*]+(\d{3,5})',
                req.conversation_summary,
                _re.IGNORECASE,
            )
            if m:
                calorie_override = int(m.group(1))

    effective_metrics = dict(metrics)
    if calorie_override and calorie_override != metrics.get("target_calories"):
        effective_metrics["target_calories"] = calorie_override

    kg_context     = build_kg_context(req.message, entities=(conditions, drugs, allergies)) if needs_kg_context else ""
    metrics_context = build_user_metrics_context(effective_metrics)
    meal_context    = get_meal_slotted_foods(effective_metrics) if (metrics and needs_meal_context) else ""

    parts = []
    if metrics_context:
        parts.append(metrics_context)
    if req.conversation_summary:
        parts.append(
            "[Older Conversation Memory — use only as background; the health "
            "profile and recent messages take priority]\n"
            + req.conversation_summary.strip()
        )
    if calorie_override and calorie_override != metrics.get("target_calories"):
        parts.append(f"[Active Calorie Target for this request: {calorie_override} cal/day — use this for meal planning]")
    if meal_context:
        parts.append(meal_context)
    if kg_context:
        parts.append(f"[Knowledge Graph Data]\n{kg_context}")
    parts.append(f"User question: {req.message}")
    user_content = "\n\n".join(parts)

    is_retrieval_question = needs_meal_context or needs_kg_context
    recent = _bounded_recent_history(
        req.history,
        max_chars=2000 if is_retrieval_question else 1000,
    )
    system_prompt = SYSTEM_PROMPT if is_retrieval_question else GENERAL_SYSTEM_PROMPT
    msgs = [SystemMessage(content=system_prompt)]
    for role, content in recent:
        msgs.append(HumanMessage(content=content) if role == "user" else AIMessage(content=content))
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


_ACTIVITY_FACTORS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}


def _history_mentions_maintenance_calories(history) -> bool:
    """Return whether a recent assistant response established calorie context."""
    for item in reversed(list(history or [])[-6:]):
        role = getattr(item, "role", None)
        content = getattr(item, "content", None)
        if isinstance(item, dict):
            role = item.get("role")
            content = item.get("content")
        if str(role or "").lower() != "assistant":
            continue
        text = str(content or "").lower()
        return "maintenance calor" in text or "tdee" in text
    return False


def _format_maintenance_calculation(metrics: dict) -> str:
    """Explain the exact profile calculation without requiring the LLM."""
    try:
        maintenance = round(float(metrics.get("maintenance_calories")))
    except (TypeError, ValueError):
        return ""

    activity_key = str(metrics.get("activity_level") or "moderate").strip().lower()
    activity_key = activity_key.replace(" ", "_").replace("-", "_")
    activity_factor = _ACTIVITY_FACTORS.get(activity_key, 1.55)
    activity_label = activity_key.replace("_", " ").title()

    try:
        bmr = float(metrics.get("bmr"))
    except (TypeError, ValueError):
        bmr = maintenance / activity_factor

    target = metrics.get("target_calories")
    try:
        target_value = round(float(target)) if target not in (None, "") else None
    except (TypeError, ValueError):
        target_value = None

    calculated_maintenance = round(bmr * activity_factor)
    lines = [
        "Your maintenance calories are calculated in two steps:",
        "",
        "1. **Basal Metabolic Rate (BMR):** Wellora uses the Mifflin–St Jeor "
        "equation with the weight, height, age, and sex saved in your profile.",
        f"   Your estimated BMR is **{bmr:,.1f} kcal/day**.",
        "2. **Activity adjustment:** BMR is multiplied by your activity factor.",
        f"   {bmr:,.1f} × {activity_factor:g} ({activity_label}) "
        f"= **{calculated_maintenance:,} kcal/day**.",
        "",
        f"After rounding, your saved maintenance estimate is **{maintenance:,} kcal/day**.",
    ]

    if target_value is not None:
        difference = target_value - maintenance
        if difference > 0:
            adjustment = f"adds a **{difference:,} kcal/day surplus**"
        elif difference < 0:
            adjustment = f"applies a **{abs(difference):,} kcal/day deficit**"
        else:
            adjustment = "does not apply a calorie adjustment"
        lines.extend([
            "",
            f"For your current goal, Wellora {adjustment}, giving you a target of "
            f"**{target_value:,} kcal/day**.",
        ])

    lines.extend([
        "",
        "*This is an estimate and should be recalculated when your weight or "
        "activity level changes.*",
    ])
    return "\n".join(lines)


def detect_goal_calorie_query(message: str, metrics: dict, history=None) -> str:
    msg = message.lower()

    # Personal maintenance-calorie questions can be answered immediately from
    # the saved profile. Keep generic educational questions (for example,
    # "how are maintenance calories calculated?") available to the normal
    # knowledge/LLM route.
    maintenance_topic = (
        "tdee" in msg
        or (
            any(w in msg for w in ("maintenance", "maintain"))
            and any(w in msg for w in ("calorie", "calories", "kcal", "intake"))
        )
    )
    personal_reference = bool(_re.search(r"\b(my|mine|me|i)\b", msg))

    calculation_intent = bool(_re.search(
        r"\b(?:how\s+(?:is|are|was|were|did)|explain|show)\b.*"
        r"\b(?:calculat(?:e|ed|ion)|work(?:ed)?\s+out|formula)\b"
        r"|\bwhere\s+did\b.*\bcome\s+from\b",
        msg,
    ))
    ambiguous_calculation_follow_up = bool(_re.search(
        r"\bhow\s+(?:is|are|was|were)\s+(?:it|that|this|they|these)\s+"
        r"calculat(?:e|ed)\b|\bexplain\s+(?:it|that|this|the\s+calculation)\b",
        msg,
    ))
    has_maintenance_context = maintenance_topic or (
        ambiguous_calculation_follow_up
        and _history_mentions_maintenance_calories(history)
    )

    if calculation_intent and has_maintenance_context and (
        personal_reference or _history_mentions_maintenance_calories(history)
    ):
        return _format_maintenance_calculation(metrics)

    if maintenance_topic and personal_reference:
        maintenance = metrics.get("maintenance_calories")
        if maintenance in (None, ""):
            return (
                "I cannot calculate your maintenance calories yet because your "
                "health profile is incomplete. Please update your age, height, "
                "weight, gender, and activity level, then try again."
            )

        try:
            maintenance_value = round(float(maintenance))
        except (TypeError, ValueError):
            return ""

        target = metrics.get("target_calories")
        health_goal = str(metrics.get("health_goal") or "").replace("_", " ").strip().lower()
        if health_goal.startswith("gain"):
            health_goal = "weight gain"
        elif health_goal.startswith("lose") or health_goal.startswith("loss"):
            health_goal = "weight loss"
        elif health_goal.startswith("maintain"):
            health_goal = "weight maintenance"
        lines = [
            f"Your estimated maintenance calories are **{maintenance_value:,} kcal/day**.",
            "",
            "This is the approximate amount of energy needed to maintain your "
            "current weight based on the information and activity level saved in your profile.",
        ]

        try:
            target_value = round(float(target)) if target not in (None, "") else None
        except (TypeError, ValueError):
            target_value = None

        if target_value is not None:
            difference = target_value - maintenance_value
            if difference > 0:
                comparison = f"a **{difference:,} kcal/day surplus**"
            elif difference < 0:
                comparison = f"a **{abs(difference):,} kcal/day deficit**"
            else:
                comparison = "the same as your maintenance level"

            goal_text = f" for your **{health_goal}** goal" if health_goal else ""
            lines.extend([
                "",
                f"Your current calorie target{goal_text} is **{target_value:,} kcal/day** — {comparison}.",
            ])

        lines.extend([
            "",
            "*This is an estimate; update your profile if your weight or activity level changes.*",
        ])
        return "\n".join(lines)

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
    # A requested duration for gaining/losing a stated amount is a timeline
    # question, even when the user uses the word "correct". Let the dedicated
    # safe-timeline handler answer it instead of repeating the ideal weight.
    timeline_intent = (
        any(term in msg for term in (
            "how long", "time period", "timeline", "duration",
            "how many days", "how many weeks", "how many months",
        ))
        or bool(_re.search(r"\btime\b.*\b(?:gain|lose)\b", msg))
    )
    if timeline_intent:
        return ""

    explanation_intent = any(
        phrase in msg
        for phrase in (
            "why is", "why are", "why was", "why would", "explain why",
            "how is that", "how is it", "how can that", "what makes",
            "considered a healthy weight", "considered healthy",
        )
    )
    if explanation_intent and "healthy" in msg and "weight" in msg:
        try:
            height_cm = float(metrics.get("height_cm") or 0)
            ideal = float(metrics.get("ideal_weight_kg") or 0)
        except (TypeError, ValueError):
            return ""
        if not height_cm or not ideal:
            return ""

        height_m = height_cm / 100
        low_healthy = round(18.5 * height_m ** 2, 1)
        high_healthy = round(24.9 * height_m ** 2, 1)
        ideal_bmi = round(ideal / (height_m ** 2), 1)
        return (
            "The app considers it a healthy weight because it falls within the "
            "BMI-based healthy range calculated for your height.\n\n"
            f"For your height of **{height_cm:g} cm**:\n"
            f"• Lower end: 18.5 × {height_m:g}² = **{low_healthy} kg**\n"
            f"• Upper end: 24.9 × {height_m:g}² = **{high_healthy} kg**\n"
            f"• Your estimated ideal weight of **{ideal:g} kg** corresponds to a "
            f"BMI of approximately **{ideal_bmi}**, which is inside that range.\n\n"
            "This is a screening estimate rather than one perfect weight. Body "
            "composition, medical history, and individual needs can also affect "
            "what is appropriate for you."
        )
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

    # Resolve short follow-ups to the wording used by the ideal-weight answer.
    # This is profile math, so it should not wait for the general-purpose LLM.
    safe_pace_follow_up = (
        any(phrase in msg for phrase in ("safe pace", "safe rate"))
        and any(word in msg for word in ("mean", "means", "meaning", "explain", "why"))
    )
    if safe_pace_follow_up:
        health_goal = str(metrics.get("health_goal") or "").lower().replace("_", " ")
        direction = "gain" if "gain" in health_goal else "lose" if "lose" in health_goal else "maintain"
        to_goal_kg = abs(float(metrics.get("weight_to_goal_kg") or 0))
        estimated_weeks = metrics.get("estimated_weeks_to_goal")
        maintenance = int(float(metrics.get("maintenance_calories") or 0))
        target = int(float(metrics.get("target_calories") or 0))
        bmi = float(metrics.get("bmi") or 0)

        if direction == "gain":
            rate_kg = 0.5
            direction_label = "weight gain"
            rate_description = "approximately **0.5 kg per week**"
        elif direction == "lose":
            rate_kg = 1.0
            direction_label = "weight loss"
            rate_description = "up to approximately **1 kg per week**"
        else:
            return (
                "**At a safe pace** means making gradual, sustainable changes "
                "instead of changing your weight rapidly. Since your goal is weight "
                "maintenance, focus on staying close to your maintenance calories "
                "and monitoring your weight over time."
            )

        lines = [
            "**At a safe pace** means changing your weight gradually so your body "
            "has time to adapt while you maintain balanced nutrition.",
            "",
            "**For your profile:**",
            f"• Goal: **{direction_label}**",
            f"• Planned safe rate: {rate_description}",
        ]

        if to_goal_kg:
            lines.append(f"• Weight change needed: **{to_goal_kg:.1f} kg**")
        if to_goal_kg and estimated_weeks:
            calculated_weeks = round(to_goal_kg / rate_kg, 1)
            lines.append(
                f"• Calculation: {to_goal_kg:.1f} kg ÷ {rate_kg:g} kg/week "
                f"= {calculated_weeks:g} weeks, rounded to approximately "
                f"**{estimated_weeks} weeks**"
            )

        if maintenance and target:
            calorie_difference = target - maintenance
            if calorie_difference > 0:
                calorie_label = f"a {calorie_difference} kcal/day surplus"
            elif calorie_difference < 0:
                calorie_label = f"a {abs(calorie_difference)} kcal/day deficit"
            else:
                calorie_label = "your maintenance level"
            lines.append(
                f"• Calorie plan: **{target} kcal/day**, which is {calorie_label}"
            )

        lines.extend([
            "",
            "Going substantially faster can make the plan harder to sustain and may "
            "increase unwanted fat gain during weight gain or muscle loss during weight loss.",
        ])
        if bmi and bmi < 16:
            lines.extend([
                "",
                "⚠️ Because your recorded BMI is very low, make major weight or calorie "
                "changes with guidance from a doctor or registered dietitian.",
            ])
        return "\n".join(lines)

    pattern = (
        r'(?:how\s+(?:long|many\s+(?:days?|weeks?|months?))'
        r'|(?:how\s+(?:much\s+)?time)'
        r'|(?:time\s+(?:will\s+it\s+take|to|for)))'
        r'.*?(gain|lose)\s+(\d+(?:\.\d+)?)\s*(kg|g|lbs?|pounds?)'
    )
    match = _re.search(pattern, msg)
    if not match:
        match = _re.search(
            r'(?:correct|safe|healthy|realistic|proper|recommended|right)\s+'
            r'(?:(?:time\s+)?period|timeline|duration|time)\s+'
            r'(?:to|for)\s+(gain|lose)\s+(\d+(?:\.\d+)?)\s*'
            r'(kg|g|lbs?|pounds?)',
            msg,
        )
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


def is_remaining_day_plan_request(message: str) -> bool:
    msg = message.lower()
    return any(trigger in msg for trigger in REMAINING_DAY_PLAN_TRIGGERS)


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


def detect_low_calorie_slot_query(
    message: str,
    metrics: dict,
    disliked_foods: set[str] | None = None,
) -> str:
    """Return individual low-calorie foods instead of filling a slot budget."""
    msg = _normalise_meal_msg(message)
    if not any(
        phrase in msg
        for phrase in ("low calorie", "low-calorie", "low cal", "fewer calories")
    ):
        return ""

    slot = next(
        (value for keyword, value in SINGLE_MEAL_SLOTS.items() if keyword in msg),
        None,
    )
    if not slot:
        return ""
    if not any(
        word in msg
        for word in ("option", "idea", "food", "meal", "eat", "snack", "suggest", "recommend")
    ):
        return ""

    foods = _food_df.copy()
    pref = str(metrics.get("dietary_preference") or "").lower()
    if "diet_type" in foods.columns:
        if "vegan" in pref:
            foods = foods[foods["diet_type"] == "vegan"]
        elif "veg" in pref:
            foods = foods[foods["diet_type"].isin(["vegan", "vegetarian"])]
        elif "pescatarian" in pref:
            foods = foods[
                foods["diet_type"].isin(["vegan", "vegetarian", "pescatarian"])
            ]

    meal_types = ["lunch_dinner"] if slot in {"Lunch", "Dinner"} else [slot.lower()]
    if "meal_type" in foods.columns:
        foods = foods[foods["meal_type"].isin(meal_types)]

    foods = apply_allergy_filter(
        foods,
        parse_allergy_string(str(metrics.get("allergies") or "")),
    )
    foods = apply_medication_food_filter(foods, metrics)
    foods = apply_medical_condition_filter(foods, metrics)
    if disliked_foods:
        disliked_keys = {canonical_food_key(name) for name in disliked_foods}
        foods = foods[
            ~foods["food_item"].map(canonical_food_key).isin(disliked_keys)
        ]

    # Do not promote a fried food merely because its listed portion is small.
    if "prep_method" in foods.columns:
        non_fried = foods[
            foods["prep_method"].astype(str).str.lower() != "deep_fried"
        ]
        if not non_fried.empty:
            foods = non_fried

    foods = rank_foods_for_medical_profile(foods, metrics)
    foods["_calories"] = foods["calories"].fillna(0).astype(float)
    foods = foods.sort_values(
        ["_calories", "_medical_score", "protein_g"],
        ascending=[True, False, False],
    )

    selected = []
    seen = set()
    for _, row in foods.iterrows():
        key = canonical_food_key(str(row.get("food_item") or ""))
        if not key or key in seen:
            continue
        seen.add(key)
        selected.append(row)
        if len(selected) == 5:
            break
    if not selected:
        return ""

    lines = [
        f"**Low-Calorie {slot} Options**",
        "",
        "These are individual choices, sorted from lowest to highest calories:",
        "",
    ]
    for row in selected:
        serving = row.get("serving_size_g")
        serving_text = (
            f" ({float(serving):g} g)"
            if serving is not None and str(serving) != "nan"
            else ""
        )
        gi = str(row.get("gi_category") or "").strip().lower()
        gi_text = f" | GI: {gi}" if gi and gi != "nan" else ""
        lines.append(
            f"- **{row['food_item']}**{serving_text} — "
            f"{round(float(row['calories']))} kcal | "
            f"Protein: {round(float(row.get('protein_g') or 0), 1)} g{gi_text}"
        )
    lines.extend((
        "",
        "These foods were filtered using your dietary preference, allergies, "
        "medical conditions, medications, and disliked foods.",
        "Choose one option, or combine foods only when you want a larger snack.",
    ))
    return "\n".join(lines)


def format_single_slot_response(slot: str, plan: dict) -> str:
    s = plan[slot]
    lines = []
    progress = plan.get("daily_progress") or {}
    if plan.get("is_remaining_day_plan"):
        consumed = progress.get("consumed", {})
        remaining = progress.get("remaining", {})
        completed = progress.get("completed_slots", [])
        lines.extend((
            "## Today's progress",
            "",
            f"- **Consumed:** {consumed.get('calories', 0)} kcal · "
            f"Protein {consumed.get('protein_g', 0)} g · "
            f"Carbs {consumed.get('carbs_g', 0)} g · Fat {consumed.get('fat_g', 0)} g",
            f"- **Remaining:** {remaining.get('calories', 0)} kcal · "
            f"Protein {remaining.get('protein_g', 0)} g · "
            f"Carbs {remaining.get('carbs_g', 0)} g · Fat {remaining.get('fat_g', 0)} g",
        ))
        if completed:
            lines.append("- **Completed meals:** " + ", ".join(completed))
        lines.append("")
    lines.extend((
        f"## {slot} options",
        "",
        f"Target for this meal: **approximately {s['target_kcal']} kcal**. Choose one option.",
        "",
    ))
    for i, opt in enumerate(s.get("options", []), 1):
        lines.extend(_format_option(opt, f"Option {i}"))
        lines.append("")
    lines.extend((
        "---",
        "_These foods come from your personalized database. Your remaining daily "
        "nutrition totals will be updated after you select an option._",
    ))
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
    if req.conversation_summary:
        m = _re.search(
            r'(?:New Daily Calorie Target|calorie target)[:\s*]+(\d{3,5})',
            req.conversation_summary,
            _re.IGNORECASE,
        )
        if m:
            return int(m.group(1))
    return int(metrics.get("target_calories") or 2000)


def detect_profile_condition_food_query(
    message: str,
    metrics: dict,
    conversation_summary: str | None = None,
) -> str | None:
    """Answer vague profile references without sending them to the LLM.

    The current health profile stores BMI and a weight goal, but not a diagnosed
    chronic condition. This handler therefore provides profile-based guidance
    without inventing a medical diagnosis.
    """
    msg = message.strip().lower()
    profile_reference = any(phrase in msg for phrase in (
        "my condition", "my health condition", "according to my condition",
        "based on my condition", "for my health profile", "based on my profile",
    ))
    food_request = any(phrase in msg for phrase in (
        "food", "eat", "diet", "avoid", "limit", "not to eat",
        "shouldn't eat", "should not eat",
    ))
    if not (profile_reference and food_request):
        return None

    entity_text = message
    if conversation_summary:
        entity_text += "\n" + conversation_summary
    explicit_conditions, explicit_drugs, _ = detect_entities(entity_text)
    if explicit_conditions or explicit_drugs:
        return None

    stored_conditions = (
        metrics.get("medical_conditions")
        or metrics.get("conditions")
        or []
    )
    if isinstance(stored_conditions, str):
        stored_conditions = [
            item.strip() for item in stored_conditions.split(",") if item.strip()
        ]
    profile_conditions = []
    for item in stored_conditions:
        recognized_conditions, _, _ = detect_entities(str(item))
        if recognized_conditions:
            profile_conditions.extend(recognized_conditions)
        elif str(item).strip():
            profile_conditions.append(str(item).strip())

    stored_medications = metrics.get("medications") or ""
    medication_items = (
        [item.strip() for item in stored_medications.split(",") if item.strip()]
        if isinstance(stored_medications, str)
        else [str(item).strip() for item in stored_medications if str(item).strip()]
    )
    profile_drugs = []
    for item in medication_items:
        _, recognized_drugs, _ = detect_entities(item)
        profile_drugs.extend(recognized_drugs or [item])

    profile_conditions = list(dict.fromkeys(profile_conditions))
    profile_drugs = list(dict.fromkeys(profile_drugs))
    if profile_conditions or profile_drugs:
        return format_profile_medical_food_guidance(
            profile_conditions,
            profile_drugs,
            metrics,
        )

    bmi = metrics.get("bmi")
    bmi_category = str(metrics.get("bmi_category") or "").strip()
    health_goal = str(metrics.get("health_goal") or "").lower().replace("_", " ").strip()
    preference = str(metrics.get("dietary_preference") or "").strip()
    preference_lower = preference.lower()
    allergies = parse_allergy_string(str(metrics.get("allergies") or ""))
    weight_to_goal = metrics.get("weight_to_goal_kg")
    weeks_to_goal = metrics.get("estimated_weeks_to_goal")

    goal_label = {
        "lose": "weight loss",
        "gain": "weight gain",
        "maintain": "weight maintenance",
    }.get(health_goal, health_goal or "general health")
    preference_label = {
        "veg": "vegetarian",
        "vegetarian": "vegetarian",
        "vegan": "vegan",
        "non-veg": "non-vegetarian",
        "non veg": "non-vegetarian",
        "pescatarian": "pescatarian",
    }.get(preference_lower, preference or "not specified")
    allergy_labels = {
        "nut": "Nuts",
        "dairy": "Dairy",
        "gluten": "Gluten",
        "seafood": "Seafood",
        "egg": "Eggs",
        "soy": "Soy",
    }
    allergy_avoidance = {
        "nut": "Foods containing peanuts or tree nuts, including nut butter, nut milk, and cashew paste",
        "dairy": "Milk, curd, yogurt, cheese, butter, and other dairy ingredients",
        "gluten": "Wheat, regular bread, roti, pasta, and other gluten-containing foods",
        "seafood": "Fish, prawns, crab, shellfish, and other seafood",
        "egg": "Eggs and foods prepared with egg",
        "soy": "Soy, soya, tofu, tempeh, and soy-containing products",
    }

    lines = [
        f"Since your dietary preference is **{preference_label}** and your goal is "
        f"**{goal_label}**, I can give profile-based guidance immediately. Your saved "
        "profile does **not** currently specify a diagnosed medical condition or "
        "medication, so I should not invent condition-specific food interactions.",
        "",
        "**Your profile:**",
        f"• Dietary preference: **{preference_label}**",
        f"• Allergies: **{', '.join(allergy_labels.get(a, a.title()) for a in allergies) if allergies else 'None specified'}**",
        f"• Goal: **{goal_label}**",
    ]
    if bmi is not None and bmi_category:
        lines.append(f"• BMI: **{bmi} ({bmi_category})**")
    if weight_to_goal not in (None, 0) and weeks_to_goal:
        direction = "lose" if health_goal == "lose" else "gain"
        lines.append(
            f"• Target: **{direction} {abs(float(weight_to_goal)):.1f} kg over "
            f"approximately {weeks_to_goal} weeks**"
        )

    lines.extend(["", "**Foods to avoid or limit:**"])
    for allergy in allergies:
        lines.append(
            f"• **{allergy_labels.get(allergy, allergy.title())}:** "
            f"{allergy_avoidance.get(allergy, f'Foods containing {allergy}')}"
        )

    if "vegan" in preference_lower:
        lines.append("• **Diet preference:** Meat, poultry, seafood, dairy, and eggs")
    elif "veg" in preference_lower:
        lines.append("• **Diet preference:** Meat, poultry, and seafood")
    elif "pescatarian" in preference_lower:
        lines.append("• **Diet preference:** Meat and poultry")

    if health_goal == "lose" or bmi_category.lower() in {"overweight", "obese"}:
        lines.extend([
            "• **Weight management:** Sugary drinks, sweets, and frequent desserts",
            "• **Weight management:** Deep-fried or very oily foods",
            "• **Weight management:** Large portions of refined carbohydrates and highly processed snacks",
        ])

    meal_context = get_meal_slotted_foods(metrics)
    meal_lines = [
        line for line in meal_context.splitlines()
        if line.startswith(("Breakfast", "Lunch", "Dinner", "Snack"))
    ]
    if meal_lines:
        lines.extend(["", "**Suitable foods from your filtered food database:**"])
        for meal_line in meal_lines:
            slot, _, foods = meal_line.partition(":")
            slot = _re.sub(r"\s*\([^)]*\)\s*$", "", slot).strip()
            lines.append(f"• **{slot}:** {foods.strip()}")
        lines.append(
            "\nThese suggestions were filtered using your stored dietary preference "
            "and allergies."
        )

    lines.append(
        "\nIf you have diabetes, hypertension, high cholesterol, PCOS, thyroid disease, "
        "or take a medication such as warfarin, name it for specific interaction advice."
    )
    return "\n".join(lines)


def format_profile_medical_food_guidance(
    conditions: list[str],
    drugs: list[str],
    metrics: dict,
) -> str:
    """Build a fast, non-LLM answer from saved medical and dietary data."""
    condition_pairs = []
    for condition in conditions:
        canonical = _CONDITION_ALIAS.get(condition.lower(), condition.title())
        if canonical not in [name for _, name in condition_pairs]:
            condition_pairs.append((condition, canonical))
    condition_names = [name for _, name in condition_pairs]

    lines = ["Based on your medical and dietary context:"]
    if condition_names:
        lines.append(f"- Conditions: **{', '.join(condition_names)}**")
    if drugs:
        lines.append(f"- Medications: **{', '.join(dict.fromkeys(drugs))}**")

    for condition, canonical in condition_pairs:
        recommended, avoid = retrieve_condition_foods(condition)
        diet_note = _CONDITION_DIET_NOTES.get(canonical, "")
        lines.extend(["", f"**{canonical} — Dietary Guidance**"])
        if avoid:
            lines.append(f"- **Avoid or limit:** {', '.join(avoid[:12])}")
        if recommended:
            lines.append(f"- **Better choices:** {', '.join(recommended[:12])}")
        if diet_note:
            lines.append(f"- **Guidance:** {diet_note}")
        if not (avoid or recommended or diet_note):
            lines.append(
                "- I recognize this condition, but specific food guidance is not yet "
                "available in the knowledge base. Please ask your clinician or dietitian."
            )

    for drug in dict.fromkeys(drugs):
        avoid_foods, drug_notes = retrieve_drug_foods(drug)
        guidance_entry = medication_guidance({"medications": [drug]})[0]
        lines.extend(["", f"**{drug} — Food Interactions**"])
        if guidance_entry["verified"]:
            for guidance_type, message in guidance_entry["guidance"]:
                lines.append(f"- **{guidance_type.title()}:** {message}")
            if guidance_entry["excluded_terms"]:
                lines.append(
                    "- **Automatically excluded from recommendations:** "
                    + ", ".join(guidance_entry["excluded_terms"])
                )
            lines.append(f"- **Rule source:** {guidance_entry['source']}")
        elif avoid_foods or drug_notes:
            lines.append(
                "- **Knowledge-graph reference (not automatically enforced):** "
                + "; ".join((avoid_foods + drug_notes)[:6])
            )
            lines.append(
                "- Confirm this interaction with your pharmacist before changing your diet."
            )
        else:
            lines.append(
                "- No verified automatic food-enforcement rule is available. "
                "Confirm with your doctor or pharmacist before changing your diet."
            )

    allergies = parse_allergy_string(str(metrics.get("allergies") or ""))
    preference = str(metrics.get("dietary_preference") or "").strip().lower()
    profile_limits = []
    allergy_labels = {
        "nut": "Nuts and nut-containing foods",
        "dairy": "Milk and other dairy ingredients",
        "gluten": "Wheat and other gluten-containing foods",
        "seafood": "Fish and shellfish",
        "egg": "Eggs and egg-containing foods",
        "soy": "Soy and soy-containing foods",
    }
    profile_limits.extend(allergy_labels.get(item, item.title()) for item in allergies)
    if "vegan" in preference:
        profile_limits.append("Meat, poultry, seafood, dairy, and eggs")
    elif "veg" in preference:
        profile_limits.append("Meat, poultry, and seafood")
    elif "pescatarian" in preference:
        profile_limits.append("Meat and poultry")

    if profile_limits:
        lines.extend(["", "**Also avoid based on your profile:**"])
        lines.extend(f"- {item}" for item in profile_limits)

    # Include the conditions detected in the current question even if the user
    # has not saved them yet, then run the shared medical food selector.
    recommendation_metrics = dict(metrics)
    active_conditions = parse_medical_conditions(metrics)
    for condition in conditions:
        condition_name = str(condition).strip().lower()
        if condition_name and condition_name not in active_conditions:
            active_conditions.append(condition_name)
    recommendation_metrics["medical_conditions"] = ", ".join(active_conditions)

    active_medications = parse_medications(metrics)
    for drug in drugs:
        drug_name = str(drug).strip()
        if drug_name and drug_name not in active_medications:
            active_medications.append(drug_name)
    recommendation_metrics["medications"] = ", ".join(active_medications)

    meal_context = get_meal_slotted_foods(recommendation_metrics)
    meal_lines = [
        line for line in meal_context.splitlines()
        if line.startswith(("Breakfast", "Lunch", "Dinner", "Snack"))
    ]
    if meal_lines:
        if condition_names and drugs:
            suitable_heading = "**Condition-, medication-, and profile-aware suitable foods:**"
        elif drugs:
            suitable_heading = "**Medication- and profile-aware suitable foods:**"
        else:
            suitable_heading = "**Condition-aware suitable foods:**"
        lines.extend(["", suitable_heading])
        for meal_line in meal_lines:
            slot, _, foods = meal_line.partition(":")
            slot = _re.sub(r"\s*\([^)]*\)\s*$", "", slot).strip()
            lines.append(f"- **{slot}:** {foods.strip()}")

    lines.append(
        "\nThis is general dietary guidance, not a diagnosis or replacement for "
        "advice from your doctor or registered dietitian. Do not change prescribed "
        "medication based on this response."
    )
    return "\n".join(lines)


# ── "Why this food?" / food info bypass ──────────────────────────────────────

_FOOD_INFO_PATTERNS = [
    r"why\s+(?:is\s+)?(?:the\s+)?(.+?)(?:\s+in\s+(?:my|the)\s+(?:plan|meal|option))?[?.]?\s*$",
    r"tell\s+me\s+about\s+(?:the\s+)?(.+?)[?.]?\s*$",
    r"what\s+(?:is|are|'s)\s+(?:the\s+)?(.+?)[?.]?\s*$",
    r"explain\s+(?:the\s+)?(.+?)[?.]?\s*$",
    r"(?:more\s+)?info(?:rmation)?\s+(?:on|about)\s+(?:the\s+)?(.+?)[?.]?\s*$",
    r"describe\s+(?:the\s+)?(.+?)[?.]?\s*$",
    r"benefits?\s+of\s+(?:the\s+)?(.+?)[?.]?\s*$",
    r"is\s+(?:the\s+)?(.+?)\s+(?:healthy|good for me|nutritious|safe)[?.]?\s*$",
]

_FOOD_INFO_INTENT = [
    "why is", "why is the", "tell me about", "what is", "what are",
    "explain", "info on", "info about", "describe", "benefit of",
    "benefits of", "is it healthy", "is it good",
]


def detect_food_info_query(message: str) -> str | None:
    """
    Detect 'why [food]', 'tell me about [food]', 'what is [food]' queries
    and return a database-sourced explanation. Returns None if not applicable.
    """
    import re as _re2
    msg = message.strip().lower()

    if not any(p in msg for p in _FOOD_INFO_INTENT):
        return None

    # Don't intercept GI/protein/general nutrition questions — let FAQ bypass handle those
    general_topics = ("glycemic index", "gi ", "protein ", "calorie", "carb", "fat ",
                      "fibre", "fiber", "vitamin", "mineral", "sugar", "sodium",
                      "bmi", "weight", "maintenance", "tdee")
    if any(t in msg for t in general_topics) and not any(
        p in msg for p in ("tell me about", "what is the", "info on", "info about")
    ):
        return None

    from food_db import _food_df
    from meal_logger import fuzzy_match_food

    candidate = None
    for pat in _FOOD_INFO_PATTERNS:
        m = _re2.search(pat, msg)
        if m:
            candidate = m.group(1).strip().rstrip(".,!?")
            candidate = _re2.sub(r'^(?:the|a|an|my)\s+', '', candidate)
            break

    if not candidate:
        return None

    matched = fuzzy_match_food(candidate)
    if not matched:
        return None

    rows = _food_df[_food_df["food_item"] == matched]
    if rows.empty:
        return None
    row = rows.iloc[0]

    # ── Build response from database fields ──────────────────────────────────
    cal      = int(row["calories"])
    prot     = round(float(row.get("protein_g", 0)), 1)
    carbs    = round(float(row.get("carbs_g", 0)), 1)
    fat      = round(float(row.get("fat_g", 0)), 1)
    fiber    = round(float(row.get("fiber_g", 0)), 1) if row.get("fiber_g") is not None else None
    cat      = str(row.get("category", "") or "")
    gi_cat   = str(row.get("gi_category", "") or "")
    gi_val   = row.get("gi")
    gl_val   = row.get("gl")
    sodium   = row.get("sodium_mg")
    sod_cat  = str(row.get("sodium_category", "") or "")
    tags     = str(row.get("dietary_tags", "") or "")
    notes    = str(row.get("nutrition_notes", "") or "")
    prep     = str(row.get("prep_method", "") or "").replace("_", " ")
    allergens = str(row.get("allergens", "") or "")
    ingr     = str(row.get("main_ingredients", "") or "")
    min_srv  = row.get("min_serving_g")
    max_srv  = row.get("max_serving_g")
    srv      = row.get("serving_size_g")

    lines = [f"🍽️ **{matched}**"]
    if cat and cat != "nan":
        lines.append(f"*{cat}*\n")

    # Macros
    lines.append(f"**Nutrition (per serving):**")
    srv_str = (f"{min_srv}–{max_srv}g" if min_srv and max_srv else f"{srv}g" if srv else "typical serving")
    lines.append(f"• Calories : {cal} kcal ({srv_str})")
    lines.append(f"• Protein  : {prot}g")
    lines.append(f"• Carbs    : {carbs}g")
    lines.append(f"• Fat      : {fat}g")
    if fiber is not None:
        lines.append(f"• Fibre    : {fiber}g")
    if sodium is not None and str(sodium) != "nan":
        sod_note = f" ({sod_cat} sodium)" if sod_cat and sod_cat != "nan" else ""
        lines.append(f"• Sodium   : {int(sodium)}mg{sod_note}")

    # GI / GL
    if gi_cat and gi_cat != "nan":
        gi_note = f" (value: {int(gi_val)})" if gi_val is not None and str(gi_val) != "nan" else ""
        gl_note = f" | GL: {round(float(gl_val), 1)}" if gl_val is not None and str(gl_val) != "nan" else ""
        lines.append(f"\n**Glycemic:** GI {gi_cat}{gi_note}{gl_note}")

    # Ingredients & prep
    if ingr and ingr != "nan":
        lines.append(f"\n**Main ingredients:** {ingr}")
    if prep and prep != "nan":
        lines.append(f"**Preparation:** {prep}")

    # Dietary tags & allergens
    if tags and tags != "nan":
        lines.append(f"\n**Dietary:** {tags}")
    if allergens and allergens != "nan" and allergens.lower() != "none":
        lines.append(f"⚠️ **Allergens:** {allergens}")

    # Nutrition notes (if available)
    if notes and notes != "nan":
        lines.append(f"\n💡 *{notes}*")

    lines.append("\n*Data sourced directly from the Wellora food database.*")
    return "\n".join(lines)


# ── Semantic food query bypass ────────────────────────────────────────────────

def detect_semantic_query(
    message: str,
    metrics: dict,
    exclude_names: set | None = None,
    disliked_foods: set[str] | None = None,
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
    try:
        return handle_semantic_food_query(
            message,
            metrics,
            top_k=5,
            exclude_names=exclude_names,
            disliked_foods=disliked_foods,
        )
    except Exception as exc:
        print(f"[WARN] ChromaDB semantic search unavailable: {exc}")
        return None
