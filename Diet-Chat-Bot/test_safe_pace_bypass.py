import unittest

from bypass_handlers import detect_ideal_weight_query, detect_safe_timeline_query


class SafePaceBypassTests(unittest.TestCase):
    def setUp(self):
        self.metrics = {
            "health_goal": "gain",
            "weight_to_goal_kg": 30.4,
            "estimated_weeks_to_goal": 61,
            "maintenance_calories": 1885,
            "target_calories": 2385,
            "bmi": 12.1,
        }

    def test_safe_pace_follow_up_uses_profile_without_llm(self):
        answer = detect_safe_timeline_query(
            "What is means by At a safe pace?",
            self.metrics,
        )

        self.assertIn("0.5 kg per week", answer)
        self.assertIn("30.4 kg", answer)
        self.assertIn("**61 weeks**", answer)
        self.assertIn("500 kcal/day surplus", answer)
        self.assertIn("recorded BMI is very low", answer)

    def test_safe_rate_wording_is_supported(self):
        answer = detect_safe_timeline_query(
            "What does safe rate mean?",
            self.metrics,
        )

        self.assertIn("weight gain", answer)
        self.assertIn("2385 kcal/day", answer)

    def test_unrelated_safe_question_is_not_intercepted(self):
        answer = detect_safe_timeline_query(
            "Is this food safe to eat?",
            self.metrics,
        )

        self.assertEqual("", answer)

    def test_correct_time_period_for_specific_gain_uses_requested_weight(self):
        answer = detect_safe_timeline_query(
            "What is the correct time period to gain 20 kg?",
            self.metrics,
        )

        self.assertIn("gain 20.0 kg safely", answer)
        self.assertIn("~308 days (44.0 weeks)", answer)
        self.assertIn("2385 cal/day", answer)

    def test_timeline_question_is_not_captured_by_ideal_weight_handler(self):
        ideal_metrics = {
            **self.metrics,
            "height_cm": 165,
            "weight_kg": 33,
            "ideal_weight_kg": 63.4,
            "bmi_category": "Underweight",
        }

        answer = detect_ideal_weight_query(
            "What is the correct time period to gain 20 kg?",
            ideal_metrics,
        )

        self.assertEqual("", answer)


if __name__ == "__main__":
    unittest.main()
