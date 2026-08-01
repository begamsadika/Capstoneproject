import unittest

from bypass_handlers import detect_ideal_weight_query


class IdealWeightExplanationTests(unittest.TestCase):
    def setUp(self):
        self.metrics = {
            "height_cm": 165.0,
            "weight_kg": 33.0,
            "bmi": 12.1,
            "bmi_category": "Underweight",
            "ideal_weight_kg": 63.4,
            "weight_to_goal_kg": -30.4,
            "estimated_weeks_to_goal": 61,
        }

    def test_direct_question_returns_ideal_weight_result(self):
        answer = detect_ideal_weight_query(
            "What is the correct weight for my height?",
            self.metrics,
        )

        self.assertIn("ideal weight is 63.4 kg", answer)
        self.assertIn("Healthy weight range", answer)

    def test_explanation_question_does_not_repeat_the_direct_result(self):
        answer = detect_ideal_weight_query(
            "Why is that considered a healthy weight?",
            self.metrics,
        )

        self.assertIn("BMI-based healthy range", answer)
        self.assertIn("18.5", answer)
        self.assertIn("24.9", answer)
        self.assertIn("50.4 kg", answer)
        self.assertIn("67.8 kg", answer)
        self.assertIn("BMI of approximately **23.3**", answer)
        self.assertNotIn("You need to **gain", answer)

    def test_unrelated_why_question_is_not_intercepted(self):
        answer = detect_ideal_weight_query(
            "Why is protein important for muscle growth?",
            self.metrics,
        )

        self.assertEqual("", answer)


if __name__ == "__main__":
    unittest.main()
