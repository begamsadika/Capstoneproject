import asyncio
import unittest

from llm_resilience import (
    LLMStreamTimeout,
    build_llm_fallback,
    stream_visible_chunks,
)


class _Chunk:
    def __init__(self, content: str):
        self.content = content


async def _chunks(*values: str):
    for value in values:
        yield _Chunk(value)


async def _delayed_first_chunk():
    await asyncio.sleep(1)
    yield _Chunk("late")


async def _stalled_after_first_chunk():
    yield _Chunk("First")
    await asyncio.sleep(1)
    yield _Chunk("late")


async def _hidden_reasoning_without_visible_answer():
    yield _Chunk("<think>")
    yield _Chunk("still reasoning")
    await asyncio.sleep(1)
    yield _Chunk("</think>late")


async def _briefly_delayed_answer():
    await asyncio.sleep(0.03)
    yield _Chunk("finished")


class LLMResilienceTests(unittest.IsolatedAsyncioTestCase):
    async def test_visible_chunks_are_streamed(self):
        result = []
        async for text in stream_visible_chunks(
            _chunks("Hello", " world"),
            first_response_timeout=0.2,
            idle_timeout=0.2,
            total_timeout=0.5,
        ):
            result.append(text)
        self.assertEqual("".join(result), "Hello world")

    async def test_hidden_reasoning_does_not_reach_the_user(self):
        result = []
        async for text in stream_visible_chunks(
            _chunks("<think>", "private", "</think>Safe answer"),
            first_response_timeout=0.2,
            idle_timeout=0.2,
            total_timeout=0.5,
        ):
            result.append(text)
        self.assertEqual("".join(result), "Safe answer")

    async def test_disabled_timeouts_wait_for_the_answer(self):
        result = []
        async for text in stream_visible_chunks(
            _briefly_delayed_answer(),
            first_response_timeout=None,
            idle_timeout=None,
            total_timeout=None,
        ):
            result.append(text)
        self.assertEqual(result, ["finished"])

    async def test_first_response_timeout_is_enforced(self):
        with self.assertRaises(LLMStreamTimeout) as raised:
            async for _ in stream_visible_chunks(
                _delayed_first_chunk(),
                first_response_timeout=0.02,
                idle_timeout=0.2,
                total_timeout=0.5,
            ):
                pass
        self.assertEqual(raised.exception.phase, "first response")

    async def test_idle_timeout_is_enforced_after_visible_output(self):
        result = []
        with self.assertRaises(LLMStreamTimeout) as raised:
            async for text in stream_visible_chunks(
                _stalled_after_first_chunk(),
                first_response_timeout=0.2,
                idle_timeout=0.02,
                total_timeout=0.5,
            ):
                result.append(text)
        self.assertEqual(result, ["First"])
        self.assertEqual(raised.exception.phase, "stream idle")

    async def test_hidden_reasoning_does_not_bypass_first_response_timeout(self):
        with self.assertRaises(LLMStreamTimeout) as raised:
            async for _ in stream_visible_chunks(
                _hidden_reasoning_without_visible_answer(),
                first_response_timeout=0.02,
                idle_timeout=0.2,
                total_timeout=0.5,
            ):
                pass
        self.assertEqual(raised.exception.phase, "first response")

    def test_fallback_preserves_profile_without_inventing_advice(self):
        answer = build_llm_fallback(
            {
                "health_goal": "Gain weight",
                "dietary_preference": "Vegetarian",
                "allergies": "Seafood",
            }
        )
        self.assertIn("goal: Gain weight", answer)
        self.assertIn("diet: Vegetarian", answer)
        self.assertIn("avoiding: Seafood", answer)
        self.assertIn("not generated an unverified answer", answer)


if __name__ == "__main__":
    unittest.main()
