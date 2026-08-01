"""Conservative medication-food rules for meal-plan enforcement.

The knowledge graph remains useful for retrieval and explanations, but free-text
graph edges are not safe to convert directly into food bans. Only rules marked
``hard_avoid_terms`` below remove foods. Other interactions are surfaced as
limit, timing, consistency, or caution guidance.
"""
import re

import pandas as pd


MEDICATION_ALIASES = {
    "atorvastatin": "Atorvastatin",
    "lipitor": "Atorvastatin",
    "atorva": "Atorvastatin",
    "tonact": "Atorvastatin",
    "lipvas": "Atorvastatin",
    "simvastatin": "Simvastatin",
    "zocor": "Simvastatin",
    "simcard": "Simvastatin",
    "zivast": "Simvastatin",
    "warfarin": "Warfarin",
    "coumadin": "Warfarin",
    "warf": "Warfarin",
    "metformin": "Metformin",
    "glucophage": "Metformin",
    "gluconil": "Metformin",
    "metspan": "Metformin",
    "diabex": "Metformin",
    "diaformin": "Metformin",
    "formet": "Metformin",
    "levothyroxine": "Levothyroxine",
    "synthroid": "Levothyroxine",
    "thyroxine": "Levothyroxine",
    "eltroxin": "Levothyroxine",
    "lisinopril": "Lisinopril",
    "prinivil": "Lisinopril",
    "zestril": "Lisinopril",
    "listril": "Lisinopril",
    "digoxin": "Digoxin",
    "ibuprofen": "Ibuprofen",
    "advil": "Ibuprofen",
    "motrin": "Ibuprofen",
    "brufen": "Ibuprofen",
    "aspirin": "Acetylsalicylic acid",
    "cardiprin": "Acetylsalicylic acid",
    "ecosprin": "Acetylsalicylic acid",
    "disprin": "Acetylsalicylic acid",
}


# The source labels refer to official prescribing information on DailyMed.
# They are included for provenance; Wellora does not alter medication dosing.
MEDICATION_FOOD_RULES = {
    "Simvastatin": {
        "hard_avoid_terms": ["grapefruit"],
        "guidance": [
            ("avoid", "Avoid grapefruit and grapefruit juice while taking simvastatin."),
        ],
        "source": "DailyMed simvastatin prescribing information",
    },
    "Atorvastatin": {
        "limit_terms": ["grapefruit"],
        "guidance": [
            ("limit", "Avoid large quantities of grapefruit juice; confirm an appropriate amount with your pharmacist."),
        ],
        "source": "DailyMed atorvastatin prescribing information",
    },
    "Warfarin": {
        "consistency_terms": [
            "spinach", "kale", "broccoli", "collard greens", "leafy greens",
        ],
        "guidance": [
            ("consistency", "Keep vitamin K intake consistent; do not eliminate leafy greens or make sudden large changes without your clinician."),
        ],
        "source": "DailyMed warfarin prescribing information",
    },
    "Levothyroxine": {
        "timing_terms": ["soy", "soya", "coffee", "calcium", "high fiber"],
        "guidance": [
            ("timing", "Take on an empty stomach 30 to 60 minutes before breakfast and follow prescribed separation instructions for interfering products."),
        ],
        "source": "DailyMed levothyroxine prescribing information",
    },
    "Lisinopril": {
        "caution_terms": ["potassium salt substitute", "potassium supplement"],
        "guidance": [
            ("caution", "Do not use potassium supplements or potassium-containing salt substitutes unless your prescriber approves them."),
        ],
        "source": "DailyMed lisinopril prescribing information",
    },
    "Metformin": {
        "caution_terms": ["alcohol"],
        "guidance": [
            ("caution", "Avoid excessive or binge alcohol use and follow the food instructions on your prescription."),
        ],
        "source": "DailyMed metformin prescribing information",
    },
}


def parse_medications(metrics: dict) -> list[str]:
    """Normalize saved generic names, brands, and entries containing a dose."""
    raw = metrics.get("medications") or []
    if isinstance(raw, str):
        items = re.split(r"[,;|\n]+", raw)
    else:
        items = [str(item) for item in raw]

    medications = []
    aliases = sorted(MEDICATION_ALIASES.items(), key=lambda item: len(item[0]), reverse=True)
    for item in items:
        normalized = re.sub(r"[^a-z0-9]+", " ", str(item).lower()).strip()
        if not normalized:
            continue
        canonical = None
        for alias, medication in aliases:
            if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", normalized):
                canonical = medication
                break
        canonical = canonical or str(item).strip()
        if canonical not in medications:
            medications.append(canonical)
    return medications


def _known_medications_in_text(text: str) -> list[str]:
    """Return only recognized medication names mentioned in free text."""
    normalized = re.sub(r"[^a-z0-9]+", " ", str(text).lower()).strip()
    medications = []
    aliases = sorted(MEDICATION_ALIASES.items(), key=lambda item: len(item[0]), reverse=True)
    for alias, medication in aliases:
        if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", normalized):
            if medication not in medications:
                medications.append(medication)
    return medications


_PERSONAL_MEDICATION_PATTERN = re.compile(
    r"\b(?:"
    r"while\s+(?:i\s*(?:am|'m)\s+)?taking|"
    r"i\s*(?:am|'m)\s+(?:taking|using|on)|"
    r"i\s+(?:take|use)|"
    r"my\s+(?:current\s+)?medications?\s*(?:is|are|:|-)|"
    r"prescribed\s+(?:me\s+)?"
    r")(?![a-z])",
    re.IGNORECASE,
)


def resolve_active_medications(
    metrics: dict,
    message: str = "",
    history: list | None = None,
    conversation_summary: str | None = None,
) -> list[str]:
    """Resolve request-scoped medications without inventing profile facts.

    Saved profile medications are always retained. Free-text medication names
    are carried into plan/filter bypasses only when the user describes them as
    personal (for example, ``while taking levothyroxine``). Assistant messages
    are deliberately ignored so a previous suggestion cannot become a fact.
    """
    medications = parse_medications(metrics or {})

    # A current personal statement is the strongest conversational evidence.
    # Do not merge older chat medications into it: users often ask test or
    # educational questions about several medicines in one conversation.
    if message and _PERSONAL_MEDICATION_PATTERN.search(message):
        current_medications = _known_medications_in_text(message)
        if current_medications:
            for medication in current_medications:
                if medication not in medications:
                    medications.append(medication)
            return medications

    # For a follow-up such as "foods suitable for my medications", carry only
    # the most recent personal medication statement, not every medication ever
    # mentioned in the recent chat.
    for item in reversed((history or [])[-8:]):
        role = getattr(item, "role", None)
        content = getattr(item, "content", None)
        if isinstance(item, dict):
            role = item.get("role")
            content = item.get("content")
        if str(role).lower() != "user" or not content:
            continue
        if _PERSONAL_MEDICATION_PATTERN.search(str(content)):
            recent_medications = _known_medications_in_text(str(content))
            if recent_medications:
                for medication in recent_medications:
                    if medication not in medications:
                        medications.append(medication)
                return medications

    # The compressed summary is older context and is therefore only a fallback
    # when neither the current message nor recent user turns identify a medicine.
    if conversation_summary:
        for line in str(conversation_summary).splitlines():
            if re.search(r"\bmedications?\s*[:=-]", line, re.IGNORECASE):
                for medication in _known_medications_in_text(line):
                    if medication not in medications:
                        medications.append(medication)
    return medications


def get_medication_rule(medication: str) -> dict | None:
    """Return a verified rule for a canonical or brand medication name."""
    canonical = MEDICATION_ALIASES.get(str(medication).strip().lower(), medication)
    return MEDICATION_FOOD_RULES.get(canonical)


def _term_pattern(term: str) -> str:
    words = re.sub(r"[^a-z0-9]+", " ", str(term).lower()).strip().split()
    phrase = r"[\s_-]+".join(re.escape(word) for word in words)
    return rf"(?<![a-z0-9]){phrase}(?![a-z0-9])" if phrase else ""


def _food_term_mask(df: pd.DataFrame, terms: list[str]) -> pd.Series:
    mask = pd.Series(False, index=df.index)
    searchable = (
        "food_item", "main_ingredients", "category", "allergens", "nutrition_notes",
    )
    for term in terms:
        pattern = _term_pattern(term)
        if not pattern:
            continue
        for column in searchable:
            if column in df.columns:
                mask |= df[column].astype(str).str.contains(
                    pattern, case=False, regex=True, na=False
                )
    return mask


def apply_medication_food_filter(df: pd.DataFrame, metrics: dict) -> pd.DataFrame:
    """Remove only foods covered by verified hard-avoid medication rules."""
    filtered = df
    for medication in parse_medications(metrics):
        rule = get_medication_rule(medication)
        hard_terms = list((rule or {}).get("hard_avoid_terms", []))
        if hard_terms:
            filtered = filtered[~_food_term_mask(filtered, hard_terms)]
    return filtered


def medication_food_notes(row, metrics: dict) -> list[str]:
    """Return non-exclusion interaction notes relevant to one food row."""
    one_row = pd.DataFrame([dict(row)])
    notes = []
    for medication in parse_medications(metrics):
        rule = get_medication_rule(medication)
        if not rule:
            continue
        for rule_type, field, label in (
            ("limit", "limit_terms", "limit/caution"),
            ("consistency", "consistency_terms", "keep intake consistent"),
            ("timing", "timing_terms", "separate from dose as prescribed"),
            ("caution", "caution_terms", "check with pharmacist"),
        ):
            terms = list(rule.get(field, []))
            if terms and bool(_food_term_mask(one_row, terms).iloc[0]):
                notes.append(f"{medication}: {label}")
    return list(dict.fromkeys(notes))


def medication_guidance(metrics: dict) -> list[dict]:
    """Return typed guidance and an explicit status for unknown medications."""
    guidance = []
    for medication in parse_medications(metrics):
        rule = get_medication_rule(medication)
        if rule:
            guidance.append({
                "medication": medication,
                "verified": True,
                "guidance": list(rule.get("guidance", [])),
                "excluded_terms": list(rule.get("hard_avoid_terms", [])),
                "source": rule.get("source", ""),
            })
        else:
            guidance.append({
                "medication": medication,
                "verified": False,
                "guidance": [
                    ("unverified", "No verified automatic food-enforcement rule is available; confirm interactions with a pharmacist."),
                ],
                "excluded_terms": [],
                "source": "",
            })
    return guidance
