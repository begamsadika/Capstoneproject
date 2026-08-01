import unittest

from bypass_handlers import detect_goal_calorie_query


class ProfileCalorieBypassTests(unittest.TestCase):
    def setUp(self):
        self.metrics = {
            "maintenance_calories": 1885,
            "target_calories": 2385,
            "bmr": 1216.1,
            "activity_level": "moderate",
            "health_goal": "gain",
            "ideal_weight_kg": 62.0,
            "weight_to_goal_kg": 30.4,
            "calorie_deficit_surplus": 500,
        }

    def test_personal_maintenance_calorie_question_uses_profile(self):
        answer = detect_goal_calorie_query(
            "What is my maintenance calorie?",
            self.metrics,
        )

        self.assertIn("**1,885 kcal/day**", answer)
        self.assertIn("**2,385 kcal/day**", answer)
        self.assertIn("**500 kcal/day surplus**", answer)
        self.assertIn("weight gain", answer)

    def test_personal_tdee_alias_uses_profile(self):
        answer = detect_goal_calorie_query("What is my TDEE?", self.metrics)

        self.assertIn("maintenance calories", answer)
        self.assertIn("1,885", answer)

    def test_weight_loss_target_is_described_as_deficit(self):
        metrics = {
            **self.metrics,
            "target_calories": 1653,
            "maintenance_calories": 2153,
            "health_goal": "lose_weight",
        }

        answer = detect_goal_calorie_query("How many calories do I need to maintain?", metrics)

        self.assertIn("**500 kcal/day deficit**", answer)
        self.assertIn("weight loss", answer)

    def test_incomplete_profile_gets_immediate_guidance(self):
        answer = detect_goal_calorie_query(
            "What are my maintenance calories?",
            {"target_calories": 2000},
        )

        self.assertIn("profile is incomplete", answer)

    def test_generic_maintenance_explanation_is_not_intercepted(self):
        answer = detect_goal_calorie_query(
            "How are maintenance calories calculated?",
            self.metrics,
        )

        self.assertEqual("", answer)

    def test_personal_maintenance_calculation_is_explained_immediately(self):
        answer = detect_goal_calorie_query(
            "How are my maintenance calories calculated?",
            self.metrics,
        )

        self.assertIn("Mifflin–St Jeor", answer)
        self.assertIn("**1,216.1 kcal/day**", answer)
        self.assertIn("× 1.55 (Moderate)", answer)
        self.assertIn("**1,885 kcal/day**", answer)
        self.assertIn("**500 kcal/day surplus**", answer)
        self.assertIn("**2,385 kcal/day**", answer)

    def test_ambiguous_calculation_follow_up_uses_recent_assistant_context(self):
        history = [{
            "role": "assistant",
            "content": "Your estimated maintenance calories are 1,885 kcal/day.",
        }]

        answer = detect_goal_calorie_query(
            "How are they calculated?",
            self.metrics,
            history,
        )

        self.assertIn("Mifflin–St Jeor", answer)
        self.assertIn("**1,885 kcal/day**", answer)

    def test_ambiguous_calculation_without_context_goes_to_llm(self):
        answer = detect_goal_calorie_query(
            "How are they calculated?",
            self.metrics,
            [],
        )

        self.assertEqual("", answer)

    def test_food_calorie_question_is_not_intercepted(self):
        answer = detect_goal_calorie_query(
            "How many calories are in rice?",
            self.metrics,
        )

        self.assertEqual("", answer)


if __name__ == "__main__":
    unittest.main()
