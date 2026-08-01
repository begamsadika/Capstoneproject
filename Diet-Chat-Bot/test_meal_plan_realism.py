import pandas as pd

import meal_planner
from meal_logger import UserDietState
from meal_realism import (
    WEEKLY_FAMILY_LIMITS,
    classify_food_family,
    classify_food_group,
    round_practical_portion,
)


def test_food_classification_corrects_problematic_legacy_roles():
    chicken = pd.Series(
        {"food_item": "Tandoori Chicken", "category": "Poultry & Meat", "dish_role": "side"}
    )
    pickle = pd.Series(
        {"food_item": "Malay Pickle", "category": "Condiments & Pickles", "dish_role": "side"}
    )
    sweet = pd.Series(
        {"food_item": "Kiri Toffee", "category": "Desserts & Sweets", "dish_role": "standalone"}
    )

    assert classify_food_group(chicken) == "animal_protein"
    assert classify_food_family(chicken) == "chicken"
    assert classify_food_group(pickle) == "condiment"
    assert classify_food_family(pickle) == "pickle"
    assert classify_food_group(sweet) == "sweet"
    assert classify_food_family(sweet) == "sweet"
    assert classify_food_family({"food_item": "Mutton Curry"}) == "red_meat"
    assert classify_food_family({"food_item": "Black Pork Curry"}) == "red_meat"
    assert classify_food_family({"food_item": "Frikkadel"}) == "processed_meat"
    assert classify_food_family({"food_item": "King Coconut (Thambili)"}) != "processed_meat"
    assert classify_food_group({"food_item": "Milk Tea", "category": "Beverages"}) == "beverage"
    assert classify_food_group({"food_item": "Dosa", "category": "Fermented Foods"}) == "starch"
    assert classify_food_group({"food_item": "Ragi Ambula", "category": "Fermented Foods"}) == "starch"


def test_practical_portion_rounding_stays_inside_safe_bounds():
    row = pd.Series(
        {
            "food_item": "Vegetable Curry",
            "category": "Vegetables",
            "dish_role": "side",
            "min_serving_g": 110,
            "max_serving_g": 190,
        }
    )

    assert round_practical_portion(149, row) == 150
    assert round_practical_portion(188, row) == 175


def test_weekly_plan_enforces_realistic_structure(monkeypatch):
    monkeypatch.setattr(meal_planner, "_CHROMA_AVAILABLE", False)
    metrics = {
        "health_goal": "gain",
        "dietary_preference": "eat anything",
        "target_calories": 2385,
        "protein_target_g": 145,
        "carbs_target_g": 300,
        "fat_target_g": 70,
        "medical_conditions": "diabetes",
        "allergies": "tomato, sea food",
    }
    week = meal_planner.build_weekly_meal_plan(
        2385, metrics, UserDietState(user_id=777001)
    )
    audit = week["_realism_audit"]

    assert not audit["frequency_violations"]
    assert not audit["exact_repeat_violations"]
    assert not audit["portion_violations"]
    assert not audit["meal_violations"]
    assert audit["family_counts"].get("chicken", 0) <= WEEKLY_FAMILY_LIMITS["chicken"]
    assert audit["family_counts"].get("sweet", 0) <= WEEKLY_FAMILY_LIMITS["sweet"]
    assert audit["family_counts"].get("sugary_drink", 0) <= WEEKLY_FAMILY_LIMITS["sugary_drink"]
    assert audit["food_group_servings"].get("fruit", 0) >= 7
    assert audit["food_group_servings"].get("plant_protein", 0) >= 7

    selected_names = [
        food["name"].casefold()
        for day_number in range(1, 8)
        for slot in ("Breakfast", "Lunch", "Dinner", "Snack")
        for option in week[f"Day {day_number}"].get(slot, {}).get("options", [])[:1]
        for food in option.get("foods", [])
    ]
    assert not any("pickle" in name for name in selected_names)
    assert "kiriala" not in selected_names

    # If active macro constraints cannot be met by the safe database, the
    # planner must expose that instead of claiming full validation.
    totals = [week[f"Day {day}"]["totals"] for day in range(1, 8)]
    average_protein = sum(day["protein_g"] for day in totals) / 7
    if average_protein < metrics["protein_target_g"] * 0.75:
        assert audit["macro_violations"]
    average_fat = sum(
        week[f"Day {day}"]["totals"]["fat_g"] for day in range(1, 8)
    ) / 7
    if average_fat > metrics["fat_target_g"] * 1.30:
        assert any("average fat" in issue for issue in audit["macro_violations"])
