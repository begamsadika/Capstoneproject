import json
import unittest

import httpx
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from hybrid_llm import HybridLLM, _gemini_payload


class FakeLocalLLM:
    def __init__(self):
        self.invoke_calls = 0
        self.stream_calls = 0

    async def ainvoke(self, messages):
        self.invoke_calls += 1
        return AIMessage(content="local answer")

    async def astream(self, messages):
        self.stream_calls += 1
        yield AIMessage(content="local stream")


def success_transport(text="online answer"):
    async def handler(request):
        if "streamGenerateContent" in str(request.url):
            event = {
                "candidates": [{"content": {"parts": [{"text": text}]}}]
            }
            return httpx.Response(
                200,
                text=f"data: {json.dumps(event)}\n\n",
                headers={"content-type": "text/event-stream"},
            )
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": text}]}}]},
        )

    return httpx.MockTransport(handler)


class HybridLLMTests(unittest.IsolatedAsyncioTestCase):
    def test_payload_separates_system_and_chat_messages(self):
        payload = _gemini_payload(
            [
                SystemMessage(content="system rules"),
                HumanMessage(content="hello"),
                AIMessage(content="hi"),
            ],
            temperature=0.2,
            max_output_tokens=100,
        )
        self.assertEqual(payload["systemInstruction"]["parts"][0]["text"], "system rules")
        self.assertEqual(payload["contents"][0]["role"], "user")
        self.assertEqual(payload["contents"][1]["role"], "model")

    async def test_online_non_streaming_success_skips_local(self):
        local = FakeLocalLLM()
        router = HybridLLM(
            local,
            gemini_api_key="test-key",
            transport=success_transport(),
        )
        response = await router.ainvoke([HumanMessage(content="hello")])
        self.assertEqual(response.content, "online answer")
        self.assertEqual(local.invoke_calls, 0)
        self.assertEqual(router.status()["last_provider"], "gemini")

    async def test_http_error_falls_back_and_opens_cooldown(self):
        async def handler(request):
            return httpx.Response(429, json={"error": {"message": "quota"}})

        local = FakeLocalLLM()
        router = HybridLLM(
            local,
            gemini_api_key="test-key",
            failure_cooldown_seconds=60,
            transport=httpx.MockTransport(handler),
        )
        response = await router.ainvoke([HumanMessage(content="hello")])
        self.assertEqual(response.content, "local answer")
        self.assertEqual(local.invoke_calls, 1)
        self.assertGreater(router.status()["cooldown_remaining_seconds"], 0)
        self.assertEqual(router.status()["last_provider"], "ollama")

    async def test_missing_key_uses_local_without_network(self):
        local = FakeLocalLLM()
        router = HybridLLM(local, gemini_api_key="")
        response = await router.ainvoke([HumanMessage(content="hello")])
        self.assertEqual(response.content, "local answer")
        self.assertEqual(local.invoke_calls, 1)
        self.assertFalse(router.status()["online_configured"])

    async def test_online_stream_success_skips_local(self):
        local = FakeLocalLLM()
        router = HybridLLM(
            local,
            gemini_api_key="test-key",
            transport=success_transport("online stream"),
        )
        chunks = [chunk async for chunk in router.astream([HumanMessage(content="hello")])]
        self.assertEqual(chunks, ["online stream"])
        self.assertEqual(local.stream_calls, 0)

    async def test_stream_http_error_falls_back_to_local(self):
        async def handler(request):
            return httpx.Response(503, json={"error": {"message": "unavailable"}})

        local = FakeLocalLLM()
        router = HybridLLM(
            local,
            gemini_api_key="test-key",
            transport=httpx.MockTransport(handler),
        )
        chunks = [chunk async for chunk in router.astream([HumanMessage(content="hello")])]
        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0].content, "local stream")
        self.assertEqual(local.stream_calls, 1)


if __name__ == "__main__":
    unittest.main()
