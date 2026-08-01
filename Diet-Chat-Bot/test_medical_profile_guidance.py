import unittest

from bypass_handlers import (
    detect_profile_condition_food_query,
    format_profile_medical_food_guidance,
)
from kg_queries import retrieve_condition_foods


class MedicalProfileGuidanceTests(unittest.TestCase):
    def test_common_conditions_never_return_empty_guidance(self):
        for condition in ("diabetes", "hypertension"):
            recommended, avoid = retrieve_condition_foods(condition)
            self.assertTrue(recommended)
            self.assertTrue(avoid)

    def test_profile_question_includes_conditions_and_profile_restrictions(self):
        answer = format_profile_medical_food_guidance(
            ["diabetes", "hypertension"],
            [],
            {
                "dietary_preference": "Veg",
                "allergies": "Nuts",
            },
        )

        self.assertIn("Diabetes — Dietary Guidance", answer)
        self.assertIn("Hypertension — Dietary Guidance", answer)
        self.assertIn("Avoid or limit", answer)
        self.assertIn("Better choices", answer)
        self.assertIn("Nuts and nut-containing foods", answer)
        self.assertIn("Meat, poultry, and seafood", answer)
        self.assertIn("Condition-aware suitable foods", answer)
        self.assertRegex(answer, r"\[(?:low|medium) GI; (?:low|medium) sodium")

    def test_exact_dashboard_prompt_uses_saved_conditions(self):
        answer = detect_profile_condition_food_query(
            "Foods to avoid for my condition",
            {
                "medical_conditions": "Diabetes, Hypertension",
                "medications": "",
                "dietary_preference": "Veg",
                "allergies": "Nuts",
            },
        )

        self.assertIsNotNone(answer)
        self.assertIn("Diabetes — Dietary Guidance", answer)
        self.assertIn("Hypertension — Dietary Guidance", answer)
        self.assertNotEqual(
            answer.strip(),
            "**Diabetes — Dietary Guidance**\n\n**Hypertension — Dietary Guidance**",
        )

    def test_unknown_saved_condition_is_not_reported_as_missing(self):
        answer = detect_profile_condition_food_query(
            "Foods to avoid for my condition",
            {
                "medical_conditions": "Chronic kidney disease",
                "medications": "",
                "dietary_preference": "Veg",
                "allergies": "",
            },
        )

        self.assertIn("Chronic Kidney Disease", answer)
        self.assertIn("not yet available in the knowledge base", answer)

    def test_warfarin_response_uses_consistency_not_leafy_green_ban(self):
        answer = format_profile_medical_food_guidance(
            [],
            ["Warfarin"],
            {
                "medical_conditions": "",
                "medications": "Warfarin",
                "dietary_preference": "Veg",
                "allergies": "",
            },
        )

        self.assertIn("Consistency", answer)
        self.assertIn("Keep vitamin K intake consistent", answer)
        self.assertNotIn("Automatically excluded from recommendations: spinach", answer)

    def test_simvastatin_response_reports_grapefruit_exclusion(self):
        answer = format_profile_medical_food_guidance(
            [],
            ["Simvastatin"],
            {
                "medical_conditions": "",
                "medications": "Simvastatin",
                "dietary_preference": "Eat anything",
                "allergies": "",
            },
        )

        self.assertIn("Automatically excluded from recommendations", answer)
        self.assertIn("grapefruit", answer.lower())


if __name__ == "__main__":
    unittest.main()
