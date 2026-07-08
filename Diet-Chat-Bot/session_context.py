from __future__ import annotations
"""
session_context.py — Session memory and context-aware conversation.

Extracts structured context from conversation history so the chatbot can:
  - Resolve references ("that dish", "something similar", "show me more")
  - Continue semantic searches with already-shown foods excluded
  - Carry forward slot context ("what about for dinner?" after breakfast)
  - Remember the last selected / discussed option number

Public API
----------
  extract_session_context(history)         → dict
  is_continuation_request(message)         → bool
  resolve_message_with_context(msg, ctx)   → str  # enriched query
  get_context_slot(message, ctx)           → str | None
"""

import re
from typing import Optional


# ── Context extraction ────────────────────────────────────────────────────────

def extract_session_context(history: list) -> dict:
    """
    Walk recent assistant messages and extract:
      last_foods       : list[str]   — food names shown in last semantic search
      last_query       : str         — query that produced the last semantic result
      last_slot        : str         — last meal slot mentioned (Breakfast/Lunch/…)
      last_opt_n       : int | None  — last selected option number
      last_resp_type   : str         — "semantic" | "meal_plan" | "slot" | "other"
      shown_foods_all  : set[str]    — all foods shown across the entire session
    """
    ctx: dict = {
        "last_foods":      [],
        "last_query":      "",
        "last_slot":       "",
        "last_opt_n":      None,
        "last_resp_type":  "other",
        "shown_foods_all": set(),
    }

    slots = ("Breakfast", "Lunch", "Dinner", "Snack")

    for msg in reversed(history):
        if msg.role != "assistant":
            continue
        content = msg.content

        # ── Semantic search result ───────────────────────────────────────────
        if "🔍 **Semantic food search:**" in content and not ctx["last_foods"]:
            ctx["last_resp_type"] = "semantic"

            # Extract original query
            q_m = re.search(r'Semantic food search:\*\s*\*"(.+?)"\*', content)
            if q_m:
                ctx["last_query"] = q_m.group(1)

            # Extract food names from bullet lines: • **FoodName** —
            foods = re.findall(r"• \*\*(.+?)\*\* —", content)
            ctx["last_foods"] = foods
            ctx["shown_foods_all"].update(foods)

        # ── Accumulate all foods ever shown (for exclusion) ──────────────────
        all_foods = re.findall(r"• \*\*(.+?)\*\* —", content)
        ctx["shown_foods_all"].update(all_foods)

        # Also pick up foods from meal-plan option lines: • FoodName (Xg)
        mp_foods = re.findall(r"• (.+?) \(\d+", content)
        ctx["shown_foods_all"].update(f.strip() for f in mp_foods if len(f.strip()) > 2)

        # ── Last meal slot ───────────────────────────────────────────────────
        if not ctx["last_slot"]:
            for slot in slots:
                if slot in content:
                    ctx["last_slot"] = slot
                    if "Option" in content:
                        ctx["last_resp_type"] = "slot"
                    break

        # ── Last selected option ─────────────────────────────────────────────
        if ctx["last_opt_n"] is None:
            opt_m = re.search(r"selected \*\*Option (\d)\*\*", content)
            if opt_m:
                ctx["last_opt_n"] = int(opt_m.group(1))

        # ── Weekly plan ──────────────────────────────────────────────────────
        if "7-Day" in content or "Weekly" in content or "Day 1" in content:
            if ctx["last_resp_type"] == "other":
                ctx["last_resp_type"] = "weekly"

    return ctx


# ── Continuation detection ────────────────────────────────────────────────────

_CONTINUATION_PATTERNS = (
    "show me more", "more options", "more like that", "more like this",
    "similar to that", "similar to those", "something similar",
    "more of that", "other options", "any more", "give me more",
    "different options", "what else", "more choices", "next options",
    "more results", "see more", "show more", "other suggestions",
    "other ideas", "different ideas", "more ideas",
)

def is_continuation_request(message: str) -> bool:
    """Return True if the user is asking for more / similar results."""
    msg = message.strip().lower()
    return any(p in msg for p in _CONTINUATION_PATTERNS)


# ── Reference resolution ──────────────────────────────────────────────────────

_REFERENCE_WORDS = (
    "that dish", "that food", "that option", "that one", "that meal",
    "the first one", "the second one", "the third one",
    "it", "those", "them", "like before",
)

def has_reference(message: str) -> bool:
    """Return True if the message contains an anaphoric reference."""
    msg = message.strip().lower()
    return any(ref in msg for ref in _REFERENCE_WORDS)


def resolve_reference(message: str, ctx: dict) -> str:
    """
    Replace anaphoric references with concrete food/slot names from context.
    e.g. "something similar to that" → "something similar to Lunupola"
    """
    msg = message.strip()
    msg_l = msg.lower()

    # Ordinal reference → first food name
    ordinals = {
        "the first one":  0,
        "the second one": 1,
        "the third one":  2,
    }
    for phrase, idx in ordinals.items():
        if phrase in msg_l and idx < len(ctx["last_foods"]):
            food = ctx["last_foods"][idx]
            msg = re.sub(re.escape(phrase), food, msg, flags=re.IGNORECASE)

    # Generic "that dish / that food / that one" → first food from last result
    if ctx["last_foods"]:
        for ref in ("that dish", "that food", "that one", "that meal"):
            if ref in msg_l:
                food = ctx["last_foods"][0]
                msg = re.sub(re.escape(ref), food, msg, flags=re.IGNORECASE)

    return msg


def resolve_message_with_context(message: str, ctx: dict) -> str:
    """
    Full resolution pipeline:
      1. Resolve anaphoric references
      2. For continuation requests, build an explicit query from last_query/last_foods
    """
    msg = message.strip()

    # Resolve pronouns / ordinals
    if has_reference(msg):
        msg = resolve_reference(msg, ctx)

    # Continuation: enrich with last query if message is vague
    if is_continuation_request(msg) and not ctx["last_query"] and ctx["last_foods"]:
        # Build a query from the last shown foods
        sample = ", ".join(ctx["last_foods"][:2])
        msg = f"something similar to {sample}"

    elif is_continuation_request(msg) and ctx["last_query"]:
        # Re-use the original semantic query exactly
        msg = ctx["last_query"]

    return msg


# ── Slot context helper ───────────────────────────────────────────────────────

_SLOT_TRIGGERS: dict[str, tuple] = {
    "Breakfast": ("breakfast", "morning", "wake up"),
    "Lunch":     ("lunch", "midday", "noon", "afternoon"),
    "Dinner":    ("dinner", "supper", "evening", "night"),
    "Snack":     ("snack", "snacks", "munch", "between meals"),
}

def get_context_slot(message: str, ctx: dict) -> Optional[str]:
    """
    Return the meal slot the user is referring to — either from the message itself
    or (for follow-up questions like 'what about dinner?') from context history.
    """
    msg = message.strip().lower()

    # Explicit mention wins
    for slot, triggers in _SLOT_TRIGGERS.items():
        if any(t in msg for t in triggers):
            return slot

    # Implicit: "what about the other one?" — inherit last discussed slot
    implicit = any(p in msg for p in (
        "what about", "how about", "and for", "instead", "other slot",
    ))
    if implicit and ctx["last_slot"]:
        return ctx["last_slot"]

    return None
