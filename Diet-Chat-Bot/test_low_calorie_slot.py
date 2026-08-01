import re
import unittest

from bypass_handlers import detect_low_calorie_slot_query


class LowCalorieSlotTests(unittest.TestCase):
    def setUp(self):
        self.metrics = {
            "health_goal": "gain",
            "target_calories": 2385,
            "dietary_preference": "eat anything",
            "allergies": "tomato, seafood",
            "medical_conditions": "",
            "medications": "",
        }

    def test_returns_individual_low_calorie_snacks_not_slot_plan(self):
        answer = detect_low_calorie_slot_query(
            "Low calorie snack options",
            self.metrics,
        )
        self.assertIn("Low-Calorie Snack Options", answer)
        self.assertNotIn("~238 kcal", answer)
        self.assertNotIn("Option 1", answer)
        self.assertNotIn("energy-dense for weight gain", answer)
        calories = [int(value) for value in re.findall(r"— (\d+) kcal", answer)]
        self.assertEqual(len(calories), 5)
        self.assertEqual(calories, sorted(calories))
        self.assertLessEqual(max(calories), 100)

    def test_non_low_calorie_slot_request_uses_existing_route(self):
        self.assertEqual(
            detect_low_calorie_slot_query("Snack options", self.metrics),
            "",
        )


if __name__ == "__main__":
    unittest.main()

