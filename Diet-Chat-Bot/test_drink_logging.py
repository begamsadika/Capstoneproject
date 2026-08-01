import unittest

from meal_logger import (
    UserDietState,
    detect_log_request,
    fuzzy_match_food,
    get_daily_progress,
    log_food,
)


class DrinkLoggingTests(unittest.TestCase):
    def test_trailing_period_does_not_hide_meal_slot(self):
        item, slot = detect_log_request("I ate a boiled egg for breakfast.")
        self.assertEqual(slot, "Breakfast")
        self.assertEqual(fuzzy_match_food(item), "Boiled Egg")

    def test_drink_statement_is_a_deterministic_log_request(self):
        item, slot = detect_log_request("I drink hot chocolate")
        self.assertIsNone(slot)
        self.assertIsNone(fuzzy_match_food(item))

    def test_known_drink_matches_food_database(self):
        item, slot = detect_log_request("I drank king coconut water")
        self.assertIsNone(slot)
        self.assertEqual(fuzzy_match_food(item), "King Coconut Water")

    def test_drink_adds_to_existing_daily_totals_and_duplicate_is_rejected(self):
        state = UserDietState(user_id=999)
        for food, slot in (
            ("Boiled Egg", "Breakfast"),
            ("Biryani", "Lunch"),
            ("King Coconut Water", "Other"),
        ):
            entry, duplicate = log_food(state, food, slot)
            self.assertIsNotNone(entry)
            self.assertFalse(duplicate)

        progress = get_daily_progress(
            state,
            {
                "target_calories": 2385,
                "protein_target_g": 178.9,
                "carbs_target_g": 298.1,
                "fat_target_g": 53,
            },
        )
        self.assertEqual(progress["consumed"]["calories"], 688)
        self.assertEqual(progress["remaining"]["calories"], 1697)

        entry, duplicate = log_food(
            state,
            "King Coconut Water",
            "Other",
        )
        self.assertIsNone(entry)
        self.assertTrue(duplicate)
        self.assertEqual(len(state.meal_log), 3)


if __name__ == "__main__":
    unittest.main()
