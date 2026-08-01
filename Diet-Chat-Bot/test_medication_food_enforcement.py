import unittest

import pandas as pd

from medication_rules import (
    apply_medication_food_filter,
    medication_food_notes,
    medication_guidance,
    parse_medications,
    resolve_active_medications,
)


class MedicationFoodEnforcementTests(unittest.TestCase):
    def setUp(self):
        self.foods = pd.DataFrame(
            [
                {
                    "food_item": "Grapefruit Juice",
                    "main_ingredients": "grapefruit, water",
                    "category": "Beverages",
                    "allergens": "none",
                    "nutrition_notes": "fresh citrus drink",
                },
                {
                    "food_item": "Spinach Curry",
                    "main_ingredients": "spinach, coconut milk, spices",
                    "category": "Curries",
                    "allergens": "none",
                    "nutrition_notes": "leafy green curry",
                },
                {
                    "food_item": "Soya Biryani",
                    "main_ingredients": "rice, soya, vegetables",
                    "category": "Rice Dishes",
                    "allergens": "soy",
                    "nutrition_notes": "soy protein meal",
                },
                {
                    "food_item": "Lentil Rice",
                    "main_ingredients": "rice, lentils, spices",
                    "category": "Rice Dishes",
                    "allergens": "none",
                    "nutrition_notes": "balanced meal",
                },
            ]
        )

    def test_brand_and_dose_are_normalized(self):
        medications = parse_medications(
            {"medications": "Zocor 20 mg, Eltroxin 50 mcg, Metformin 500mg"}
        )

        self.assertEqual(
            medications,
            ["Simvastatin", "Levothyroxine", "Metformin"],
        )

    def test_simvastatin_hard_excludes_grapefruit(self):
        result = apply_medication_food_filter(
            self.foods,
            {"medications": "Simvastatin"},
        )

        self.assertNotIn("Grapefruit Juice", result["food_item"].tolist())
        self.assertIn("Lentil Rice", result["food_item"].tolist())

    def test_atorvastatin_is_limit_not_blanket_exclusion(self):
        metrics = {"medications": "Atorvastatin"}
        result = apply_medication_food_filter(self.foods, metrics)
        grapefruit = result[result["food_item"] == "Grapefruit Juice"].iloc[0]

        self.assertIn("Grapefruit Juice", result["food_item"].tolist())
        self.assertIn(
            "Atorvastatin: limit/caution",
            medication_food_notes(grapefruit, metrics),
        )

    def test_warfarin_keeps_leafy_greens_with_consistency_note(self):
        metrics = {"medications": "Warfarin"}
        result = apply_medication_food_filter(self.foods, metrics)
        spinach = result[result["food_item"] == "Spinach Curry"].iloc[0]

        self.assertIn("Spinach Curry", result["food_item"].tolist())
        self.assertIn(
            "Warfarin: keep intake consistent",
            medication_food_notes(spinach, metrics),
        )

    def test_levothyroxine_keeps_soy_with_timing_note(self):
        metrics = {"medications": "Levothyroxine"}
        result = apply_medication_food_filter(self.foods, metrics)
        soya = result[result["food_item"] == "Soya Biryani"].iloc[0]

        self.assertIn("Soya Biryani", result["food_item"].tolist())
        self.assertIn(
            "Levothyroxine: separate from dose as prescribed",
            medication_food_notes(soya, metrics),
        )

    def test_unknown_medication_is_not_automatically_enforced(self):
        metrics = {"medications": "Examplemed 10mg"}
        result = apply_medication_food_filter(self.foods, metrics)
        guidance = medication_guidance(metrics)[0]

        self.assertEqual(len(result), len(self.foods))
        self.assertFalse(guidance["verified"])
        self.assertEqual(guidance["excluded_terms"], [])

    def test_multiple_medications_combine_without_converting_notes_to_bans(self):
        metrics = {"medications": "Simvastatin, Warfarin, Levothyroxine"}
        result = apply_medication_food_filter(self.foods, metrics)

        self.assertNotIn("Grapefruit Juice", result["food_item"].tolist())
        self.assertIn("Spinach Curry", result["food_item"].tolist())
        self.assertIn("Soya Biryani", result["food_item"].tolist())

    def test_current_personal_medication_is_available_to_early_bypasses(self):
        medications = resolve_active_medications(
            {},
            "Give me a meal plan while taking levothyroxine.",
        )

        self.assertEqual(medications, ["Levothyroxine"])

    def test_recent_user_medication_carries_to_follow_up(self):
        history = [
            {"role": "user", "content": "Give me a meal plan while taking Eltroxin."},
            {"role": "assistant", "content": "Here is your meal plan."},
        ]

        medications = resolve_active_medications(
            {},
            "Foods suitable for my medications.",
            history,
        )

        self.assertEqual(medications, ["Levothyroxine"])

    def test_current_medication_replaces_older_chat_medication(self):
        history = [
            {"role": "user", "content": "Can I eat leafy greens while taking warfarin?"},
            {"role": "assistant", "content": "Keep vitamin K intake consistent."},
        ]

        medications = resolve_active_medications(
            {},
            "Give me a meal plan while taking levothyroxine.",
            history,
        )

        self.assertEqual(medications, ["Levothyroxine"])

    def test_follow_up_uses_only_most_recent_chat_medication(self):
        history = [
            {"role": "user", "content": "Can I eat leafy greens while taking warfarin?"},
            {"role": "assistant", "content": "Keep vitamin K intake consistent."},
            {"role": "user", "content": "Give me a meal plan while taking levothyroxine."},
            {"role": "assistant", "content": "Here is your plan."},
        ]

        medications = resolve_active_medications(
            {},
            "Foods suitable for my medications.",
            history,
        )

        self.assertEqual(medications, ["Levothyroxine"])

    def test_saved_profile_medication_is_not_removed_by_current_context(self):
        medications = resolve_active_medications(
            {"medications": "Warfarin"},
            "Give me a meal plan while taking levothyroxine.",
        )

        self.assertEqual(medications, ["Warfarin", "Levothyroxine"])

    def test_colon_style_personal_medication_statement_is_recognized(self):
        medications = resolve_active_medications(
            {},
            "My medication: levothyroxine",
        )

        self.assertEqual(medications, ["Levothyroxine"])

    def test_assistant_medication_claim_is_not_promoted_to_user_fact(self):
        history = [
            {"role": "assistant", "content": "You are taking levothyroxine."},
        ]

        medications = resolve_active_medications(
            {},
            "Foods suitable for my medications.",
            history,
        )

        self.assertEqual(medications, [])

    def test_educational_question_is_not_carried_as_personal_medication(self):
        history = [
            {"role": "user", "content": "What is levothyroxine?"},
        ]

        medications = resolve_active_medications(
            {},
            "Give me a meal plan.",
            history,
        )

        self.assertEqual(medications, [])


if __name__ == "__main__":
    unittest.main()
