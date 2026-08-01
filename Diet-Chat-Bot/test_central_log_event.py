import asyncio
import json
import unittest

import api_new


class CentralLogEventTests(unittest.TestCase):
    def test_structured_log_event_precedes_visible_tokens(self):
        entry = {
            "entry_id": "entry-1",
            "date": "2026-07-31",
            "food": "Boiled Egg",
            "calories": 78,
        }
        api_new._meal_log_events.set((entry,))

        async def visible_stream():
            yield 'data: {"token": "Logged"}\n\n'
            yield "data: [DONE]\n\n"

        response = api_new.StreamingResponse(
            visible_stream(),
            media_type="text/event-stream",
        )

        async def collect():
            return [chunk async for chunk in response.body_iterator]

        chunks = asyncio.run(collect())
        event = json.loads(chunks[0].removeprefix("data: ").strip())
        self.assertEqual(event["meal_log_entries"], [entry])
        self.assertIn('"token": "Logged"', chunks[1])


if __name__ == "__main__":
    unittest.main()

