"""
test_chat.py — Terminal-based feature tester for Diet AI Chat
Usage: python test_chat.py
       python test_chat.py --group meal      (run only one group)
       python test_chat.py --q 8 9 10        (run specific question numbers)
"""

import sys
import json
import time
import argparse
import requests

API_URL = "http://localhost:8001/chat/stream"

# ── Sample user profile (matches a typical frontend user) ──────────────────
USER_METRICS = {
    "weight_kg": 70,
    "height_cm": 160,
    "age": 28,
    "gender": "female",
    "bmi": 27.3,
    "bmi_category": "Overweight",
    "health_goal": "lose_weight",
    "dietary_preference": "vegetarian",
    "allergies": "",
    "target_calories": 1653,
    "maintenance_calories": 2153,
    "protein_target_g": 165,
    "carbs_target_g": 124,
    "fat_target_g": 55,
    "ideal_weight_kg": 55.9,
    "weight_to_goal_kg": -14.1,
    "estimated_weeks_to_goal": 28,
    "conditions": [],
}

# ── Test questions grouped by feature ──────────────────────────────────────
QUESTIONS = [
    # (number, group, question, expected_keywords)
    # Greeting — response says "Hi, I'm your Diet AI" + goal phrase
    (1,  "greeting",    "Hello",                                    ["hi", "diet", "lose weight"]),
    (2,  "greeting",    "Good morning",                             ["hi", "diet"]),

    (3,  "weight",      "I want to lose 5kg, how long will it take?", ["weeks", "kg"]),
    (4,  "weight",      "How many calories should I eat to lose weight?", ["calorie", "target", "deficit"]),
    (5,  "weight",      "What's my ideal weight?",                  ["ideal", "55.9", "kg"]),
    (6,  "weight",      "Is it safe to gain 10kg in 2 months?",     ["not", "safe", "realistic", "154"]),
    (7,  "weight",      "How long to safely gain 3kg?",             ["3.0", "days", "weeks", "surplus"]),

    (8,  "meal",        "Give me a meal plan for today",            ["Breakfast", "Lunch", "Dinner", "kcal"]),
    (9,  "slot",        "What should I eat for breakfast?",         ["Breakfast", "Option", "kcal"]),
    (10, "slot",        "Suggest something for dinner",             ["Dinner", "Option", "kcal"]),
    (11, "slot",        "Give me lunch options",                    ["Lunch", "Option", "kcal"]),
    (12, "slot",        "What can I have as a snack?",              ["Snack", "Option", "kcal"]),

    (13, "option",      "Option 1",                                 ["selected", "Option 1", "Enjoy"]),
    (14, "option",      "Option 2",                                 ["selected", "Option 2"]),
    (15, "detail",      "Explain option 1",                        ["Calories", "Protein", "GI"]),
    (16, "detail",      "Tell me more about option 2",             ["Calories", "Protein"]),
    # Q17: ask option 1 (option 3 doesn't exist in snack — only 1 option shown)
    (17, "detail",      "Give me details about option 1 please",   ["Calories", "Protein"]),

    (18, "prep",        "Give me a meal plan with no fried food",   ["Breakfast", "Filtering", "deep-fried"]),
    # Q19: no explicit slot/plan → auto-generates full day plan with filter
    (19, "prep",        "I want only steamed and boiled food",      ["Breakfast", "Filtering"]),
    (20, "prep",        "No oily food please give me a dinner plan",["Dinner", "Filtering"]),

    (21, "allergy",     "I'm allergic to nuts give me a meal plan", ["Breakfast", "Lunch", "Dinner"]),
    (22, "allergy",     "Give me a gluten-free meal plan",          ["Breakfast", "Lunch", "Dinner"]),

    # Q23/Q25: answered directly from knowledge graph (no LLM)
    (23, "condition",   "What foods should I eat for PCOS?",        ["PCOS", "oats", "brown rice", "lentil"]),
    (24, "condition",   "I have PCOS give me a meal plan",          ["Breakfast", "Lunch", "Dinner"]),
    (25, "condition",   "What should I avoid with hypothyroidism?", ["thyroid", "iodine", "broccoli", "spinach"]),
    (26, "condition",   "I have hyperthyroidism suggest lunch",     ["Lunch", "Option"]),

    (27, "dislike",     "I don't like Pittu",                       ["avoid", "Pittu"]),
    (28, "dislike",     "I hate Kottu Roti",                        ["avoid", "Kottu"]),
    (29, "dislike",     "Give me a breakfast plan",                  ["Breakfast", "Option"]),
    (30, "dislike",     "I like Pittu",                             ["added", "Pittu"]),

    # Q31/Q32: Pittu/Kiribath not in current plan → "Couldn't find" message
    (31, "substitute",  "Replace Pittu with something else",        ["find", "Pittu", "plan"]),
    (32, "substitute",  "Swap Kiribath please",                     ["find", "Kiribath", "plan"]),
    (33, "substitute",  "Can I have something instead of Pol Roti", ["Swapped", "Pol Roti"]),

    (34, "log",         "I ate Kiribath for breakfast",             ["Logged", "Kiribath"]),
    (35, "log",         "Log Pittu for lunch",                      ["Logged", "Pittu"]),
    (36, "log",         "I had option 1 for dinner",                ["Logged", "Option"]),
    (37, "log",         "Show my food log",                         ["Today", "Total", "kcal"]),
    (38, "log",         "What did I eat today?",                    ["Today", "Total"]),

    # Q39/Q40: answered from drug knowledge graph (no LLM)
    (39, "drug",        "I take Warfarin what should I avoid?",     ["warfarin", "vitamin k", "grapefruit"]),
    (40, "drug",        "I'm on Metformin any food restrictions?",  ["metformin", "alcohol", "b12"]),

    # Q41-Q43: answered from nutrition FAQ bypass (no LLM)
    (41, "faq",         "What is glycemic index?",                  ["glycemic", "blood sugar", "GI"]),
    (42, "faq",         "How much protein do I need per day?",      ["protein", "weight", "165"]),
    (43, "faq",         "Is coconut oil healthy?",                  ["coconut", "fat", "oil"]),

    # Q44-Q47: 7-day weekly plan (answered from bypass W1/W2, no LLM)
    (44, "weekly",      "Give me a 7 day meal plan",                ["Day 1", "Day 7", "Monday", "Sunday"]),
    (45, "weekly",      "Show me day 3 details",                    ["Day 3", "Breakfast", "Option 1"]),
    (46, "weekly",      "What is the Wednesday plan?",              ["Day 4", "Wednesday", "Breakfast"]),
    (47, "weekly",      "Give me a new weekly plan",                ["Day 1", "Day 7", "Monday"]),

    # Q48: answered immediately from the saved profile (no LLM)
    (48, "calorie",     "What is my maintenance calorie?",          ["maintenance", "kcal/day", "target"]),

    # Q49: resolves wording from the ideal-weight response (no LLM)
    (49, "weight",      "What does 'at a safe pace' mean?",         ["0.5 kg per week", "weeks", "calorie"]),
]

# ── SSE streaming helper ────────────────────────────────────────────────────
def stream_response(message: str, history: list, metrics: dict) -> str:
    payload = {
        "user_id": 1,
        "message": message,
        "history": history,
        "user_metrics": metrics,
        "user_name": "Test User",
    }
    try:
        resp = requests.post(API_URL, json=payload, stream=True, timeout=60)
        if resp.status_code != 200:
            return f"[HTTP {resp.status_code}] {resp.text[:200]}"
        tokens = []
        for line in resp.iter_lines():
            if not line:
                continue
            line = line.decode("utf-8") if isinstance(line, bytes) else line
            if line.startswith("data: "):
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    tokens.append(json.loads(data).get("token", ""))
                except Exception:
                    pass
        return "".join(tokens)
    except requests.exceptions.ConnectionError:
        return "[ERROR] Cannot connect — is the server running on port 8001?"
    except Exception as e:
        return f"[ERROR] {e}"

# ── Check response against expected keywords ───────────────────────────────
def check(response: str, keywords: list) -> tuple[bool, list]:
    lower = response.lower()
    missing = [k for k in keywords if k.lower() not in lower]
    return len(missing) == 0, missing

# ── Colours ────────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

# ── Main runner ────────────────────────────────────────────────────────────
def run(questions, verbose=True):
    history = []
    passed = failed = 0

    for (num, group, question, keywords) in questions:
        print(f"\n{BOLD}{CYAN}[Q{num:02d}] [{group.upper()}]{RESET} {question}")
        print(f"{'─'*70}")

        start = time.time()
        response = stream_response(question, history, USER_METRICS)
        elapsed = round(time.time() - start, 1)

        # Print response (truncate long ones)
        display = response[:600] + ("…" if len(response) > 600 else "")
        print(display)

        # Check keywords
        ok, missing = check(response, keywords)
        if ok:
            print(f"\n{GREEN}✅ PASS{RESET}  ({elapsed}s)")
            passed += 1
        else:
            print(f"\n{RED}❌ FAIL{RESET}  ({elapsed}s) — missing: {missing}")
            failed += 1

        # Add to history so subsequent questions have context
        history.append({"role": "user",      "content": question})
        history.append({"role": "assistant", "content": response})
        # Keep last 10 turns
        if len(history) > 20:
            history = history[-20:]

        time.sleep(0.3)   # small delay between requests

    print(f"\n{'='*70}")
    print(f"{BOLD}Results: {GREEN}{passed} passed{RESET}, {RED}{failed} failed{RESET} / {passed+failed} total")
    print(f"{'='*70}\n")

# ── CLI entry point ────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Diet AI Chat tester")
    parser.add_argument("--group", help="Run only this group (e.g. meal, slot, option, prep, dislike, log, drug, llm)")
    parser.add_argument("--q", nargs="+", type=int, help="Run specific question numbers (e.g. --q 8 9 10)")
    parser.add_argument("--list", action="store_true", help="List all questions and exit")
    args = parser.parse_args()

    if args.list:
        for num, group, q, _ in QUESTIONS:
            print(f"  [{num:02d}] [{group}] {q}")
        sys.exit(0)
