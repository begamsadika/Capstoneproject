import re
import unittest

import pandas as pd

from food_db import (
    _food_df,
    apply_allergy_filter,
    apply_medical_condition_filter,
    canonical_food_key,
    get_meal_slotted_foods,
    medical_food_reasons,
    parse_medical_conditions,
    parse_allergy_string,
    rank_foods_for_medical_profile,
)
from meal_logger import UserDietState
from meal_planner import build_meal_plan, format_meal_plan_response


class ConditionAwareFoodTests(unittest.TestCase):
    def setUp(self):
        self.foods = pd.DataFrame(
            [
                {
                    "food_item": "Low GI Bowl",
                    "calories": 180,
                    "protein_g": 8,
                    "fiber_g": 6,
                    "gi_category": "low",
                    "sodium_category": "low",
                    "prep_method": "boiled",
                    "cal_per_100g": 120,
                },
                {
                    "food_item": "Medium GI Bowl",
                    "calories": 220,
                    "protein_g": 6,
                    "fiber_g": 3,
                    "gi_category": "medium",
                    "sodium_category": "medium",
                    "prep_method": "steamed",
                    "cal_per_100g": 160,
                },
                {
                    "food_item": "High GI Salty Food",
                    "calories": 420,
                    "protein_g": 3,
                    "fiber_g": 1,
                    "gi_category": "high",
                    "sodium_category": "high",
                    "prep_method": "deep_fried",
                    "cal_per_100g": 400,
                },
                {
                    "food_item": "Energy Dense Low GI Food",
                    "calories": 380,
                    "protein_g": 14,
                    "fiber_g": 5,
                    "gi_category": "low",
                    "sodium_category": "low",
                    "prep_method": "baked",
                    "cal_per_100g": 260,
                },
            ]
        )

    def test_backend_medical_conditions_key_is_parsed(self):
        conditions = parse_medical_conditions(
            {"medical_conditions": "Diabetes, Hypertension"}
        )
        self.assertEqual(conditions, ["diabetes", "hypertension"])

    def test_diabetes_and_hypertension_remove_high_gi_and_sodium(self):
        result = apply_medical_condition_filter(
            self.foods,
            {"medical_conditions": "Diabetes, Hypertension"},
        )

        self.assertNotIn("High GI Salty Food", result["food_item"].tolist())
        self.assertTrue(result["gi_category"].isin(["low", "medium"]).all())
        self.assertTrue(result["sodium_category"].isin(["low", "medium"]).all())

    def test_diabetes_weight_gain_keeps_condition_rules_dominant(self):
        metrics = {
            "medical_conditions": "Diabetes",
            "health_goal": "Gain weight",
        }
        filtered = apply_medical_condition_filter(self.foods, metrics)
        ranked = rank_foods_for_medical_profile(filtered, metrics).sort_values(
            "_medical_score", ascending=False
        )

        self.assertNotIn("High GI Salty Food", ranked["food_item"].tolist())
        self.assertEqual(ranked.iloc[0]["food_item"], "Energy Dense Low GI Food")

    def test_high_cholesterol_uses_heart_healthy_sodium_and_frying_rules(self):
        result = apply_medical_condition_filter(
            self.foods,
            {"medical_conditions": "High cholesterol"},
        )

        self.assertNotIn("High GI Salty Food", result["food_item"].tolist())
        self.assertTrue(result["sodium_category"].isin(["low", "medium"]).all())
        self.assertFalse((result["prep_method"] == "deep_fried").any())

    def test_profile_fit_reason_explains_condition_ranking(self):
        row = self.foods.iloc[0]
        reasons = medical_food_reasons(
            row,
            {"medical_conditions": "Diabetes, Hypertension"},
        )

        self.assertIn("low GI", reasons)
        self.assertIn("low sodium", reasons)

    def test_real_suitable_food_list_respects_both_conditions(self):
        metrics = {
            "medical_conditions": "Diabetes, Hypertension",
            "health_goal": "Gain weight",
            "dietary_preference": "Veg",
            "allergies": "Nuts",
            "target_calories": 2200,
        }
        answer = get_meal_slotted_foods(metrics)
        names = [
            name.strip()
            for name in re.findall(
                r"([^,\n:]+?) \(\d+(?:\.\d+)? cal\)",
                answer,
            )
        ]
        selected = _food_df[_food_df["food_item"].isin(names)]

        self.assertTrue(names)
        self.assertTrue(selected["gi_category"].isin(["low", "medium"]).all())
        self.assertTrue(selected["sodium_category"].isin(["low", "medium"]).all())
        self.assertRegex(
            answer,
            r"\[(?:low|medium) GI; (?:low|medium) sodium",
        )

    def test_full_meal_plan_uses_saved_medical_conditions(self):
        metrics = {
            "medical_conditions": "Diabetes, Hypertension",
            "health_goal": "Gain weight",
            "dietary_preference": "Veg",
            "allergies": "Nuts",
            "protein_target_g": 100,
        }
        plan = build_meal_plan(
            2200,
            metrics,
            UserDietState(user_id=987654),
            save_as_current=False,
        )
        foods = [
            food
            for slot in ("Breakfast", "Lunch", "Dinner", "Snack")
            for option in plan[slot]["options"]
            for food in option["foods"]
        ]
        self.assertTrue(foods)
        self.assertTrue(all(food["gi_category"] in {"low", "medium"} for food in foods))
        self.assertTrue(all(food["sodium_category"] in {"low", "medium"} for food in foods))
        self.assertTrue(all(food["profile_reasons"] for food in foods))

    def test_high_calorie_plan_is_optimized_within_targets_and_portion_bounds(self):
        metrics = {
            "health_goal": "Gain weight",
            "dietary_preference": "Eat anything",
            "allergies": "tomato, sea food",
            "medications": "Levothyroxine",
            "protein_target_g": 178.9,
            "carbs_target_g": 298.1,
            "fat_target_g": 53.0,
        }
        plan = build_meal_plan(
            2385,
            metrics,
            UserDietState(user_id=987655),
            save_as_current=False,
        )
        allergy_safe_names = set(
            apply_allergy_filter(
                _food_df,
                parse_allergy_string(metrics["allergies"]),
            )["food_item"]
        )

        self.assertTrue(plan["totals"]["calorie_within_5_percent"])
        # Practical serving increments and removal of sub-25 g calorie fillers
        # can make this unusually high-protein/low-fat target infeasible. The
        # response exposes the gap instead of inventing an unsafe portion.
        self.assertGreaterEqual(plan["totals"]["protein_coverage_percent"], 45)
        self.assertGreaterEqual(plan["totals"]["carbs_coverage_percent"], 80)
        self.assertLessEqual(plan["totals"]["carbs_coverage_percent"], 130)
        self.assertGreaterEqual(plan["totals"]["fat_coverage_percent"], 80)
        self.assertLessEqual(plan["totals"]["fat_coverage_percent"], 150)
        self.assertEqual(plan["feasibility"]["evaluated_combinations"], 81)
        self.assertIn(
            plan["feasibility"]["guardrail_status"],
            {"strict", "relaxed", "best_effort"},
        )
        self.assertEqual(
            plan["totals"]["protein_g"],
            plan["feasibility"]["maximum_achievable_protein_g"],
        )

        for slot in ("Breakfast", "Lunch", "Dinner", "Snack"):
            target = plan[slot]["target_kcal"]
            signatures = []
            food_counts = {}
            for option in plan[slot]["options"]:
                signature = frozenset(
                    canonical_food_key(food["name"])
                    for food in option["foods"]
                )
                signatures.append(signature)
                # Whole practical portions can move an individual meal a little
                # farther from its slot target while the full day stays within 5%.
                self.assertLessEqual(abs(option["actual_kcal"] - target), target * 0.10)
                for food in option["foods"]:
                    key = canonical_food_key(food["name"])
                    food_counts[key] = food_counts.get(key, 0) + 1
                    self.assertIn(food["name"], allergy_safe_names)
                    self.assertIn("selected_serving_g", food)
                    if food["min_serving_g"]:
                        self.assertGreaterEqual(food["selected_serving_g"], food["min_serving_g"])
                    if food["max_serving_g"]:
                        self.assertLessEqual(food["selected_serving_g"], food["max_serving_g"])
            self.assertEqual(len(signatures), len(set(signatures)))
            self.assertTrue(all(count <= 2 for count in food_counts.values()))

        lunch_first = {
            canonical_food_key(food["name"])
            for food in plan["Lunch"]["options"][0]["foods"]
        }
        dinner_first = {
            canonical_food_key(food["name"])
            for food in plan["Dinner"]["options"][0]["foods"]
        }
        self.assertLessEqual(len(lunch_first & dinner_first), 2)

        answer = format_meal_plan_response(
            plan,
            goal="Gain weight",
            target_cal=2385,
            metrics=metrics,
        )
        self.assertIn("evaluated all 81 safe full-day combinations", answer)
        self.assertIn("maximum available", answer)
        self.assertNotIn("closest safe database combination", answer)
        self.assertIn("Option 1 across all four meals is the validated daily combination", answer)
        self.assertNotIn("Mix and match options", answer)


if __name__ == "__main__":
    unittest.main()
