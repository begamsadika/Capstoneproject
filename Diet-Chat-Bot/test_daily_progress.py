import datetime as dt
import json
import unittest
from unittest.mock import patch

from bypass_handlers import is_remaining_day_plan_request
from meal_logger import (
    UserDietState,
    _log_option,
    detect_combined_log_and_request,
    detect_log_summary_request,
    food_df,
    format_log_summary,
    get_daily_progress,
    log_food,
    clear_user_state_cache,
    get_user_state,
)
from meal_planner import build_remaining_day_plan


METRICS = {
    "target_calories": 2000,
    "protein_target_g": 120,
    "carbs_target_g": 240,
    "fat_target_g": 60,
    "health_goal": "Maintain weight",
}


class DailyProgressTests(unittest.TestCase):
    def test_option_log_stores_macros_and_rejects_exact_duplicate(self):
        state = UserDietState(user_id=501)
        state.plan_cache["Breakfast"] = {
            "options": [{
                "foods": [{
                    "name": "Test Breakfast",
                    "serving_size_g": 180,
                    "calories": 410,
                    "protein_g": 22,
                    "carbs_g": 55,
                    "fat_g": 11,
                    "fiber_g": 6,
                    "sodium_mg": 320,
                }]
            }]
        }

        first = _log_option(state, 1, "Breakfast")
        duplicate = _log_option(state, 1, "Breakfast")

        self.assertEqual(len(first), 1)
        self.assertEqual(duplicate, [])
        self.assertEqual(first[0]["protein_g"], 22)
        self.assertEqual(first[0]["carbs_g"], 55)
        self.assertEqual(first[0]["fat_g"], 11)
        self.assertEqual(first[0]["option_number"], 1)
        self.assertEqual(len(state.meal_log), 1)

    def test_manual_food_log_uses_database_nutrition_and_deduplicates(self):
        state = UserDietState(user_id=502)
        food_name = str(food_df.iloc[0]["food_item"])

        entry, duplicate = log_food(state, food_name, "Snack")
        second_entry, second_duplicate = log_food(state, food_name, "Snack")

        self.assertIsNotNone(entry)
        self.assertFalse(duplicate)
        self.assertIsNone(second_entry)
        self.assertTrue(second_duplicate)
        self.assertIn("protein_g", entry)
        self.assertIn("carbs_g", entry)
        self.assertIn("fat_g", entry)

    def test_progress_calculates_consumed_remaining_and_completed_slots(self):
        state = UserDietState(user_id=503)
        today = dt.date.today().isoformat()
        state.meal_log.extend([
            {
                "date": today,
                "slot": "Breakfast",
                "food": "Food A",
                "calories": 400,
                "protein_g": 20,
                "carbs_g": 50,
                "fat_g": 10,
            },
            {
                "date": today,
                "slot": "Other",
                "food": "Food B",
                "calories": 100,
                "protein_g": 5,
                "carbs_g": 15,
                "fat_g": 2,
            },
        ])

        progress = get_daily_progress(state, METRICS)

        self.assertEqual(progress["consumed"]["calories"], 500)
        self.assertEqual(progress["remaining"]["calories"], 1500)
        self.assertEqual(progress["remaining"]["protein_g"], 95)
        self.assertEqual(progress["remaining"]["carbs_g"], 175)
        self.assertEqual(progress["remaining"]["fat_g"], 48)
        self.assertEqual(progress["completed_slots"], ["Breakfast"])

    def test_log_summary_reports_macros_and_remaining_targets(self):
        state = UserDietState(user_id=504)
        state.meal_log.append({
            "date": dt.date.today().isoformat(),
            "slot": "Lunch",
            "food": "Food A",
            "calories": 600,
            "protein_g": 30,
            "carbs_g": 80,
            "fat_g": 15,
        })

        answer = format_log_summary(state, METRICS)

        self.assertIn("Total calories logged: 600 kcal", answer)
        self.assertIn("Protein: 30.0g", answer)
        self.assertIn("Remaining today:** 1400 kcal", answer)
        self.assertIn("Completed meals: Lunch", answer)

    def test_remaining_plan_uses_only_uncompleted_slots_and_remaining_targets(self):
        state = UserDietState(user_id=505)
        state.meal_log.append({
            "date": dt.date.today().isoformat(),
            "slot": "Breakfast",
            "food": "Food A",
            "calories": 500,
            "protein_g": 25,
            "carbs_g": 60,
            "fat_g": 15,
        })
        fake_plan = {
            "Lunch": {"options": []},
            "Dinner": {"options": []},
            "Snack": {"options": []},
            "totals": {"target_kcal": 1500},
            "planned_slots": ["Lunch", "Dinner", "Snack"],
        }

        with patch("meal_planner.build_meal_plan", return_value=fake_plan) as builder:
            plan = build_remaining_day_plan(
                2000,
                METRICS,
                state,
                save_as_current=False,
            )

        args, kwargs = builder.call_args
        self.assertEqual(args[0], 1500)
        self.assertEqual(kwargs["included_slots"], ["Lunch", "Dinner", "Snack"])
        self.assertEqual(args[1]["protein_target_g"], 95)
        self.assertEqual(args[1]["carbs_target_g"], 180)
        self.assertEqual(args[1]["fat_target_g"], 45)
        self.assertTrue(plan["is_remaining_day_plan"])
        self.assertEqual(plan["daily_progress"]["completed_slots"], ["Breakfast"])

    def test_combined_log_and_recommendation_is_split(self):
        item, slot, follow_up = detect_combined_log_and_request(
            "I ate option 1 for breakfast. Suggest lunch."
        )
        self.assertEqual(item, "option 1")
        self.assertEqual(slot, "Breakfast")
        self.assertEqual(follow_up, "Suggest lunch.")
        self.assertTrue(is_remaining_day_plan_request("Plan the rest of today"))
        self.assertFalse(
            detect_log_summary_request("Adjust dinner based on what I ate today")
        )


class DailyProgressRouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        clear_user_state_cache()

    async def asyncTearDown(self):
        clear_user_state_cache()

    async def test_combined_option_log_then_lunch_recommendation(self):
        import api_new
        from models import ChatRequest

        state = get_user_state(987650123)
        state.plan_cache["Breakfast"] = {
            "options": [{
                "foods": [{
                    "name": "Test Breakfast",
                    "serving_size_g": 200,
                    "calories": 450,
                    "protein_g": 20,
                    "carbs_g": 60,
                    "fat_g": 12,
                }]
            }]
        }
        progress = {
            "consumed": {"calories": 450, "protein_g": 20, "carbs_g": 60, "fat_g": 12},
            "remaining": {"calories": 1550, "protein_g": 100, "carbs_g": 180, "fat_g": 48},
            "completed_slots": ["Breakfast"],
        }
        remaining_plan = {
            "Lunch": {
                "target_kcal": 650,
                "options": [{
                    "actual_kcal": 650,
                    "protein_g": 35,
                    "carbs_g": 80,
                    "fat_g": 18,
                    "foods": [{
                        "name": "Test Lunch",
                        "serving_size_g": 300,
                        "calories": 650,
                        "protein_g": 35,
                        "carbs_g": 80,
                        "fat_g": 18,
                    }],
                }],
            },
            "planned_slots": ["Lunch", "Dinner", "Snack"],
            "daily_progress": progress,
            "is_remaining_day_plan": True,
        }
        request = ChatRequest(
            user_id=987650123,
            message="I ate option 1 for breakfast. Suggest lunch.",
            user_metrics=METRICS,
        )

        with (
            patch.object(api_new, "persist_user_state"),
            patch.object(api_new, "build_remaining_day_plan", return_value=remaining_plan),
        ):
            response = await api_new.chat_stream(request)
            chunks = []
            async for chunk in response.body_iterator:
                chunks.append(chunk.decode() if isinstance(chunk, bytes) else chunk)

        answer_parts = []
        for line in "".join(chunks).splitlines():
            if not line.startswith("data: ") or line == "data: [DONE]":
                continue
            answer_parts.append(json.loads(line[6:]).get("token", ""))
        answer = "".join(answer_parts)
        self.assertIn("Logged **Option 1** for Breakfast", answer)
        self.assertIn("Remaining today:** 1550 kcal", answer)
        self.assertIn("**Lunch**", answer)
        self.assertEqual(len(state.meal_log), 1)


if __name__ == "__main__":
    unittest.main()
