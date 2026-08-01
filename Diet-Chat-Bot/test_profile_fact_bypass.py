import unittest

from bypass_handlers import detect_bmi_faq_query, detect_profile_fact_query


class ProfileFactBypassTests(unittest.TestCase):
    def setUp(self):
        self.metrics = {
            "weight_kg": 33.0,
            "height_cm": 165.0,
            "bmi": 12.1,
            "bmi_category": "Underweight",
        }

    def test_current_bmi_uses_saved_profile(self):
        answer = detect_profile_fact_query("what is my current bmi", self.metrics)
        self.assertIn("**12.1 (Underweight)**", answer)
        self.assertIn("33 kg", answer)
        self.assertIn("1.65 m", answer)

    def test_current_weight_uses_saved_profile(self):
        answer = detect_profile_fact_query("What is my current body weight?", self.metrics)
        self.assertIn("**33 kg**", answer)
        self.assertIn("BMI is **12.1**", answer)

    def test_height_uses_saved_profile(self):
        answer = detect_profile_fact_query("How tall am I?", self.metrics)
        self.assertEqual("Your recorded height is **165 cm**.", answer)

    def test_recommended_bmi_question_is_not_intercepted(self):
        answer = detect_profile_fact_query("What should my BMI be?", self.metrics)
        self.assertEqual("", answer)

    def test_generic_bmi_calculation_question_is_not_intercepted(self):
        answer = detect_profile_fact_query("How is BMI calculated?", self.metrics)
        self.assertEqual("", answer)

    def test_general_bmi_question_does_not_return_personal_value(self):
        answer = detect_profile_fact_query("What is BMI?", self.metrics)
        self.assertEqual("", answer)

    def test_general_bmi_question_gets_educational_answer(self):
        answer = detect_bmi_faq_query("What is BMI?")
        self.assertIn("Body Mass Index", answer)
        self.assertIn("weight in kilograms ÷ height in metres²", answer)
        self.assertIn("screening tool, not a diagnosis", answer)
        self.assertNotIn("12.1", answer)

    def test_bmi_calculation_question_gets_educational_answer(self):
        answer = detect_bmi_faq_query("How is BMI calculated?")
        self.assertIn("Formula", answer)

    def test_missing_profile_value_gets_immediate_guidance(self):
        answer = detect_profile_fact_query("What is my BMI?", {})
        self.assertIn("profile is incomplete", answer)


if __name__ == "__main__":
    unittest.main()
