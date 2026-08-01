"""Gemini-first LLM router with automatic local Ollama fallback."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import AsyncIterator
from urllib.parse import quote

import httpx
from langchain_core.messages import AIMessage

logger = logging.getLogger(__name__)


class GeminiProviderError(RuntimeError):
    """A recoverable Gemini transport, quota, authentication, or response error."""


def _text_content(message) -> str:
    content = getattr(message, "content", message)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and item.get("text"):
                parts.append(str(item["text"]))
        return "\n".join(parts)
    return str(content or "")


def _gemini_payload(messages, *, temperature: float, max_output_tokens: int) -> dict:
    """Convert LangChain-style messages into Gemini REST content."""
    if not isinstance(messages, (list, tuple)):
        messages = [messages]

    system_parts = []
    contents = []
    for message in messages:
        text = _text_content(message).strip()
        if not text:
            continue
        message_type = str(getattr(message, "type", "human")).lower()
        if message_type == "system":
            system_parts.append(text)
            continue
        role = "model" if message_type in {"ai", "assistant"} else "user"
        contents.append({"role": role, "parts": [{"text": text}]})

    if not contents:
        raise GeminiProviderError("No user content was available for Gemini")

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
        },
    }
    if system_parts:
        payload["systemInstruction"] = {
            "parts": [{"text": "\n\n".join(system_parts)}]
        }
    return payload


def _candidate_text(payload: dict) -> str:
    candidates = payload.get("candidates") or []
    if not candidates:
        return ""
    content = candidates[0].get("content") or {}
    return "".join(
        str(part.get("text") or "")
        for part in content.get("parts") or []
        if isinstance(part, dict)
    )


class HybridLLM:
    """Use Gemini when configured and healthy; otherwise reuse local Ollama."""

    def __init__(
        self,
        local_llm,
        *,
        mode: str = "hybrid",
        gemini_api_key: str = "",
        gemini_model: str = "gemini-2.5-flash",
        gemini_timeout_seconds: float = 10.0,
        failure_cooldown_seconds: float = 60.0,
        temperature: float = 0.2,
        max_output_tokens: int = 1024,
        transport=None,
    ):
        self.local_llm = local_llm
        self.mode = (mode or "hybrid").strip().lower()
        self.gemini_api_key = (gemini_api_key or "").strip()
        self.gemini_model = (gemini_model or "gemini-2.5-flash").strip()
        self.gemini_timeout_seconds = max(float(gemini_timeout_seconds), 1.0)
        self.failure_cooldown_seconds = max(float(failure_cooldown_seconds), 1.0)
        self.temperature = temperature
        self.max_output_tokens = max_output_tokens
        self.transport = transport
        self._disabled_until = 0.0
        self._last_error = ""
        self._last_provider = "none"

    @property
    def online_configured(self) -> bool:
        return self.mode != "local" and bool(self.gemini_api_key)

    def _can_try_gemini(self) -> bool:
        return self.online_configured and time.monotonic() >= self._disabled_until

    def _mark_online_failure(self, exc: Exception) -> None:
        self._disabled_until = time.monotonic() + self.failure_cooldown_seconds
        self._last_error = f"{type(exc).__name__}: {exc}"
        logger.warning(
            "Gemini unavailable; using local Ollama for %.0f seconds (%s)",
            self.failure_cooldown_seconds,
            self._last_error,
        )

    def _mark_online_success(self) -> None:
        self._disabled_until = 0.0
        self._last_error = ""
        self._last_provider = "gemini"

    def status(self) -> dict:
        return {
            "mode": self.mode,
            "online_provider": "gemini",
            "online_configured": self.online_configured,
            "gemini_model": self.gemini_model if self.online_configured else None,
            "cooldown_remaining_seconds": round(
                max(0.0, self._disabled_until - time.monotonic()), 1
            ),
            "last_provider": self._last_provider,
            "last_error": self._last_error or None,
            "local_fallback": "ollama",
        }

    def _url(self, method: str, *, stream: bool = False) -> str:
        model = quote(self.gemini_model, safe="")
        suffix = "?alt=sse" if stream else ""
        return (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:{method}{suffix}"
        )

    def _client(self) -> httpx.AsyncClient:
        timeout = httpx.Timeout(
            self.gemini_timeout_seconds,
            connect=min(3.0, self.gemini_timeout_seconds),
        )
        return httpx.AsyncClient(timeout=timeout, transport=self.transport)

    async def _gemini_invoke(self, messages) -> str:
        payload = _gemini_payload(
            messages,
            temperature=self.temperature,
            max_output_tokens=self.max_output_tokens,
        )
        try:
            async with self._client() as client:
                response = await client.post(
                    self._url("generateContent"),
                    headers={"x-goog-api-key": self.gemini_api_key},
                    json=payload,
                )
        except (httpx.HTTPError, asyncio.TimeoutError) as exc:
            raise GeminiProviderError("Gemini request failed") from exc
        if response.status_code >= 400:
            raise GeminiProviderError(f"Gemini returned HTTP {response.status_code}")
        try:
            text = _candidate_text(response.json()).strip()
        except (ValueError, TypeError) as exc:
            raise GeminiProviderError("Gemini returned invalid JSON") from exc
        if not text:
            raise GeminiProviderError("Gemini returned no visible text")
        return text

    async def _gemini_stream(self, messages) -> AsyncIterator[str]:
        payload = _gemini_payload(
            messages,
            temperature=self.temperature,
            max_output_tokens=self.max_output_tokens,
        )
        emitted = False
        try:
            async with self._client() as client:
                async with client.stream(
                    "POST",
                    self._url("streamGenerateContent", stream=True),
                    headers={"x-goog-api-key": self.gemini_api_key},
                    json=payload,
                ) as response:
                    if response.status_code >= 400:
                        raise GeminiProviderError(
                            f"Gemini returned HTTP {response.status_code}"
                        )
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw or raw == "[DONE]":
                            continue
                        try:
                            text = _candidate_text(json.loads(raw))
                        except (json.JSONDecodeError, TypeError) as exc:
                            raise GeminiProviderError(
                                "Gemini returned an invalid stream event"
                            ) from exc
                        if text:
                            emitted = True
                            yield text
        except GeminiProviderError:
            raise
        except (httpx.HTTPError, asyncio.TimeoutError) as exc:
            raise GeminiProviderError("Gemini stream failed") from exc
        if not emitted:
            raise GeminiProviderError("Gemini stream returned no visible text")

    async def ainvoke(self, messages):
        if self._can_try_gemini():
            try:
                text = await self._gemini_invoke(messages)
                self._mark_online_success()
                return AIMessage(content=text)
            except Exception as exc:
                self._mark_online_failure(exc)
        self._last_provider = "ollama"
        return await self.local_llm.ainvoke(messages)

    async def astream(self, messages):
        if self._can_try_gemini():
            emitted = False
            try:
                async for text in self._gemini_stream(messages):
                    emitted = True
                    self._last_provider = "gemini"
                    yield text
                self._mark_online_success()
                return
            except Exception as exc:
                # Never splice a second provider into a partially visible answer.
                if emitted:
                    raise
                self._mark_online_failure(exc)

        self._last_provider = "ollama"
        async for chunk in self.local_llm.astream(messages):
            yield chunk
