import json
import unittest
from unittest.mock import patch

from pydantic import ValidationError

import meal_logger
from meal_logger import (
    _log_option,
    clear_user_state_cache,
    get_user_state,
    persist_user_state,
)
from models import ChatRequest


class UserStateIsolationTests(unittest.TestCase):
    def setUp(self):
        clear_user_state_cache()

    def tearDown(self):
        clear_user_state_cache()

    def test_request_requires_a_positive_user_id(self):
        request = ChatRequest(user_id=7, message="Hello")
        self.assertEqual(request.user_id, 7)

        with self.assertRaises(ValidationError):
            ChatRequest(user_id=0, message="Hello")

    def test_users_have_separate_preferences_plans_and_logs(self):
        user_one = get_user_state(101)
        user_two = get_user_state(202)

        user_one.disliked_foods.add("Pittu")
        user_one.plan_cache["Breakfast"] = {
            "options": [
                {
                    "foods": [
                        {"name": "String Hoppers", "calories": 220},
                    ]
                }
            ]
        }
        logged = _log_option(user_one, 1, "Breakfast")

        self.assertEqual(len(logged), 1)
        self.assertEqual(user_one.disliked_foods, {"Pittu"})
        self.assertIn("Breakfast", user_one.plan_cache)
        self.assertEqual(len(user_one.meal_log), 1)

        self.assertEqual(user_two.disliked_foods, set())
        self.assertEqual(user_two.plan_cache, {})
        self.assertEqual(user_two.meal_log, [])

    def test_each_user_is_persisted_and_reloaded_independently(self):
        payloads = {
            101: {
                "plan_cache": {},
                "weekly_plan": {"Day 1": {"owner": 101}},
                "disliked_foods": ["Pittu"],
                "meal_log": [],
            },
            202: {
                "plan_cache": {},
                "weekly_plan": {"Day 1": {"owner": 202}},
                "disliked_foods": ["Kottu Roti"],
                "meal_log": [],
            },
        }

        class FakeStatePath:
            def __init__(self, user_id):
                self.user_id = user_id

            def exists(self):
                return True

            def read_text(self, encoding=None):
                return json.dumps(payloads[self.user_id])

        with patch.object(
            meal_logger,
            "_state_path",
            side_effect=lambda user_id: FakeStatePath(user_id),
        ):
            reloaded_one = get_user_state(101)
            reloaded_two = get_user_state(202)

        self.assertEqual(reloaded_one.disliked_foods, {"Pittu"})
        self.assertEqual(reloaded_two.disliked_foods, {"Kottu Roti"})
        self.assertEqual(reloaded_one.weekly_plan["Day 1"]["owner"], 101)
        self.assertEqual(reloaded_two.weekly_plan["Day 1"]["owner"], 202)
        self.assertNotEqual(
            meal_logger._state_path(101),
            meal_logger._state_path(202),
        )

    def test_persistence_writes_only_the_given_user_state(self):
        state = get_user_state(303)
        state.disliked_foods.add("Pittu")

        with (
            patch.object(meal_logger.pathlib.Path, "mkdir") as mkdir,
            patch.object(meal_logger, "_state_path") as state_path,
        ):
            destination = state_path.return_value
            temporary = destination.with_suffix.return_value
            persist_user_state(state)

        mkdir.assert_called_once_with(parents=True, exist_ok=True)
        temporary.write_text.assert_called_once()
        temporary.replace.assert_called_once_with(destination)
        written_payload = json.loads(temporary.write_text.call_args.args[0])
        self.assertEqual(written_payload["disliked_foods"], ["Pittu"])


if __name__ == "__main__":
    unittest.main()
