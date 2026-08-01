import re
import unittest

from food_db import canonical_food_key, get_meal_slotted_foods


class FoodRecommendationDeduplicationTests(unittest.TestCase):
    def test_known_kiribath_aliases_have_one_key(self):
        keys = {
            canonical_food_key("Kiribath"),
            canonical_food_key("Kiri Bath"),
            canonical_food_key("Milk Rice"),
        }
        self.assertEqual(keys, {"kiribath"})

    def test_recommendation_has_no_alias_or_cross_slot_duplicates(self):
        answer = get_meal_slotted_foods(
            {
                "dietary_preference": "Eat anything",
                "allergies": "tomato, sea food",
                "target_calories": 2385,
            }
        )

        displayed_names = re.findall(
            r"([^,\n:]+?) \(\d+(?:\.\d+)? cal\)",
            answer,
        )
        keys = [canonical_food_key(name.strip()) for name in displayed_names]

        self.assertEqual(len(keys), len(set(keys)))
        self.assertLessEqual(
            sum(name in answer for name in ("Kiribath", "Kiri Bath", "Milk Rice")),
            1,
        )
        self.assertNotIn("Pani Pani", answer)


if __name__ == "__main__":
    unittest.main()
