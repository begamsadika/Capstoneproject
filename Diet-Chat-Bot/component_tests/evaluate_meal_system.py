from bypass_handlers import detect_prep_filter, detect_single_meal_slot
from meal_logger import (
    UserDietState, detect_food_preference, detect_log_request,
    detect_log_summary_request, detect_substitution_request,
)
import meal_planner
from component_tests.common import keyword_score, save, show_case, timed

# This suite isolates deterministic meal-planner logic. ChromaDB has its own
# evaluator and must not be loaded as a hidden dependency here.
meal_planner._CHROMA_AVAILABLE = False

METRICS = {
    "weight_kg": 70, "height_cm": 160, "age": 28, "gender": "female",
    "health_goal": "lose_weight", "dietary_preference": "vegetarian",
    "allergies": "", "conditions": [], "target_calories": 1653,
}

cases = []

for question, slot in [
    ("What should I eat for breakfast?", "Breakfast"), ("Suggest lunch", "Lunch"),
    ("Give me dinner options", "Dinner"), ("What snack can I have?", "Snack"),
    ("Plan my morning meal", "Breakfast"), ("I need an evening dinner", "Dinner"),
    ("Show a midday lunch", "Lunch"), ("Recommend a healthy snack", "Snack"),
    ("Breakfast ideas please", "Breakfast"), ("What can I have for lunch?", "Lunch"),
]:
    cases.append(("meal_slot", question, lambda q=question: detect_single_meal_slot(q), [slot]))

for question, expected in [
    ("Give me food with no fried items", ["fried"]), ("Only steamed food please", ["steam"]),
    ("I want boiled meals", ["boil"]), ("No oily food", ["oil"]),
    ("Avoid deep-fried dishes", ["fried"]), ("Steamed and boiled foods only", ["steam", "boil"]),
    ("Prepare a non-fried dinner", ["fried"]), ("Skip oily preparation", ["oil"]),
    ("Can I have grilled food?", ["grill"]), ("Give me baked meals", ["bak"]),
]:
    cases.append(("preparation_filter", question, lambda q=question: detect_prep_filter(q, []), expected))

for target in [1400, 1600, 1800, 2000, 2200]:
    question = f"Build a complete vegetarian meal plan for {target} calories"
    cases.append(("meal_plan", question, lambda t=target: meal_planner.build_meal_plan(t, METRICS, UserDietState(user_id=900000 + t), save_as_current=False), ["breakfast", "lunch", "dinner"]))

for question, expected in [
    ("I ate Kiribath for breakfast", ["kiribath", "breakfast"]), ("Log Pittu for lunch", ["pittu", "lunch"]),
    ("I had option 1 for dinner", ["1", "dinner"]), ("Record Dhal Curry for dinner", ["dhal curry", "dinner"]),
    ("I consumed Hoppers Appa for breakfast", ["hoppers", "breakfast"]), ("I just ate Pol Roti", ["pol roti"]),
    ("Log option 2 as lunch", ["2", "lunch"]), ("I finished eating Fish Curry for dinner", ["fish curry", "dinner"]),
    ("Record my Kola Kanda for breakfast", ["kola kanda", "breakfast"]), ("I had Papadam for snack", ["papadam", "snack"]),
]:
    cases.append(("meal_log_detection", question, lambda q=question: detect_log_request(q), expected))

for question in ["Show my food log", "What did I eat today?", "How many calories did I eat today?", "Show my meal history", "How many calories are left?"]:
    cases.append(("log_summary_detection", question, lambda q=question: detect_log_summary_request(q), ["true"]))

for question, expected in [
    ("I don't like Pittu", ["dislike", "pittu"]), ("I hate Kottu Roti", ["dislike", "kottu"]),
    ("I like Kiribath", ["like", "kiribath"]), ("I love Dhal Curry", ["like", "dhal"]),
    ("Please avoid Pol Roti", ["dislike", "pol roti"]),
]:
    cases.append(("food_preference", question, lambda q=question: detect_food_preference(q), expected))

for question, expected in [
    ("Replace Pittu with something else", ["pittu"]), ("Swap Kiribath please", ["kiribath"]),
    ("Can you replace Kottu Roti?", ["kottu"]), ("Give me something instead of Pol Roti", ["pol roti"]),
    ("Change Dhal Curry to another food", ["dhal"]),
]:
    cases.append(("substitution_detection", question, lambda q=question: detect_substitution_request(q), expected))

results = []
for case_id, (subcomponent, question, call, expected) in enumerate(cases, 1):
    actual, error, elapsed = timed(call)
    score, matched = keyword_score(actual, expected)
    results.append({"id": case_id, "subcomponent": subcomponent, "question": question, "expected_keywords": expected, "matched_keywords": matched, "actual": actual, "score": round(score, 2), "error": error, "elapsed_ms": elapsed, "status": "PASS" if not error and actual is not None and score >= 0.5 else "FAIL"})
    show_case(results[-1], actual, "Meal-system output")

save("meal_planner_logger", results, "meal_system_results.json")
