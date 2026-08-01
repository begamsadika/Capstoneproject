import unittest

import pandas as pd

from food_db import apply_allergy_filter, parse_allergy_string


class CustomIngredientAvoidanceTests(unittest.TestCase):
    def setUp(self):
        self.foods = pd.DataFrame(
            [
                {
                    "food_item": "Sprouted Mung Salad",
                    "main_ingredients": "Mung sprouts,onion,tomato,lime,salt",
                    "category": "Salads",
                    "allergens": "none",
                },
                {
                    "food_item": "Potato Curry",
                    "main_ingredients": "Potato,onion,coconut milk,spices",
                    "category": "Curries",
                    "allergens": "none",
                },
                {
                    "food_item": "Cashew Curry",
                    "main_ingredients": "Cashew,coconut milk,spices",
                    "category": "Curries",
                    "allergens": "nuts",
                },
                {
                    "food_item": "Fish Curry",
                    "main_ingredients": "Tuna,onion,spices",
                    "category": "Seafood",
                    "allergens": "fish",
                },
                {
                    "food_item": "Squid Curry",
                    "main_ingredients": "Squid,coconut milk,spices",
                    "category": "Seafood",
                    "allergens": "none",
                },
            ]
        )

    def test_custom_tomato_avoidance_checks_ingredients(self):
        result = apply_allergy_filter(self.foods, parse_allergy_string("tomato"))

        self.assertNotIn("Sprouted Mung Salad", result["food_item"].tolist())
        self.assertIn("Potato Curry", result["food_item"].tolist())

    def test_plural_custom_term_matches_singular_ingredient(self):
        result = apply_allergy_filter(self.foods, parse_allergy_string("tomatoes"))

        self.assertNotIn("Sprouted Mung Salad", result["food_item"].tolist())

    def test_multiple_restrictions_are_combined(self):
        result = apply_allergy_filter(
            self.foods,
            parse_allergy_string("tomato, sea food"),
        )

        self.assertNotIn("Sprouted Mung Salad", result["food_item"].tolist())
        self.assertNotIn("Fish Curry", result["food_item"].tolist())
        self.assertNotIn("Squid Curry", result["food_item"].tolist())
        self.assertIn("Potato Curry", result["food_item"].tolist())

    def test_nut_filter_does_not_treat_coconut_as_a_tree_nut(self):
        result = apply_allergy_filter(self.foods, parse_allergy_string("nuts"))

        self.assertNotIn("Cashew Curry", result["food_item"].tolist())
        self.assertIn("Potato Curry", result["food_item"].tolist())

    def test_filtering_one_profile_does_not_modify_another(self):
        tomato_profile = apply_allergy_filter(
            self.foods,
            parse_allergy_string("tomato"),
        )
        unrestricted_profile = apply_allergy_filter(self.foods, [])

        self.assertNotIn("Sprouted Mung Salad", tomato_profile["food_item"].tolist())
        self.assertIn("Sprouted Mung Salad", unrestricted_profile["food_item"].tolist())

    def test_custom_filter_works_without_an_allergen_column(self):
        foods_without_allergens = self.foods.drop(columns=["allergens"])
        result = apply_allergy_filter(
            foods_without_allergens,
            parse_allergy_string("tomato"),
        )

        self.assertNotIn("Sprouted Mung Salad", result["food_item"].tolist())


if __name__ == "__main__":
    unittest.main()
