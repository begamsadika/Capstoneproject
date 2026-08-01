"""
meal_planner.py — Meal plan builder (single-day + weekly), formatters,
                  week-day query detection, and weight-change goal calculator.

ChromaDB hybrid integration
---------------------------
After pandas hard-filters the slot pool (diet type, allergies, GI, sodium),
ChromaDB semantically re-ranks candidates so that each of the 3 options is
biased toward a different flavour query (traditional / light / high-protein).
This replaces repeated random seeds as the variety mechanism.

Falls back silently to pure-pandas if ChromaDB is unavailable.
"""
import re as _re
import random
import itertools
import pandas as pd

from food_db import (
    _food_df,
    apply_allergy_filter,
    apply_medical_condition_filter,
    canonical_food_key,
    medical_food_reasons,
    parse_allergy_string,
    rank_foods_for_medical_profile,
)
from meal_logger import (
    UserDietState, get_daily_progress, persist_user_state, _DAYS_OF_WEEK,
)
from medication_rules import (
    apply_medication_food_filter,
    medication_food_notes,
    medication_guidance,
)
from meal_realism import (
    DEFAULT_EXACT_FOOD_LIMIT,
    WEEKLY_FAMILY_LIMITS,
    audit_weekly_plan,
    canonical_name as realism_canonical_name,
    enrich_food_frame,
    exact_food_limit,
    family_limit,
    round_practical_portion,
)

# Lazy import — don't fail startup if chroma is somehow missing
_CHROMA_AVAILABLE = True


def diverse_foods_from_pool(*args, **kwargs):
    """Load the optional semantic-search stack only when it is needed."""
    from chroma_food_db import diverse_foods_from_pool as _implementation
    return _implementation(*args, **kwargs)


def build_option_queries(*args, **kwargs):
    """Load the optional semantic-search stack only when it is needed."""
    from chroma_food_db import build_option_queries as _implementation
    return _implementation(*args, **kwargs)


def _numeric(row, field: str, default: float = 0.0) -> float:
    """Read a finite numeric food field without leaking NaN into plan totals."""
    try:
        value = float(row.get(field, default))
        return value if pd.notna(value) else default
    except (TypeError, ValueError):
        return default


def _portion_bounds(row) -> tuple[float, float, float]:
    """Return the nutrition-basis, minimum, and maximum serving in grams."""
    basis = max(1.0, _numeric(row, "serving_size_g", 100.0))
    minimum = max(1.0, _numeric(row, "min_serving_g", basis * 0.75))
    maximum = max(minimum, _numeric(row, "max_serving_g", basis * 1.5))
    return basis, minimum, maximum


def _scaled_value(row, field: str, grams: float) -> float:
    basis, _, _ = _portion_bounds(row)
    return _numeric(row, field) * grams / basis


def _targeted_option(
    selected_rows: list,
    slot_df: pd.DataFrame,
    slot: str,
    budget: int,
    protein_budget: float,
    carbs_budget: float,
    fat_budget: float,
    seed: int,
    metrics: dict,
    usage_counts: dict[str, int] | None = None,
    max_foods: int = 5,
) -> dict:
    """Scale safe foods and add safe boosters to approach one slot's targets.

    ``slot_df`` has already passed dietary, allergy, medication, preparation,
    dislike, and medical-condition filters. Candidate additions must come from
    that same frame, preserving those hard constraints.
    """
    usage_counts = usage_counts or {}
    rows = []
    selected_keys = set()
    optimized_rows = selected_rows
    if protein_budget > 0 or carbs_budget > 0 or fat_budget > 0:
        roles = slot_df.get("dish_role", pd.Series("", index=slot_df.index)).astype(str)
        if slot == "Snack":
            primary_pool = slot_df[roles == "standalone"]
        else:
            primary_pool = slot_df[roles == "main"]
        if primary_pool.empty:
            primary_pool = slot_df[roles == "standalone"]
        if not primary_pool.empty:
            target_protein_density = protein_budget / max(budget, 1) * 100.0
            target_carbs_density = carbs_budget / max(budget, 1) * 100.0
            target_fat_density = fat_budget / max(budget, 1) * 100.0
            ranked_primaries = []
            for index, candidate in primary_pool.iterrows():
                calories = max(_numeric(candidate, "calories"), 1.0)
                protein_density = _numeric(candidate, "protein_g") / calories * 100.0
                carbs_density = _numeric(candidate, "carbs_g") / calories * 100.0
                fat_density = _numeric(candidate, "fat_g") / calories * 100.0
                role = str(candidate.get("dish_role", ""))
                if role == "main":
                    fit = (
                        protein_density * 1.5
                        + carbs_density * 0.25
                        - abs(carbs_density - target_carbs_density) * 0.20
                        - max(0.0, fat_density - target_fat_density) * 6.0
                    )
                else:
                    fit = -(
                        abs(protein_density - target_protein_density) * 2.0
                        + abs(carbs_density - target_carbs_density) * 0.25
                        + abs(fat_density - target_fat_density) * 5.0
                    )
                fit += max(0.0, _numeric(candidate, "_medical_score")) * 0.05
                fit -= usage_counts.get(
                    canonical_food_key(candidate.get("food_item", "")), 0
                ) * 5.0
                ranked_primaries.append((fit, index, candidate))
            ranked_primaries.sort(
                key=lambda item: (-item[0], str(item[2].get("food_item", "")))
            )
            top_primaries = ranked_primaries[: min(3, len(ranked_primaries))]
            optimized_rows = [top_primaries[seed % len(top_primaries)][2]]

    # A realistic weekly snack starts with fruit rather than allowing sweets
    # or calorie-dense standalone foods to win solely on macro fit.
    if slot == "Snack" and metrics.get("_weekly_mode"):
        fruit_pool = slot_df[slot_df["_food_group"] == "fruit"]
        if not fruit_pool.empty:
            fruit_pool = fruit_pool.sort_values("food_item")
            optimized_rows = [fruit_pool.iloc[seed % len(fruit_pool)]]

    for row in optimized_rows:
        key = canonical_food_key(row.get("food_item", ""))
        if key and key not in selected_keys:
            rows.append(row)
            selected_keys.add(key)

    if not rows:
        return {
            "actual_kcal": 0,
            "protein_g": 0.0,
            "carbs_g": 0.0,
            "fat_g": 0.0,
            "foods": [],
        }

    def _capacity(field: str, use_maximum: bool) -> float:
        total = 0.0
        for item in rows:
            _, minimum, maximum = _portion_bounds(item)
            total += _scaled_value(item, field, maximum if use_maximum else minimum)
        return total

    upper_budget = budget * 1.05

    def _add_required_group(group: str) -> None:
        if len(rows) >= max_foods or any(
            str(item.get("_food_group") or "other") == group for item in rows
        ):
            return
        pool = slot_df[slot_df["_food_group"] == group]
        candidates = []
        current_minimum = _capacity("calories", False)
        for _, candidate in pool.iterrows():
            key = canonical_food_key(candidate.get("food_item", ""))
            if not key or key in selected_keys:
                continue
            _, minimum, _ = _portion_bounds(candidate)
            min_calories = _scaled_value(candidate, "calories", minimum)
            if current_minimum + min_calories > upper_budget:
                continue
            calories = max(_numeric(candidate, "calories"), 1.0)
            protein_density = _numeric(candidate, "protein_g") / calories * 100.0
            score = (
                protein_density * 8.0
                + _numeric(candidate, "_medical_score")
                - usage_counts.get(key, 0) * 15.0
            )
            candidates.append((score, str(candidate.get("food_item", "")), candidate))
        if candidates:
            _, _, chosen = max(candidates, key=lambda item: (item[0], item[1]))
            rows.append(chosen)
            selected_keys.add(canonical_food_key(chosen.get("food_item", "")))

    if metrics.get("_weekly_mode") and slot in {"Lunch", "Dinner"}:
        if slot == "Lunch":
            _add_required_group("plant_protein")
        _add_required_group("leafy_vegetable" if slot == "Lunch" else "vegetable")

    while len(rows) < max_foods:
        max_calories = _capacity("calories", True)
        max_protein = _capacity("protein_g", True)
        max_carbs = _capacity("carbs_g", True)
        max_fat = _capacity("fat_g", True)
        needs_calories = max_calories < budget * 0.98
        needs_protein = protein_budget > 0 and max_protein < protein_budget
        needs_carbs = carbs_budget > 0 and max_carbs < carbs_budget * 0.90
        current_groups = {
            str(item.get("_food_group") or "other") for item in rows
        }
        needs_main_meal_balance = slot in {"Lunch", "Dinner"} and (
            not current_groups.intersection({"vegetable", "leafy_vegetable"})
            or "plant_protein" not in current_groups
        )
        if not (needs_calories or needs_protein or needs_carbs or needs_main_meal_balance):
            break

        minimum_calories = _capacity("calories", False)
        minimum_fat = _capacity("fat_g", False)
        scored_candidates = []
        has_standalone = any(str(item.get("dish_role", "")) == "standalone" for item in rows)
        has_main = any(str(item.get("dish_role", "")) == "main" for item in rows)
        for index, candidate in slot_df.iterrows():
            key = canonical_food_key(candidate.get("food_item", ""))
            if not key or key in selected_keys:
                continue
            if usage_counts.get(key, 0) >= 20:
                # Already present in two alternatives for this slot.
                continue
            candidate_role = str(candidate.get("dish_role", ""))
            candidate_group = str(candidate.get("_food_group") or "other")
            candidate_family = str(candidate.get("_food_family") or key)
            existing_groups = [
                str(item.get("_food_group") or "other") for item in rows
            ]
            existing_families = {
                str(item.get("_food_family") or canonical_food_key(item.get("food_item", "")))
                for item in rows
            }
            if candidate_group == "animal_protein" and "animal_protein" in existing_groups:
                continue
            if candidate_group == "starch" and "starch" in existing_groups:
                continue
            if candidate_group == "condiment" and "condiment" in existing_groups:
                continue
            if candidate_group in {"beverage", "sugary_drink"} and any(
                group in {"beverage", "sugary_drink"} for group in existing_groups
            ):
                continue
            if candidate_family in existing_families:
                continue
            if has_main and candidate_role == "main":
                continue
            if has_main and slot in {"Lunch", "Dinner"} and candidate_role == "standalone":
                continue
            _, candidate_minimum, candidate_maximum = _portion_bounds(candidate)
            min_calories = _scaled_value(candidate, "calories", candidate_minimum)
            if minimum_calories + min_calories > upper_budget:
                continue
            min_candidate_fat = _scaled_value(candidate, "fat_g", candidate_minimum)
            if fat_budget > 0 and minimum_fat + min_candidate_fat > fat_budget * 1.30:
                continue

            max_candidate_calories = _scaled_value(candidate, "calories", candidate_maximum)
            max_candidate_protein = _scaled_value(candidate, "protein_g", candidate_maximum)
            max_candidate_carbs = _scaled_value(candidate, "carbs_g", candidate_maximum)
            max_candidate_fat = _scaled_value(candidate, "fat_g", candidate_maximum)
            protein_density = 100.0 * max_candidate_protein / max(max_candidate_calories, 1.0)
            carbs_density = 100.0 * max_candidate_carbs / max(max_candidate_calories, 1.0)
            fat_density = 100.0 * max_candidate_fat / max(max_candidate_calories, 1.0)
            calorie_gap = max(0.0, budget - max_calories)
            calorie_fit = min(max_candidate_calories, calorie_gap) / max(calorie_gap, 1.0)
            role = str(candidate.get("dish_role", ""))
            role_bonus = 2.0 if role == "side" else 0.75 if role == "standalone" else 0.0
            if has_standalone and role == "main":
                role_bonus -= 2.0
            medical_bonus = max(0.0, _numeric(candidate, "_medical_score")) * 0.05
            balance_bonus = 0.0
            if slot in {"Lunch", "Dinner"}:
                if (
                    candidate_group in {"vegetable", "leafy_vegetable"}
                    and not current_groups.intersection({"vegetable", "leafy_vegetable"})
                ):
                    balance_bonus += 60.0
                if candidate_group == "plant_protein" and "plant_protein" not in current_groups:
                    balance_bonus += 55.0
            fat_pressure = fat_budget > 0 and max_fat >= fat_budget * 0.80
            usage_count = usage_counts.get(key, 0)
            if 0 < usage_count < 10:
                # Across meal slots, permit reuse mainly for genuinely lean,
                # protein-critical foods. Rotate carbohydrate and condiment
                # boosters instead of repeating an entire lunch at dinner.
                usage_penalty = 8.0 if protein_density >= 8.0 else 35.0
            else:
                usage_penalty = usage_count * 8.0
            score = (
                protein_density * (5.0 if needs_protein else 1.5)
                + carbs_density * (0.40 if needs_carbs else 0.05)
                - fat_density * (6.0 if fat_pressure or needs_protein else 3.0)
                + calorie_fit * (3.0 if needs_calories else 0.5)
                + role_bonus
                + medical_bonus
                + balance_bonus
                - usage_penalty
            )
            scored_candidates.append((score, index, candidate))

        if not scored_candidates:
            break
        scored_candidates.sort(key=lambda item: (-item[0], str(item[2].get("food_item", ""))))
        _, _, chosen = scored_candidates[0]
        rows.append(chosen)
        selected_keys.add(canonical_food_key(chosen.get("food_item", "")))

    # Begin at each food's safe database minimum, then allocate remaining
    # calories to the most protein-dense foods first. This improves protein
    # coverage without exceeding the slot's calorie budget.
    grams = []
    for row in rows:
        _, minimum, _ = _portion_bounds(row)
        grams.append(minimum)

    def _current(field: str) -> float:
        return sum(
            _scaled_value(row, field, amount)
            for row, amount in zip(rows, grams)
        )

    # Allocate in small deterministic steps. At each step choose the food whose
    # macro density best matches the remaining protein/carbohydrate/fat needs.
    for _ in range(1000):
        current_calories = _current("calories")
        remaining = budget - current_calories
        if remaining <= 1.0:
            break
        desired = {
            "protein_g": max(0.0, protein_budget - _current("protein_g")) * 100.0 / remaining,
            "carbs_g": max(0.0, carbs_budget - _current("carbs_g")) * 100.0 / remaining,
            "fat_g": max(0.0, fat_budget - _current("fat_g")) * 100.0 / remaining,
        }
        choices = []
        for index, row in enumerate(rows):
            basis, _, maximum = _portion_bounds(row)
            available = maximum - grams[index]
            calories_per_gram = _numeric(row, "calories") / basis
            if available < 0.5 or calories_per_gram <= 0:
                continue
            density = {
                field: _numeric(row, field) / max(_numeric(row, "calories"), 1.0) * 100.0
                for field in ("protein_g", "carbs_g", "fat_g")
            }
            distance = (
                ((density["protein_g"] - desired["protein_g"]) / max(desired["protein_g"], 4.0)) ** 2 * 8.0
                + ((density["carbs_g"] - desired["carbs_g"]) / max(desired["carbs_g"], 8.0)) ** 2 * 0.5
                + ((density["fat_g"] - desired["fat_g"]) / max(desired["fat_g"], 2.0)) ** 2 * 2.0
            )
            choices.append((distance, index, calories_per_gram, available))
        if not choices:
            break
        _, index, calories_per_gram, available = min(choices)
        add_grams = min(5.0, available, remaining / calories_per_gram)
        if add_grams < 0.1:
            break
        grams[index] += add_grams

    # Use whole-gram portions and recalculate all nutrients from those exact
    # displayed quantities.
    grams = [
        round_practical_portion(amount, row)
        for row, amount in zip(rows, grams)
    ]
    foods = []
    for row, amount in zip(rows, grams):
        scale = amount / _portion_bounds(row)[0]
        foods.append({
            "name": str(row["food_item"]),
            "selected_serving_g": int(amount),
            "serving_size_g": int(_numeric(row, "serving_size_g")) or None,
            "min_serving_g": int(_numeric(row, "min_serving_g")) or None,
            "max_serving_g": int(_numeric(row, "max_serving_g")) or None,
            "calories": round(_numeric(row, "calories") * scale),
            "protein_g": round(_numeric(row, "protein_g") * scale, 1),
            "carbs_g": round(_numeric(row, "carbs_g") * scale, 1),
            "fat_g": round(_numeric(row, "fat_g") * scale, 1),
            "gi": int(_numeric(row, "gi")) if pd.notna(row.get("gi")) else None,
            "gl": round(_numeric(row, "gl") * scale, 1) if pd.notna(row.get("gl")) else None,
            "gi_category": str(row["gi_category"]) if pd.notna(row.get("gi_category")) else None,
            "prep_method": str(row["prep_method"]) if pd.notna(row.get("prep_method")) else None,
            "sodium_mg": round(_numeric(row, "sodium_mg") * scale) if pd.notna(row.get("sodium_mg")) else None,
            "sodium_category": str(row["sodium_category"]) if pd.notna(row.get("sodium_category")) else None,
            "fiber_g": round(_numeric(row, "fiber_g") * scale, 1) if pd.notna(row.get("fiber_g")) else None,
            "profile_reasons": medical_food_reasons(row, metrics),
            "medication_notes": medication_food_notes(row, metrics),
            "food_group": str(row.get("_food_group") or "other"),
            "food_family": str(
                row.get("_food_family") or canonical_food_key(row.get("food_item", ""))
            ),
            "practical_step_g": int(_numeric(row, "_practical_step_g", 1)),
            "exact_weekly_limit": exact_food_limit(row),
        })

    return {
        "actual_kcal": round(sum(food["calories"] for food in foods)),
        "protein_g": round(sum(food["protein_g"] for food in foods), 1),
        "carbs_g": round(sum(food["carbs_g"] for food in foods), 1),
        "fat_g": round(sum(food["fat_g"] for food in foods), 1),
        "foods": foods,
    }


def _optimize_daily_option_path(
    plan: dict,
    target_calories: int,
    protein_target: float,
    carbs_target: float,
    fat_target: float,
    slots: tuple[str, ...] | list[str] | None = None,
    balance_priority: bool = False,
    prior_food_counts: dict[str, int] | None = None,
    prior_family_counts: dict[str, int] | None = None,
) -> dict:
    """Exhaustively select the best complete Option 1 path.

    Meal options are already safety-filtered and portion-bounded. With three
    alternatives across four slots there are only 81 complete paths, so this
    can evaluate every path rather than claiming a heuristic is "closest".
    """
    slots = tuple(slots or (
        slot for slot in ("Breakfast", "Lunch", "Dinner", "Snack")
        if slot in plan
    ))
    if not slots:
        return {"evaluated_combinations": 0, "guardrail_status": "unavailable"}
    option_ranges = [range(len(plan.get(slot, {}).get("options", []))) for slot in slots]
    if any(len(option_range) == 0 for option_range in option_ranges):
        return {"evaluated_combinations": 0, "guardrail_status": "unavailable"}

    prior_food_counts = prior_food_counts or {}
    prior_family_counts = prior_family_counts or {}
    combinations = []
    for indices in itertools.product(*option_ranges):
        options = [plan[slot]["options"][index] for slot, index in zip(slots, indices)]
        record = {
            "indices": indices,
            "calories": sum(option["actual_kcal"] for option in options),
            "protein_g": round(sum(option["protein_g"] for option in options), 1),
            "carbs_g": round(sum(option["carbs_g"] for option in options), 1),
            "fat_g": round(sum(option["fat_g"] for option in options), 1),
        }
        option_foods = [food for option in options for food in option.get("foods", [])]
        slot_food_names = {
            slot: {
                realism_canonical_name(food.get("name", ""))
                for food in option.get("foods", [])
            }
            for slot, option in zip(slots, options)
        }
        record["lunch_dinner_overlap"] = len(
            slot_food_names.get("Lunch", set())
            & slot_food_names.get("Dinner", set())
        )
        family_counts: dict[str, int] = {}
        exact_counts: dict[str, int] = {}
        exact_limits: dict[str, int] = {}
        for food in option_foods:
            family = str(food.get("food_family") or "")
            exact = realism_canonical_name(food.get("name", ""))
            if family:
                family_counts[family] = family_counts.get(family, 0) + 1
            if exact:
                exact_counts[exact] = exact_counts.get(exact, 0) + 1
                exact_limits[exact] = int(
                    food.get("exact_weekly_limit") or DEFAULT_EXACT_FOOD_LIMIT
                )
        record["weekly_limit_violation"] = any(
            prior_food_counts.get(exact, 0) + count > exact_limits[exact]
            for exact, count in exact_counts.items()
        ) or any(
            prior_family_counts.get(family, 0) + count > family_limit(family)
            for family, count in family_counts.items()
        )
        record["realism_penalty"] = (
            sum(
                max(0, count - 1) * 1000
                for family, count in family_counts.items()
                if family in {
                    "chicken", "seafood", "egg", "pickle", "sweet",
                    "sugary_drink",
                }
            )
            + sum(max(0, count - 1) * 500 for count in exact_counts.values())
            + max(0, record["lunch_dinner_overlap"] - 2) * 2000
        )
        if abs(record["calories"] - target_calories) <= target_calories * 0.05:
            combinations.append(record)

    if not combinations:
        return {"evaluated_combinations": 0, "guardrail_status": "unavailable"}

    evaluated_combinations = len(combinations)
    structurally_realistic = [
        record for record in combinations
        if record.get("lunch_dinner_overlap", 0) <= 2
        and not record.get("weekly_limit_violation", False)
    ]
    if structurally_realistic:
        combinations = structurally_realistic

    def _within(record: dict, fat_limit: float, carbs_low: float, carbs_high: float) -> bool:
        fat_ok = not fat_target or record["fat_g"] <= fat_target * fat_limit
        carbs_ok = (
            not carbs_target
            or carbs_target * carbs_low <= record["carbs_g"] <= carbs_target * carbs_high
        )
        return fat_ok and carbs_ok

    strict = [record for record in combinations if _within(record, 1.20, 0.80, 1.20)]
    relaxed = [record for record in combinations if _within(record, 1.30, 0.75, 1.25)]
    if strict:
        candidates = strict
        guardrail_status = "strict"
        fat_limit_percent = 120
        carbs_range_percent = (80, 120)
    elif relaxed:
        candidates = relaxed
        guardrail_status = "relaxed"
        fat_limit_percent = 130
        carbs_range_percent = (75, 125)
    else:
        candidates = combinations
        guardrail_status = "best_effort"
        fat_limit_percent = None
        carbs_range_percent = None

    def _selection_key(record: dict):
        if balance_priority:
            protein_shortfall = max(0.0, protein_target - record["protein_g"])
            carbs_error = abs(record["carbs_g"] - carbs_target)
            fat_excess = max(0.0, record["fat_g"] - fat_target)
            fat_shortfall = max(0.0, fat_target - record["fat_g"])
            calorie_error = abs(record["calories"] - target_calories)
            penalty = (
                record.get("realism_penalty", 0)
                +
                protein_shortfall * 3.0
                + carbs_error * 0.5
                + fat_excess * 5.0
                + fat_shortfall * 0.5
                + calorie_error * 0.2
            )
            return (-penalty, record["protein_g"])
        protein_value = record["protein_g"] if protein_target else 0.0
        carbs_error = abs(record["carbs_g"] - carbs_target) if carbs_target else 0.0
        fat_error = abs(record["fat_g"] - fat_target) if fat_target else 0.0
        calorie_error = abs(record["calories"] - target_calories)
        return (
            -record.get("realism_penalty", 0),
            protein_value,
            -carbs_error,
            -fat_error,
            -calorie_error,
        )

    selected = max(candidates, key=_selection_key)
    for slot, selected_index in zip(slots, selected["indices"]):
        options = plan[slot]["options"]
        if selected_index:
            options[0], options[selected_index] = options[selected_index], options[0]

    return {
        "evaluated_combinations": evaluated_combinations,
        "guardrail_status": guardrail_status,
        "fat_limit_percent": fat_limit_percent,
        "carbs_range_percent": carbs_range_percent,
        "maximum_achievable_protein_g": selected["protein_g"],
        "maximum_achievable_protein_percent": (
            round(selected["protein_g"] / protein_target * 100)
            if protein_target else None
        ),
    }


# ── Single-day meal plan ──────────────────────────────────────────────────────

def build_meal_plan(
    target_calories: int,
    metrics: dict,
    state: UserDietState,
    save_as_current: bool = True,
    included_slots: list[str] | tuple[str, ...] | None = None,
) -> dict:
    """
    Select foods from the DB for each meal slot and calculate EXACT macros
    from the CSV — no LLM estimation involved.
    Returns a structured dict with per-slot foods and totals.
    """
    df = enrich_food_frame(_food_df)

    # ── Dietary preference filter ────────────────────────────────────────
    pref = (metrics.get("dietary_preference") or "").lower()
    _is_nonveg = any(p in pref for p in ("non-veg", "nonveg", "non veg"))
    _is_vegan  = "vegan" in pref and not _is_nonveg
    _is_veg    = "veg" in pref and not _is_vegan and not _is_nonveg

    if "diet_type" in df.columns:
        if _is_vegan:
            _vf = df[df["diet_type"] == "vegan"]
            if len(_vf) >= 10:
                df = _vf
        elif _is_veg:
            _vf = df[df["diet_type"].isin(["vegan", "vegetarian"])]
            if len(_vf) >= 10:
                df = _vf
    else:
        if _is_vegan:
            df = df[~df["category"].str.contains("Poultry & Meat|Seafood|Dairy", case=False, na=False)]
        elif _is_veg:
            df = df[~df["category"].str.contains("Poultry & Meat|Seafood", case=False, na=False)]

    if "meal_type" in df.columns:
        df = df[
            (df["meal_type"] != "condiment")
            | (df["_food_group"] == "leafy_vegetable")
        ]
    if "dish_role" in df.columns:
        df = df[df["dish_role"] != "condiment"]
    df = df[df["_food_group"] != "condiment"]
    # Records with a side-dish serving below 25 g behave like ingredients,
    # not meaningful meal components (for example a 5–15 g calorie filler).
    df = df[
        ~(
            (df["dish_role"] == "side")
            & (pd.to_numeric(df["max_serving_g"], errors="coerce").fillna(0) < 25)
        )
    ]

    allergies = parse_allergy_string(metrics.get("allergies", "") or "")
    df = apply_allergy_filter(df, allergies)
    df = apply_medication_food_filter(df, metrics)

    _prep_exclude = metrics.get("_prep_exclude") or []
    if _prep_exclude and "prep_method" in df.columns:
        filtered = df[~df["prep_method"].isin(_prep_exclude)]
        if len(filtered) >= 10:
            df = filtered

    if state.disliked_foods:
        filtered_dl = df[~df["food_item"].isin(state.disliked_foods)]
        if len(filtered_dl) >= 10:
            df = filtered_dl

    # ── Goal-aware calorie split ─────────────────────────────────────────
    _hgoal   = (metrics.get("health_goal") or "").lower()
    _is_lose = any(w in _hgoal for w in ("lose", "loss", "cut", "reduce"))
    _is_gain = any(w in _hgoal for w in ("gain", "muscle", "bulk", "increase"))

    _protein_target = float(metrics.get("protein_target_g") or 0)
    _carbs_target = float(metrics.get("carbs_target_g") or 0)
    _fat_target = float(metrics.get("fat_target_g") or 0)
    _high_protein_profile = _protein_target / max(float(target_calories), 1.0) * 100 >= 6.0

    if _is_lose:
        split_weights = {
            "Breakfast": 0.25,
            "Lunch": 0.35,
            "Dinner": 0.25,
            "Snack": 0.15,
        }
        _sa_tolerance = 0
    elif _is_gain and _high_protein_profile:
        split_weights = {
            "Breakfast": 0.20,
            "Lunch": 0.35,
            "Dinner": 0.35,
            "Snack": 0.10,
        }
        _sa_tolerance = 150
    elif _is_gain:
        split_weights = {
            "Breakfast": 0.25,
            "Lunch": 0.35,
            "Dinner": 0.30,
            "Snack": 0.10,
        }
        _sa_tolerance = 150
    else:
        split_weights = {
            "Breakfast": 0.25,
            "Lunch": 0.35,
            "Dinner": 0.30,
            "Snack": 0.10,
        }
        _sa_tolerance = 50

    all_slots = ("Breakfast", "Lunch", "Dinner", "Snack")
    requested_slots = tuple(
        slot for slot in (included_slots or all_slots)
        if slot in all_slots
    )
    if not requested_slots:
        raise ValueError("At least one valid meal slot is required")
    weight_total = sum(split_weights[slot] for slot in requested_slots)
    splits = {
        slot: round(target_calories * split_weights[slot] / weight_total)
        for slot in requested_slots
    }
    # Keep the requested plan budget exact after integer rounding.
    split_delta = round(target_calories - sum(splits.values()))
    if split_delta:
        adjustment_slot = max(requested_slots, key=lambda slot: split_weights[slot])
        splits[adjustment_slot] += split_delta

    N_OPTIONS = 3

    def _protein_sample(df_pool, seed):
        """Choose a varied food with a macro profile suitable for its dish role."""
        weights = pd.Series(1.0, index=df_pool.index)
        if "_medical_score" in df_pool.columns:
            medical = pd.to_numeric(df_pool["_medical_score"], errors="coerce").fillna(0)
            weights *= medical - medical.min() + 1.0
        if _protein_target > 80 and "protein_g" in df_pool.columns and len(df_pool) >= 3:
            calories = pd.to_numeric(df_pool["calories"], errors="coerce").fillna(1).clip(lower=1)
            protein_density = pd.to_numeric(df_pool["protein_g"], errors="coerce").fillna(0) / calories * 100
            carbs_density = pd.to_numeric(df_pool["carbs_g"], errors="coerce").fillna(0) / calories * 100
            fat_density = pd.to_numeric(df_pool["fat_g"], errors="coerce").fillna(0) / calories * 100
            roles = df_pool.get("dish_role", pd.Series("", index=df_pool.index)).astype(str)
            fit = pd.Series(0.0, index=df_pool.index)
            side_mask = roles == "side"
            main_mask = roles == "main"
            standalone_mask = ~(side_mask | main_mask)
            fit.loc[side_mask] = (
                protein_density.loc[side_mask] * 4.0
                - fat_density.loc[side_mask] * 5.0
                + carbs_density.loc[side_mask] * 0.10
            )
            fit.loc[main_mask] = (
                protein_density.loc[main_mask] * 1.5
                + carbs_density.loc[main_mask] * 0.30
                - fat_density.loc[main_mask] * 5.0
            )
            fit.loc[standalone_mask] = (
                protein_density.loc[standalone_mask] * 3.0
                + carbs_density.loc[standalone_mask] * 0.15
                - fat_density.loc[standalone_mask] * 5.0
            )
            fit = fit - fit.min() + 1.0
            weights *= fit.clip(lower=0.1) ** 2
        return df_pool.sample(1, random_state=seed, weights=weights).iloc[0]

    def pick_option(slot_df, budget, seed):
        has_roles = "dish_role" in slot_df.columns
        if has_roles:
            main_df       = slot_df[slot_df["dish_role"] == "main"]
            side_df       = slot_df[slot_df["dish_role"] == "side"]
            standalone_df = slot_df[slot_df["dish_role"] == "standalone"]

            if len(main_df) > 0 and len(side_df) > 0:
                main_item = _protein_sample(main_df, seed)
                remaining = budget - int(main_item["calories"])
                fitting_sides = side_df[side_df["calories"] <= remaining + 80]
                if len(fitting_sides) > 0:
                    preferred_ids = set()
                    if "pairs_well_with" in main_item.index and pd.notna(main_item["pairs_well_with"]) and str(main_item["pairs_well_with"]).strip():
                        preferred_ids = set(str(main_item["pairs_well_with"]).split(","))
                    preferred = fitting_sides[fitting_sides["food_id"].isin(preferred_ids)]
                    side_pool = (
                        fitting_sides
                        if _protein_target > 80
                        else preferred if len(preferred) > 0 else fitting_sides
                    )
                    side_item = _protein_sample(
                        side_pool,
                        seed + 7,
                    )
                    return [main_item, side_item]
                return [main_item]

            if len(standalone_df) > 0:
                _fit_sa = standalone_df[standalone_df["calories"] <= budget + _sa_tolerance]
                if len(_fit_sa) > 0:
                    return [_protein_sample(_fit_sa, seed)]

        shuffled = slot_df.sample(frac=1, random_state=seed).reset_index(drop=True)
        selected, used_categories, remaining = [], set(), budget
        for _, row in shuffled.iterrows():
            if len(selected) >= 2:
                break
            cat = str(row.get("category", "")).strip().lower()
            if selected and cat and cat in used_categories:
                continue
            if row["calories"] <= remaining + 50 or len(selected) == 0:
                selected.append(row)
                used_categories.add(cat)
                remaining -= row["calories"]
        return selected

    def pick_standalone_option(slot_df, budget, seed):
        if "dish_role" not in slot_df.columns:
            return []
        sa_df   = slot_df[slot_df["dish_role"] == "standalone"]
        fitting = sa_df[sa_df["calories"] <= budget + _sa_tolerance]
        if len(fitting) == 0:
            return []
        return [_protein_sample(fitting, seed)]

    plan = {}
    total_cal = total_protein = total_carbs = total_fat = 0.0
    _cross_slot_used: set = set()
    _cross_slot_usage: dict[str, int] = {}
    _week_mains_used: set = set(metrics.get("_week_used") or set())
    _week_sides_used: set = set(metrics.get("_week_sides_used") or set())
    _week_family_counts: dict[str, int] = metrics.get("_week_family_counts") or {}
    _week_food_counts: dict[str, int] = metrics.get("_week_food_counts") or {}
    _previous_day_foods: set[str] = set(metrics.get("_previous_day_foods") or set())
    _day_family_counts: dict[str, int] = {}
    _weekly_mode = bool(metrics.get("_weekly_mode"))

    for slot, budget in splits.items():
        slot_protein_budget = (
            _protein_target * budget / max(float(target_calories), 1.0)
            if _protein_target > 0 else 0.0
        )
        slot_carbs_budget = (
            _carbs_target * budget / max(float(target_calories), 1.0)
            if _carbs_target > 0 else 0.0
        )
        slot_fat_budget = (
            _fat_target * budget / max(float(target_calories), 1.0)
            if _fat_target > 0 else 0.0
        )
        if "meal_type" in df.columns:
            if slot in ("Lunch", "Dinner"):
                slot_df = df[
                    df["meal_type"].isin(["lunch_dinner", "any"])
                    | (df["_food_group"] == "leafy_vegetable")
                ].copy()
            elif slot == "Snack":
                _snack_pool = df[df["meal_type"] == "snack"]
                _any_snacks = df[
                    (df["meal_type"] == "any") &
                    (df["dish_role"].isin(["standalone", "side", "condiment"]))
                ]
                slot_df = pd.concat([_snack_pool, _any_snacks]).drop_duplicates().copy()
            else:
                slot_df = df[df["meal_type"].isin([slot.lower(), "any"])].copy()
        else:
            slot_df = df.copy()

        slot_df = apply_medical_condition_filter(slot_df, metrics)
        slot_df = rank_foods_for_medical_profile(slot_df, metrics)

        if _weekly_mode:
            allowed_mask = slot_df.apply(
                lambda row: (
                    _week_family_counts.get(str(row.get("_food_family") or ""), 0)
                    + _day_family_counts.get(str(row.get("_food_family") or ""), 0)
                    < family_limit(str(row.get("_food_family") or ""))
                    and _week_food_counts.get(
                        realism_canonical_name(row.get("food_item", "")), 0
                    ) + _cross_slot_usage.get(
                        canonical_food_key(row.get("food_item", "")), 0
                    ) < exact_food_limit(row)
                ),
                axis=1,
            )
            filtered_realistic = slot_df[allowed_mask]
            if not filtered_realistic.empty:
                slot_df = filtered_realistic

            restricted_today = {
                family for family, count in _day_family_counts.items()
                if count >= 1 and family in {
                    "chicken", "seafood", "egg", "pickle", "sweet",
                    "sugary_drink", "red_meat", "processed_meat",
                }
            }
            if restricted_today:
                varied_today = slot_df[
                    ~slot_df["_food_family"].isin(restricted_today)
                ]
                if len(varied_today) >= 6:
                    slot_df = varied_today

            if _previous_day_foods:
                consecutive_mask = slot_df.apply(
                    lambda row: (
                        realism_canonical_name(row.get("food_item", ""))
                        in _previous_day_foods
                        and exact_food_limit(row) <= DEFAULT_EXACT_FOOD_LIMIT
                    ),
                    axis=1,
                )
                non_consecutive = slot_df[~consecutive_mask]
                if len(non_consecutive) >= 6:
                    slot_df = non_consecutive

            # Most weekly snacks should be fruit/dairy/nuts/pulses. Reserve
            # sweets for at most two planned days, after hard family caps.
            if slot == "Snack" and int(metrics.get("_weekly_day_index") or 0) not in {4, 7}:
                healthy_snacks = slot_df[
                    ~slot_df["_food_group"].isin({"sweet", "sugary_drink"})
                ]
                if not healthy_snacks.empty:
                    slot_df = healthy_snacks

        if _cross_slot_used and "dish_role" in slot_df.columns:
            _varied = slot_df[
                ~((slot_df["dish_role"].isin({"main", "standalone"})) &
                  (slot_df["food_item"].isin(_cross_slot_used)))
            ]
            if len(_varied) >= 6:
                slot_df = _varied

        if not _weekly_mode and _week_mains_used and "dish_role" in slot_df.columns:
            _wk_varied = slot_df[
                ~((slot_df["dish_role"].isin({"main", "standalone"})) &
                  (slot_df["food_item"].isin(_week_mains_used)))
            ]
            if len(_wk_varied) >= 6:
                slot_df = _wk_varied

        if not _weekly_mode and _week_sides_used and "dish_role" in slot_df.columns:
            _wk_side_varied = slot_df[
                ~((slot_df["dish_role"] == "side") &
                  (slot_df["food_item"].isin(_week_sides_used)))
            ]
            if len(_wk_side_varied) >= 6:
                slot_df = _wk_side_varied

        options = []
        used_names: set = set()
        final_signatures: set[frozenset[str]] = set()
        option_usage = dict(_cross_slot_usage)
        # Python's built-in hash is randomized per process, which made the same
        # profile produce different macro totals after every server restart.
        base_seed = sum((index + 1) * ord(char) for index, char in enumerate(slot)) % 9999

        # ── ChromaDB diversity seeding ────────────────────────────────────────
        # Ask ChromaDB for 3 semantically different "headline" foods from the
        # already pandas-filtered pool. Each option will be biased to start
        # from a different part of the food flavour space.
        _chroma_seeds: list[str | None] = [None, None, None]
        if _CHROMA_AVAILABLE and len(slot_df) >= N_OPTIONS * 2:
            try:
                _pool_names  = list(slot_df["food_item"])
                _seed_names  = diverse_foods_from_pool(
                    slot, _pool_names,
                    goal=metrics.get("health_goal", ""),
                    n_options=N_OPTIONS,
                )
                for _si, _sn in enumerate(_seed_names[:N_OPTIONS]):
                    _chroma_seeds[_si] = _sn
            except Exception as _ce:
                print(f"[WARN] ChromaDB seed error ({slot}): {_ce}")

        # Build one option per seed, with fallback retries
        for opt_idx in range(N_OPTIONS):
            seed = (base_seed + opt_idx * 37) % 9999

            # Re-order slot_df so the ChromaDB seed food floats to the top.
            # pick_option samples with a fixed seed, so the seed food gets
            # high priority without hard-excluding other foods.
            seeded_df = slot_df
            _cseed = _chroma_seeds[opt_idx]
            if _cseed and _cseed in slot_df["food_item"].values:
                _seed_row   = slot_df[slot_df["food_item"] == _cseed]
                _other_rows = slot_df[slot_df["food_item"] != _cseed]
                seeded_df   = pd.concat([_seed_row, _other_rows]).reset_index(drop=True)

            inner = 0
            while inner < 15:
                _sv = (seed + inner * 7) % 9999
                selected = (
                    pick_standalone_option(seeded_df, budget, _sv) or pick_option(seeded_df, budget, _sv)
                    if opt_idx == N_OPTIONS - 1
                    else pick_option(seeded_df, budget, _sv)
                )
                names = frozenset(r["food_item"] for r in selected)
                if names and names not in used_names:
                    optimized = None
                    signature = frozenset()
                    for diversity_try in range(4):
                        optimized = _targeted_option(
                            selected,
                            slot_df,
                            slot,
                            budget,
                            slot_protein_budget,
                            slot_carbs_budget,
                            slot_fat_budget,
                            (_sv + diversity_try * 19) % 9999,
                            metrics,
                            usage_counts=option_usage,
                            max_foods=(2 if slot == "Snack" else 4 if slot == "Breakfast" else 5),
                        )
                        signature = frozenset(
                            canonical_food_key(food["name"])
                            for food in optimized["foods"]
                        )
                        if signature and signature not in final_signatures:
                            break
                        for key in signature:
                            option_usage[key] = option_usage.get(key, 0) + 15
                    if signature and signature not in final_signatures:
                        used_names.add(names)
                        final_signatures.add(signature)
                        options.append(optimized)
                        for key in signature:
                            # Same-slot reuse receives a stronger penalty than
                            # cross-slot reuse, but remains possible when needed
                            # to preserve medical or nutrition constraints.
                            option_usage[key] = option_usage.get(key, 0) + 10
                        break
                inner += 1

        # Option 1 is the path used for daily totals, so present the strongest
        # macro match first after diversity has produced genuinely different
        # alternatives.
        options.sort(key=lambda option: (
            abs(option["actual_kcal"] - budget)
            + max(0.0, slot_protein_budget - option["protein_g"]) * 4.0
            + abs(slot_carbs_budget - option["carbs_g"]) * 0.25
            + abs(slot_fat_budget - option["fat_g"]) * 2.0
        ))

        _main_roles = {"main", "standalone"}
        for _opt in options:
            for _fd in _opt["foods"]:
                _role_rows = slot_df[slot_df["food_item"] == _fd["name"]]
                if not _role_rows.empty:
                    _role = _role_rows.iloc[0].get("dish_role", "")
                    if _role in _main_roles:
                        _cross_slot_used.add(_fd["name"])
        chosen_signature = (
            frozenset(
                canonical_food_key(food["name"])
                for food in options[0]["foods"]
            )
            if options else frozenset()
        )
        for key in chosen_signature:
            _cross_slot_usage[key] = _cross_slot_usage.get(key, 0) + 1
        if options:
            for food in options[0].get("foods", []):
                family = str(food.get("food_family") or "")
                if family:
                    _day_family_counts[family] = _day_family_counts.get(family, 0) + 1

        first = options[0] if options else {"actual_kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}
        plan[slot] = {
            "target_kcal": budget,
            "options":     options,
            "actual_kcal": first["actual_kcal"],
            "protein_g":   first["protein_g"],
            "carbs_g":     first["carbs_g"],
            "fat_g":       first["fat_g"],
        }
        total_cal     += first["actual_kcal"]
        total_protein += first["protein_g"]
        total_carbs   += first["carbs_g"]
        total_fat     += first["fat_g"]

    feasibility = _optimize_daily_option_path(
        plan,
        target_calories,
        _protein_target,
        _carbs_target,
        _fat_target,
        requested_slots,
        balance_priority=bool(metrics.get("_progress_aware")),
        prior_food_counts=_week_food_counts if _weekly_mode else None,
        prior_family_counts=_week_family_counts if _weekly_mode else None,
    )
    plan["feasibility"] = feasibility

    # The exhaustive daily optimizer may reorder each slot. Recalculate slot
    # summaries and daily totals from the selected complete Option 1 path.
    total_cal = total_protein = total_carbs = total_fat = 0.0
    for slot in requested_slots:
        options = plan[slot].get("options", [])
        first = options[0] if options else {
            "actual_kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0,
        }
        plan[slot].update({
            "actual_kcal": first["actual_kcal"],
            "protein_g": first["protein_g"],
            "carbs_g": first["carbs_g"],
            "fat_g": first["fat_g"],
        })
        total_cal += first["actual_kcal"]
        total_protein += first["protein_g"]
        total_carbs += first["carbs_g"]
        total_fat += first["fat_g"]

    plan["totals"] = {
        "target_kcal": target_calories,
        "actual_kcal": round(total_cal),
        "protein_g":   round(total_protein, 1),
        "carbs_g":     round(total_carbs,   1),
        "fat_g":       round(total_fat,     1),
        "calorie_delta": round(total_cal - target_calories),
        "calorie_within_5_percent": abs(total_cal - target_calories) <= target_calories * 0.05,
        "protein_coverage_percent": (
            round(total_protein / _protein_target * 100)
            if _protein_target > 0 else None
        ),
        "carbs_coverage_percent": (
            round(total_carbs / _carbs_target * 100)
            if _carbs_target > 0 else None
        ),
        "fat_coverage_percent": (
            round(total_fat / _fat_target * 100)
            if _fat_target > 0 else None
        ),
    }
    plan["planned_slots"] = list(requested_slots)
    plan["active_targets"] = {
        "calories": target_calories,
        "protein_g": _protein_target,
        "carbs_g": _carbs_target,
        "fat_g": _fat_target,
    }
    if save_as_current:
        with state.lock:
            state.plan_cache.clear()
            state.plan_cache.update(plan)
            persist_user_state(state)
    return plan


def build_remaining_day_plan(
    daily_target_calories: int,
    metrics: dict,
    state: UserDietState,
    *,
    save_as_current: bool = True,
) -> dict | None:
    """Build a plan only for today's unlogged slots and remaining nutrition."""
    progress = get_daily_progress(
        state,
        metrics,
        target_calories=daily_target_calories,
    )
    remaining_slots = [
        slot for slot in ("Breakfast", "Lunch", "Dinner", "Snack")
        if slot not in progress["completed_slots"]
    ]
    remaining_calories = round(progress["remaining_raw"]["calories"])
    if not remaining_slots or remaining_calories <= 0:
        return None

    remaining_metrics = dict(metrics)
    remaining_metrics["target_calories"] = remaining_calories
    remaining_metrics["_progress_aware"] = any(
        float(metrics.get(key) or 0) > 0
        for key in ("protein_target_g", "carbs_target_g", "fat_target_g")
    )
    for field, metric_key in (
        ("protein_g", "protein_target_g"),
        ("carbs_g", "carbs_target_g"),
        ("fat_g", "fat_target_g"),
    ):
        remaining_metrics[metric_key] = progress["remaining"][field]

    plan = build_meal_plan(
        remaining_calories,
        remaining_metrics,
        state,
        save_as_current=False,
        included_slots=remaining_slots,
    )
    plan["daily_progress"] = progress
    plan["is_remaining_day_plan"] = True
    plan["daily_target_calories"] = daily_target_calories
    if save_as_current:
        with state.lock:
            state.plan_cache.clear()
            state.plan_cache.update(plan)
            persist_user_state(state)
    return plan


# ── Formatters ────────────────────────────────────────────────────────────────

def _medication_guidance_lines(metrics: dict | None) -> list[str]:
    entries = medication_guidance(metrics or {})
    if not entries:
        return []
    lines = ["**Medication-food safety applied:**"]
    for entry in entries:
        medication = entry["medication"]
        for guidance_type, message in entry["guidance"]:
            lines.append(f"- **{medication} ({guidance_type}):** {message}")
        if entry["excluded_terms"]:
            lines.append(
                f"  Excluded from recommendations: {', '.join(entry['excluded_terms'])}"
            )
    lines.append(
        "*Do not change your medication or make major diet changes without your prescriber or pharmacist.*"
    )
    return lines + [""]


def _format_option(opt: dict, label: str, conditions: list = None) -> list:
    conditions = conditions or []
    gi_cats = [f.get("gi_category") for f in opt["foods"] if f.get("gi_category")]
    gi_rank = {"high": 2, "medium": 1, "low": 0}
    opt_gi  = max(gi_cats, key=lambda g: gi_rank.get(g, 0)) if gi_cats else None
    gi_text = opt_gi.title() if opt_gi else "Not available"

    lines = [
        f"### {label} — {opt['actual_kcal']} kcal",
        "",
        f"**Nutrition:** Protein {opt['protein_g']} g · "
        f"Carbs {opt['carbs_g']} g · Fat {opt['fat_g']} g · GI {gi_text}",
        "",
        "**Foods included:**",
        "",
    ]
    for f in opt["foods"]:
        if f.get("selected_serving_g"):
            portion = f" ({f['selected_serving_g']}g)"
        elif f.get("min_serving_g") and f.get("max_serving_g"):
            portion = f" ({f['min_serving_g']}–{f['max_serving_g']}g)"
        elif f.get("serving_size_g"):
            portion = f" ({f['serving_size_g']}g)"
        else:
            portion = ""
        lines.append(
            f"- **{f['name']}**{portion} — {f['calories']} kcal  "
            f"Protein {f['protein_g']} g · Carbs {f['carbs_g']} g · Fat {f['fat_g']} g"
        )
        if f.get("profile_reasons"):
            lines.append(f"  - _Why it fits:_ {', '.join(f['profile_reasons'])}")
        for note in f.get("medication_notes") or []:
            lines.append(f"  - _Medication note:_ {note}")

    has_fried = any(f.get("prep_method") == "deep_fried" for f in opt["foods"])
    warn_conditions = {"diabetes", "heart disease", "hypertension", "obesity"}
    if has_fried and (not conditions or warn_conditions.intersection(set(conditions))):
        lines.extend(("", "> **Note:** Contains a deep-fried item; enjoy it in moderation."))

    has_high_sod = any(f.get("sodium_category") == "high" for f in opt["foods"])
    heart_hyp = {"heart disease", "hypertension"}
    if has_high_sod and conditions and heart_hyp.intersection(set(c.lower() for c in conditions)):
        lines.extend(("", "> **Note:** Contains a high-sodium item; limit the portion or request a low-sodium plan."))

    return lines


def format_meal_plan_response(plan: dict, conditions: list = None,
                               prep_exclude: list = None, goal: str = "",
                               target_cal: int = 0, metrics: dict = None) -> str:
    lines = _medication_guidance_lines(metrics)
    _progress = plan.get("daily_progress") or {}
    _is_remaining_plan = bool(plan.get("is_remaining_day_plan"))
    if _is_remaining_plan:
        _consumed = _progress.get("consumed", {})
        _remaining = _progress.get("remaining", {})
        _completed = _progress.get("completed_slots", [])
        lines.extend((
            "**Today's progress before this plan:**",
            f"Consumed: {_consumed.get('calories', 0)} kcal | "
            f"Protein: {_consumed.get('protein_g', 0)}g | "
            f"Carbs: {_consumed.get('carbs_g', 0)}g | "
            f"Fat: {_consumed.get('fat_g', 0)}g",
            f"Remaining target: {_remaining.get('calories', 0)} kcal | "
            f"Protein: {_remaining.get('protein_g', 0)}g | "
            f"Carbs: {_remaining.get('carbs_g', 0)}g | "
            f"Fat: {_remaining.get('fat_g', 0)}g",
        ))
        if _completed:
            lines.append("Completed meals: " + ", ".join(_completed))
        lines.append("")
    _g = (goal or "").lower()
    if _g or target_cal:
        _goal_emoji = {"lose": "🔻", "gain": "📈", "maintain": "⚖️"}
        _gkey = ("lose" if any(w in _g for w in ("lose","loss","cut")) else
                 "gain" if any(w in _g for w in ("gain","muscle","bulk")) else "maintain")
        _gem  = _goal_emoji.get(_gkey, "🎯")
        _goal_label = {"lose": "Weight Loss", "gain": "Weight Gain",
                       "maintain": "Maintain Weight"}.get(_gkey, goal.title())
        _banner_parts = []
        if _goal_label:
            _banner_parts.append(f"{_gem} **Goal: {_goal_label}**")
        if target_cal:
            if _is_remaining_plan:
                _banner_parts.append(f"🔥 **Daily target: {target_cal:,} kcal**")
            else:
                _banner_parts.append(f"🔥 **Target: {target_cal:,} kcal/day**")
        if _gkey == "lose":
            _banner_parts.append("📋 *Dinner reduced to 25% — snack increased to 15% for satiety*")
        elif _gkey == "gain":
            _banner_parts.append("📋 *Calorie surplus included — choose calorie-dense options*")
        if _banner_parts:
            lines.append("  |  ".join(_banner_parts[:2]))
            if len(_banner_parts) > 2:
                lines.append(_banner_parts[2])
            lines.append("")

    if prep_exclude:
        _excl_readable = {
            "deep_fried": "deep-fried",
            "shallow_fried": "shallow-fried",
            "stir_fried": "stir-fried",
        }
        _excl_str = ", ".join(_excl_readable.get(p, p.replace("_", "-")) for p in prep_exclude)
        lines.append(f"*🥗 Filtering out {_excl_str} foods as requested.*\n")

    # ── Meal timing guidance ─────────────────────────────────────────────────
    _is_lose_goal = any(w in (goal or "").lower() for w in ("lose", "loss", "cut"))
    _SLOT_TIMES = {
        "Breakfast": ("7:00 – 8:30 AM" if _is_lose_goal else "7:00 – 9:00 AM"),
        "Lunch":     ("12:00 – 1:30 PM" if _is_lose_goal else "12:00 – 2:00 PM"),
        "Dinner":    ("6:00 – 7:00 PM"  if _is_lose_goal else "6:00 – 8:00 PM"),
        "Snack":     ("3:00 – 4:00 PM"  if _is_lose_goal else "3:00 – 5:00 PM"),
    }

    _planned_slots = plan.get("planned_slots") or [
        slot for slot in ("Breakfast", "Lunch", "Dinner", "Snack")
        if slot in plan
    ]
    for slot in _planned_slots:
        s        = plan[slot]
        _time    = _SLOT_TIMES[slot]
        lines.append(f"**{slot}** (~{s['target_kcal']} kcal) 🕐 *{_time}*")
        for i, opt in enumerate(s.get("options", []), 1):
            lines.extend(_format_option(opt, f"Option {i}", conditions=conditions))
            lines.append("")

    t = plan["totals"]
    _total_label = "Remaining-plan total" if _is_remaining_plan else "Daily Total"
    lines.append(
        f"**{_total_label} (Option 1): {t['actual_kcal']} kcal** "
        f"(target {t['target_kcal']} kcal)"
    )
    lines.append(f"Protein: {t['protein_g']}g | Carbs: {t['carbs_g']}g | Fat: {t['fat_g']}g")
    _coverage_parts = []
    for label, key in (
        ("Protein", "protein_coverage_percent"),
        ("Carbs", "carbs_coverage_percent"),
        ("Fat", "fat_coverage_percent"),
    ):
        if t.get(key) is not None:
            _coverage_parts.append(f"{label} {t[key]}%")
    if _coverage_parts:
        lines.append("Macro target coverage: " + " | ".join(_coverage_parts))
    _feasibility = plan.get("feasibility") or {}
    _evaluated = _feasibility.get("evaluated_combinations", 0)
    _combination_scope = "remaining-day" if _is_remaining_plan else "full-day"
    if _evaluated:
        _guardrail_status = _feasibility.get("guardrail_status")
        if _guardrail_status == "strict":
            lines.append(
                f"Feasibility check: evaluated all {_evaluated} safe {_combination_scope} combinations; "
                "Option 1 provides the highest protein while keeping fat at or below 120% "
                "and carbohydrates within 80–120% of target."
            )
        elif _guardrail_status == "relaxed":
            lines.append(
                f"Feasibility check: evaluated all {_evaluated} safe {_combination_scope} combinations; "
                "strict macro limits were infeasible, so Option 1 uses relaxed bounds."
            )
        else:
            lines.append(
                f"Feasibility check: evaluated all {_evaluated} safe {_combination_scope} combinations; "
                "none met the macro guardrails, so Option 1 is best effort."
            )
    if t.get("calorie_within_5_percent"):
        lines.append("✅ *Calorie target validated within 5%.*")
    else:
        lines.append(
            f"⚠️ *Calorie target gap: {abs(t.get('calorie_delta', 0))} kcal. "
            "Available safe portion limits prevented a closer match.*"
        )

    # ── Protein gap warning ──────────────────────────────────────────────────
    _active_targets = plan.get("active_targets") or {}
    _prot_target = float(
        _active_targets.get("protein_g")
        or (metrics or {}).get("protein_target_g")
        or 0
    )
    if _prot_target > 0 and t["protein_g"] < _prot_target * 0.85:
        _gap = round(_prot_target - t["protein_g"], 1)
        _achievable = _feasibility.get("maximum_achievable_protein_g", t["protein_g"])
        lines.append(
            f"\n⚠️ *Protein gap: {t['protein_g']}g delivered vs {round(_prot_target)}g target "
            f"({_gap}g short). Among the {_evaluated or 'generated'} complete safe combinations "
            f"within the active macro guardrails, the maximum available was {_achievable}g. "
            "Ask a dietitian before increasing portions or changing the macro target.*"
        )

    _fat_coverage = t.get("fat_coverage_percent")
    if _fat_coverage is not None and _fat_coverage > 120:
        lines.append(
            f"\n⚠️ *Fat is {_fat_coverage}% of target. The generated options could not meet "
            "the stricter fat limit while preserving the other active constraints.*"
        )
    _carbs_coverage = t.get("carbs_coverage_percent")
    if _carbs_coverage is not None and not 80 <= _carbs_coverage <= 120:
        lines.append(
            f"\n⚠️ *Carbohydrates are {_carbs_coverage}% of target, outside the preferred "
            "80–120% range.*"
        )

    if _is_remaining_plan:
        lines.append(
            "\n*All values come from the food database. Option 1 across all remaining "
            "meals is the validated combination. Mixing options changes the remaining "
            "macros; ask me to recalculate your chosen combination.*"
        )
    else:
        lines.append(
            "\n*All values come from the food database. Option 1 across all four meals is "
            "the validated daily combination. Mixing options changes the daily macros; "
            "ask me to recalculate your chosen combination.*"
        )
    return "\n".join(lines)


# ── Weekly plan builder ───────────────────────────────────────────────────────

def build_weekly_meal_plan(
    target_calories: int,
    metrics: dict,
    state: UserDietState,
) -> dict:
    """Build a 7-day meal plan with cross-day variety."""
    week: dict = {}
    _week_used: set      = set()
    _week_sides_used: set = set()
    _week_family_counts: dict[str, int] = {}
    _week_food_counts: dict[str, int] = {}
    _previous_day_foods: set[str] = set()
    for i, day_name in enumerate(_DAYS_OF_WEEK, 1):
        day_metrics = dict(metrics)
        day_metrics["_weekly_mode"] = True
        day_metrics["_weekly_day_index"] = i
        day_metrics["_week_used"]       = _week_used
        day_metrics["_week_sides_used"] = _week_sides_used
        day_metrics["_week_family_counts"] = _week_family_counts
        day_metrics["_week_food_counts"] = _week_food_counts
        day_metrics["_previous_day_foods"] = _previous_day_foods
        day_plan = build_meal_plan(
            target_calories,
            day_metrics,
            state,
            save_as_current=False,
        )
        _day_slot_df = _food_df[["food_item", "dish_role"]] if not _food_df.empty else None
        for slot in ("Breakfast", "Lunch", "Dinner", "Snack"):
            s    = day_plan.get(slot, {})
            opts = s.get("options", [])
            if opts:
                for fd in opts[0].get("foods", []):
                    fname = fd["name"]
                    family = str(fd.get("food_family") or realism_canonical_name(fname))
                    exact = realism_canonical_name(fname)
                    _week_family_counts[family] = _week_family_counts.get(family, 0) + 1
                    _week_food_counts[exact] = _week_food_counts.get(exact, 0) + 1
                    if _day_slot_df is not None:
                        _rows = _day_slot_df[_day_slot_df["food_item"] == fname]
                        _role = _rows.iloc[0]["dish_role"] if not _rows.empty else "main"
                    else:
                        _role = "main"
                    if _role in ("main", "standalone"):
                        _week_used.add(fname)
                    elif _role == "side":
                        _week_sides_used.add(fname)
        week[f"Day {i}"] = day_plan
        _previous_day_foods = {
            realism_canonical_name(food.get("name", ""))
            for slot in ("Breakfast", "Lunch", "Dinner", "Snack")
            for option in day_plan.get(slot, {}).get("options", [])[:1]
            for food in option.get("foods", [])
        }
    week["_realism_audit"] = audit_weekly_plan(week)
    return week


def _slot_emoji(slot: str) -> str:
    return {"Breakfast": "🌅", "Lunch": "☀️ ", "Dinner": "🌙", "Snack": "🍎"}.get(slot, "🍽️")


def format_weekly_plan_response(weekly_plan: dict, conditions: list = None,
                                 goal: str = "", target_cal: int = 0,
                                 metrics: dict = None) -> str:
    conditions = conditions or []
    _wg = (goal or "").lower()
    _wgkey = ("lose" if any(w in _wg for w in ("lose","loss","cut")) else
              "gain" if any(w in _wg for w in ("gain","muscle","bulk")) else
              "maintain" if "maintain" in _wg else "")
    _wglabel = {"lose": "🔻 Weight Loss", "gain": "📈 Weight Gain",
               "maintain": "⚖️ Maintain Weight"}.get(_wgkey, "")
    _w_banner = []
    if _wglabel:   _w_banner.append(_wglabel)
    if target_cal: _w_banner.append(f"🔥 Target: {target_cal:,} kcal/day")
    lines = ["📅 **Your 7-Day Sri Lankan Meal Plan**"]
    lines[0:0] = _medication_guidance_lines(metrics)
    if _w_banner: lines.append("  |  ".join(_w_banner))
    lines += ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", ""]
    for i, day_name in enumerate(_DAYS_OF_WEEK, 1):
        day_key  = f"Day {i}"
        day_plan = weekly_plan.get(day_key, {})
        if not day_plan:
            continue
        lines.append(f"**{day_key} — {day_name}**")
        day_kcal = 0
        for slot in ("Breakfast", "Lunch", "Dinner", "Snack"):
            s    = day_plan.get(slot, {})
            opts = s.get("options", [])
            if not opts:
                continue
            opt1  = opts[0]
            _food_parts = []
            for f in opt1["foods"]:
                if f.get("selected_serving_g"):
                    _food_parts.append(f"{f['name']} ({f['selected_serving_g']}g)")
                elif f.get("min_serving_g") and f.get("max_serving_g"):
                    _food_parts.append(f"{f['name']} ({f['min_serving_g']}–{f['max_serving_g']}g)")
                elif f.get("serving_size_g"):
                    _food_parts.append(f"{f['name']} ({f['serving_size_g']}g)")
                else:
                    _food_parts.append(f["name"])
            foods    = ", ".join(_food_parts)
            kcal     = opt1.get("actual_kcal", 0)
            day_kcal += kcal
            lines.append(f"  {_slot_emoji(slot)} {slot}: {foods} ({kcal} kcal)")
        lines.append(f"  📊 *Daily total: ~{day_kcal} kcal*")
        lines.append("")
    # ── Weekly nutrition summary ─────────────────────────────────────────────
    _w_kcal = _w_prot = _w_carbs = _w_fat = 0.0
    _w_days = 0
    for i in range(1, 8):
        _t = weekly_plan.get(f"Day {i}", {}).get("totals", {})
        if _t:
            _w_kcal  += _t.get("actual_kcal", 0)
            _w_prot  += _t.get("protein_g", 0)
            _w_carbs += _t.get("carbs_g", 0)
            _w_fat   += _t.get("fat_g", 0)
            _w_days  += 1
    if _w_days > 0:
        _avg_kcal  = round(_w_kcal  / _w_days)
        _avg_prot  = round(_w_prot  / _w_days, 1)
        _avg_carbs = round(_w_carbs / _w_days, 1)
        _avg_fat   = round(_w_fat   / _w_days, 1)
        lines.append("─────────────────────────────────────────")
        lines.append("📊 **Weekly Nutrition Summary (Option 1 averages)**")
        lines.append(f"Avg Daily Calories : {_avg_kcal} kcal" +
                     (f"  *(target {target_cal:,} kcal)*" if target_cal else ""))
        lines.append(f"Avg Protein        : {_avg_prot}g/day")
        lines.append(f"Avg Carbohydrates  : {_avg_carbs}g/day")
        lines.append(f"Avg Fat            : {_avg_fat}g/day")
        if target_cal:
            _diff  = _avg_kcal - target_cal
            _sign  = "+" if _diff > 0 else ""
            _color = "⚠️" if abs(_diff) > 200 else "✅"
            lines.append(f"{_color} Calorie deviation : {_sign}{_diff} kcal/day vs target")

    _audit = weekly_plan.get("_realism_audit") or {}
    if _audit:
        lines.append("")
        lines.append("🧭 **Weekly Plan Validation**")
        lines.append(
            "✅ Nutrition balance, practical portions, and repetition limits passed."
            if _audit.get("passed")
            else "⚠️ Some nutrition or practicality constraints could not be fully satisfied."
        )
        _groups = _audit.get("food_group_servings") or {}
        lines.append(
            "Food-group servings selected: "
            f"fruit {_groups.get('fruit', 0)} · "
            f"vegetables {_groups.get('vegetable', 0) + _groups.get('leafy_vegetable', 0)} · "
            f"pulses {_groups.get('plant_protein', 0)} · "
            f"dairy {_groups.get('dairy', 0)} · "
            f"nuts/seeds {_groups.get('nuts_or_seeds', 0)}"
        )
        _issues = (
            list(_audit.get("daily_violations") or [])
            + list(_audit.get("weekly_group_violations") or [])
            + list(_audit.get("macro_violations") or [])
        )
        for issue in _issues[:5]:
            lines.append(f"- ⚠️ {issue}")

    lines.append("─────────────────────────────────────────")
    lines.append("💡 *Say **\"Day 3 details\"** or **\"Wednesday plan\"** to see all options + full nutrition for any day.*")
    lines.append("💡 *Say **\"new weekly plan\"** to regenerate with fresh variety.*")
    return "\n".join(lines)


def format_week_day_detail(day_key: str, day_plan: dict, conditions: list = None,
                           metrics: dict = None) -> str:
    conditions = conditions or []
    try:
        day_num  = int(day_key.split()[-1]) - 1
        day_name = _DAYS_OF_WEEK[day_num] if 0 <= day_num < 7 else ""
    except (ValueError, IndexError):
        day_name = ""
    header = f"📅 **{day_key}" + (f" — {day_name}" if day_name else "") + "**\n"
    return header + format_meal_plan_response(
        day_plan, conditions=conditions, metrics=metrics
    )


def detect_week_day_query(message: str, weekly_plan: dict):
    """Return 'Day N' if message asks for a specific day's detail, else None."""
    if not weekly_plan:
        return None
    msg = message.lower().strip()
    m = _re.search(r"\bday\s*([1-7])\b", msg)
    if m:
        return f"Day {m.group(1)}"
    for i, name in enumerate(_DAYS_OF_WEEK, 1):
        if name.lower() in msg:
            return f"Day {i}"
    return None


# ── Weight-change goal calculator ─────────────────────────────────────────────

def detect_weight_change_goal(message: str, metrics: dict) -> str:
    """
    Detect 'gain/lose X kg in Y weeks' and return pre-calculated calorie target
    so the LLM doesn't have to do the math.
    """
    msg = message.lower()
    pattern = (
        r'(gain|lose)\s+'
        r'(\d+(?:\.\d+)?)\s*(kg|g|lbs?|pounds?)'
        r'.*?'
        r'(?:in|within|over|by)\s+'
        r'(\d+(?:\.\d+)?)\s*(days?|weeks?|months?|years?)'
    )
    match = _re.search(pattern, msg)
    if not match:
        return ""

    direction   = match.group(1)
    weight_val  = float(match.group(2))
    weight_unit = match.group(3)
    time_val    = float(match.group(4))
    time_unit   = match.group(5)

    # Normalise weight → kg
    if weight_unit.startswith("g") and not weight_unit.startswith("ga"):
        kg = weight_val / 1000
    elif weight_unit.startswith("lb") or weight_unit.startswith("pound"):
        kg = weight_val * 0.453592
    else:
        kg = weight_val

    # Normalise time → days
    if time_unit.startswith("day"):
        days = int(time_val)
    elif time_unit.startswith("week"):
        days = int(time_val * 7)
    elif time_unit.startswith("month"):
        days = int(time_val * 30)
    elif time_unit.startswith("year"):
        days = int(time_val * 365)
    else:
        days = int(time_val * 7)

    weeks = round(days / 7, 1)
    daily_adjustment = round((kg * 7700) / days)
    maintenance      = int(metrics.get("maintenance_calories") or 2000)

    if direction == "gain":
        new_target = maintenance + daily_adjustment
        label = f"+{daily_adjustment} cal/day surplus"
    else:
        new_target = maintenance - daily_adjustment
        label = f"-{daily_adjustment} cal/day deficit"

    SAFE_SURPLUS_MAX = 500
    SAFE_DEFICIT_MAX = 1000
    MIN_CALORIES     = 1200

    if direction == "gain" and daily_adjustment > SAFE_SURPLUS_MAX:
        safe_days  = round((kg * 7700) / SAFE_SURPLUS_MAX)
        safe_weeks = round(safe_days / 7, 1)
        feasible = "no"
        safe_timeline = f"{safe_days} days ({safe_weeks} weeks)"
    elif direction == "lose" and (daily_adjustment > SAFE_DEFICIT_MAX or new_target < MIN_CALORIES):
        safe_days  = round((kg * 7700) / SAFE_DEFICIT_MAX)
        safe_weeks = round(safe_days / 7, 1)
        feasible = "no"
        safe_timeline = f"{safe_days} days ({safe_weeks} weeks)"
    else:
        feasible = "yes"
        safe_timeline = ""

    kg_display = round(kg, 3)
    return (
        f"[Pre-calculated Goal — USE THESE EXACT NUMBERS, DO NOT RECALCULATE]\n"
        f"Goal: {direction} {kg_display} kg in {days} days ({weeks} weeks)\n"
        f"Required daily calorie adjustment: {label}\n"
        f"Maintenance calories: {maintenance} cal/day\n"
        f"New daily calorie target: {new_target} cal/day\n"
        f"Formula used: {kg_display} kg × 7,700 kcal ÷ {days} days = {daily_adjustment} cal/day\n"
        f"Feasible: {feasible}\n"
        f"Safe timeline: {safe_timeline}"
    )
