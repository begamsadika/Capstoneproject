"""Practical meal-planning classifications, limits, and validation helpers."""

from __future__ import annotations

from collections import Counter
import math
import re

import pandas as pd


WEEKLY_FAMILY_LIMITS = {
    "chicken": 4,
    "seafood": 4,
    "red_meat": 2,
    "processed_meat": 1,
    "egg": 4,
    "pickle": 2,
    "sweet": 2,
    "sugary_drink": 1,
    # The current safe database has very few lunch/dinner pulse dishes after
    # allergy and condition filtering, so dhal may serve as the daily pulse.
    "dhal curry": 14,
}
DEFAULT_EXACT_FOOD_LIMIT = 2


def _text(value) -> str:
    return str(value or "").strip().casefold()


def canonical_name(value) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", _text(value)))


def classify_food_group(row) -> str:
    name = _text(row.get("food_item", row.get("name", "")))
    category = _text(row.get("category", ""))
    role = _text(row.get("dish_role", ""))

    if "juice" in name or "faluda" in name:
        return "sugary_drink"
    if role == "condiment" or "condiment" in category or "pickle" in name:
        return "condiment"
    if "dessert" in category or "sweetener" in category:
        return "sweet"
    if "fruit" in category:
        return "fruit"
    if "leafy" in category:
        return "leafy_vegetable"
    if "vegetable" in category:
        return "vegetable"
    if "pulse" in category or "legume" in category:
        return "plant_protein"
    if "poultry" in category or "meat" in category or "seafood" in category:
        return "animal_protein"
    if "egg" in name:
        return "animal_protein"
    # Category is more reliable than words such as "milk" in a beverage name.
    # Milk tea is still a drink for meal-composition purposes, not a separate
    # dairy course that may be paired with another cup of tea.
    if "beverage" in category:
        return "beverage"
    if "dairy" in category or any(word in name for word in ("milk", "yogurt", "curd")):
        return "dairy"
    if "nut" in category or "seed" in category:
        return "nuts_or_seeds"
    if any(word in category for word in ("grain", "rice", "roti", "millet")):
        return "starch"
    # Several legacy fermented-food records are cereal-based breakfast
    # staples even though their category does not say grain or starch.
    if any(
        phrase in name
        for phrase in ("idli", "dosa", "ambula", "hopper", "idiyappam", "pittu", "pongal", "porridge")
    ):
        return "starch"
    return "other"


def classify_food_family(row) -> str:
    name = _text(row.get("food_item", row.get("name", "")))
    name_tokens = set(re.findall(r"[a-z0-9]+", name))
    category = _text(row.get("category", ""))
    group = str(row.get("food_group") or classify_food_group(row))

    if name_tokens.intersection({"sausage", "bacon", "ham", "salami", "frikkadel"}):
        return "processed_meat"
    if "chicken" in name:
        return "chicken"
    if "egg" in name:
        return "egg"
    if "pickle" in name:
        return "pickle"
    if group == "sugary_drink":
        return "sugary_drink"
    if group == "sweet":
        return "sweet"
    if "seafood" in category or any(
        word in name for word in ("fish", "tuna", "salmon", "prawn", "shrimp", "sprat")
    ):
        return "seafood"
    if any(word in name for word in ("beef", "mutton", "pork", "lamb", "goat")):
        return "red_meat"
    return canonical_name(name)


def practical_step_g(row) -> int:
    group = str(row.get("food_group") or classify_food_group(row))
    role = _text(row.get("dish_role", ""))
    try:
        maximum = float(row.get("max_serving_g") or 0)
    except (TypeError, ValueError):
        maximum = 0
    if maximum and maximum <= 20:
        return 5
    if group in {"condiment", "sweet"}:
        return 5
    if group in {"animal_protein", "plant_protein", "dairy", "nuts_or_seeds"}:
        return 10
    if group in {"fruit", "sugary_drink", "beverage"}:
        return 10
    if role in {"main", "standalone", "side"}:
        return 25
    return 10


def round_practical_portion(amount: float, row) -> int:
    step = practical_step_g(row)
    group = str(row.get("_food_group") or row.get("food_group") or classify_food_group(row))
    minimum = float(row.get("min_serving_g") or amount)
    maximum = float(row.get("max_serving_g") or amount)
    lower = math.ceil(minimum / step) * step
    upper = math.floor(maximum / step) * step
    if lower > upper:
        return round(max(minimum, min(maximum, amount)))
    rounded = (
        math.ceil(amount / step) * step
        if group in {"animal_protein", "plant_protein"}
        else round(amount / step) * step
    )
    return int(max(lower, min(upper, rounded)))


def enrich_food_frame(df: pd.DataFrame) -> pd.DataFrame:
    enriched = df.copy()
    enriched["_food_group"] = enriched.apply(classify_food_group, axis=1)
    enriched["_food_family"] = enriched.apply(classify_food_family, axis=1)
    enriched["_practical_step_g"] = enriched.apply(practical_step_g, axis=1)
    return enriched


def family_limit(family: str) -> int:
    return WEEKLY_FAMILY_LIMITS.get(family, 7)


def exact_food_limit(row) -> int:
    group = str(row.get("_food_group") or row.get("food_group") or classify_food_group(row))
    if group == "plant_protein":
        return 14
    if group in {"dairy", "nuts_or_seeds", "leafy_vegetable", "beverage"}:
        return 3
    return DEFAULT_EXACT_FOOD_LIMIT


def audit_weekly_plan(week: dict) -> dict:
    family_counts: Counter[str] = Counter()
    food_counts: Counter[str] = Counter()
    group_counts: Counter[str] = Counter()
    food_limits: dict[str, int] = {}
    portion_violations = []
    meal_violations = []
    daily_violations = []
    total_protein = 0.0
    total_protein_target = 0.0
    total_carbs = 0.0
    total_carbs_target = 0.0
    total_fat = 0.0
    total_fat_target = 0.0
    target_days = 0

    for day_number in range(1, 8):
        day = week.get(f"Day {day_number}", {})
        day_groups: Counter[str] = Counter()
        selected_slot_foods: dict[str, set[str]] = {}
        for slot in ("Breakfast", "Lunch", "Dinner", "Snack"):
            options = day.get(slot, {}).get("options", [])
            if not options:
                continue
            foods = options[0].get("foods", [])
            selected_slot_foods[slot] = {
                canonical_name(food.get("name", "")) for food in foods
            }
            meal_groups = Counter(food.get("food_group", "other") for food in foods)
            if meal_groups["animal_protein"] > 1:
                meal_violations.append(f"Day {day_number} {slot}: multiple animal proteins")
            if meal_groups["condiment"] > 1:
                meal_violations.append(f"Day {day_number} {slot}: multiple condiments")
            if meal_groups["starch"] > 1:
                meal_violations.append(f"Day {day_number} {slot}: multiple starches")
            if meal_groups["beverage"] + meal_groups["sugary_drink"] > 1:
                meal_violations.append(f"Day {day_number} {slot}: multiple beverages")
            for food in foods:
                name = canonical_name(food.get("name", ""))
                family = food.get("food_family") or name
                group = food.get("food_group") or "other"
                food_counts[name] += 1
                food_limits[name] = int(
                    food.get("exact_weekly_limit") or DEFAULT_EXACT_FOOD_LIMIT
                )
                family_counts[family] += 1
                group_counts[group] += 1
                day_groups[group] += 1
                amount = food.get("selected_serving_g")
                step = int(food.get("practical_step_g") or 1)
                if amount and step > 1 and amount % step:
                    portion_violations.append(
                        f"Day {day_number} {slot}: {food.get('name')} {amount}g"
                    )

        lunch_dinner_overlap = len(
            selected_slot_foods.get("Lunch", set())
            & selected_slot_foods.get("Dinner", set())
        )
        if lunch_dinner_overlap > 2:
            meal_violations.append(
                f"Day {day_number}: lunch and dinner repeat {lunch_dinner_overlap} dishes"
            )

        totals = day.get("totals") or {}
        active_targets = day.get("active_targets") or {}
        total_protein += float(totals.get("protein_g") or 0)
        total_protein_target += float(active_targets.get("protein_g") or 0)
        total_carbs += float(totals.get("carbs_g") or 0)
        total_carbs_target += float(active_targets.get("carbs_g") or 0)
        total_fat += float(totals.get("fat_g") or 0)
        total_fat_target += float(active_targets.get("fat_g") or 0)
        target_days += 1
        target = float(totals.get("target_kcal") or 0)
        actual = float(totals.get("actual_kcal") or 0)
        if target and abs(actual - target) > target * 0.08:
            daily_violations.append(
                f"Day {day_number}: calories {round(actual)} vs target {round(target)}"
            )
        if day_groups["fruit"] < 1:
            daily_violations.append(f"Day {day_number}: no fruit")
        if day_groups["vegetable"] + day_groups["leafy_vegetable"] < 2:
            daily_violations.append(f"Day {day_number}: fewer than two vegetables")
        if day_groups["plant_protein"] < 1:
            daily_violations.append(f"Day {day_number}: no pulse/plant protein")

    frequency_violations = {
        family: count
        for family, count in family_counts.items()
        if count > family_limit(family)
    }
    exact_repeat_violations = {
        food: count
        for food, count in food_counts.items()
        if count > food_limits.get(food, DEFAULT_EXACT_FOOD_LIMIT)
    }
    weekly_group_violations = []
    if group_counts["fruit"] < 7:
        weekly_group_violations.append("fewer than seven fruit servings")
    if group_counts["leafy_vegetable"] < 5:
        weekly_group_violations.append("fewer than five leafy-vegetable servings")
    if group_counts["plant_protein"] < 7:
        weekly_group_violations.append("fewer than seven pulse/plant-protein servings")
    if group_counts["dairy"] + group_counts["nuts_or_seeds"] < 4:
        weekly_group_violations.append("too few dairy or nuts/seeds servings")
    macro_violations = []
    if target_days and total_protein_target > 0:
        average_protein = total_protein / target_days
        average_target = total_protein_target / target_days
        if average_protein < average_target * 0.75:
            macro_violations.append(
                f"average protein {average_protein:.1f}g below 75% of "
                f"the {average_target:.1f}g target"
            )
    if target_days and total_carbs_target > 0:
        average_carbs = total_carbs / target_days
        average_carbs_target = total_carbs_target / target_days
        coverage = average_carbs / average_carbs_target
        if coverage < 0.75 or coverage > 1.25:
            macro_violations.append(
                f"average carbohydrates {average_carbs:.1f}g outside 75–125% of "
                f"the {average_carbs_target:.1f}g target"
            )
    if target_days and total_fat_target > 0:
        average_fat = total_fat / target_days
        average_fat_target = total_fat_target / target_days
        if average_fat > average_fat_target * 1.30:
            macro_violations.append(
                f"average fat {average_fat:.1f}g above 130% of "
                f"the {average_fat_target:.1f}g target"
            )
    return {
        "passed": not (
            frequency_violations
            or exact_repeat_violations
            or portion_violations
            or meal_violations
            or daily_violations
            or weekly_group_violations
            or macro_violations
        ),
        "family_counts": dict(family_counts),
        "food_group_servings": dict(group_counts),
        "frequency_violations": frequency_violations,
        "exact_repeat_violations": exact_repeat_violations,
        "portion_violations": portion_violations,
        "meal_violations": meal_violations,
        "daily_violations": daily_violations,
        "weekly_group_violations": weekly_group_violations,
        "macro_violations": macro_violations,
    }
