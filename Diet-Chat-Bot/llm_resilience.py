"""Timeout and user-safe fallback helpers for the Ollama response stream."""

from __future__ import annotations

import asyncio
from typing import AsyncIterator


class LLMStreamTimeout(TimeoutError):
    """Raised when a configured Ollama stream deadline is reached."""

    def __init__(self, phase: str):
        self.phase = phase
        super().__init__(f"Ollama stream timed out during {phase}")


class LLMEmptyResponse(RuntimeError):
    """Raised when Ollama finishes without producing user-visible text."""


def _chunk_text(chunk) -> str:
    if isinstance(chunk, str):
        return chunk
    return str(getattr(chunk, "content", "") or "")


async def stream_visible_chunks(
    stream,
    *,
    first_response_timeout: float | None,
    idle_timeout: float | None,
    total_timeout: float | None,
) -> AsyncIterator[str]:
    """Yield visible model text while enforcing first, idle and total deadlines.

    Reasoning blocks are removed before text is yielded. The first-response
    deadline therefore measures what the user can actually see, rather than a
    hidden ``<think>`` token produced by some local models.
    """
    configured_timeouts = (
        first_response_timeout,
        idle_timeout,
        total_timeout,
    )
    if any(timeout is not None and timeout <= 0 for timeout in configured_timeouts):
        raise ValueError("Configured LLM stream timeouts must be positive")

    iterator = stream.__aiter__()
    loop = asyncio.get_running_loop()
    started_at = loop.time()
    last_activity_at = started_at
    received_any = False
    emitted_visible = False
    mode = "detect"
    buffer = ""

    try:
        while True:
            now = loop.time()
            deadlines = []
            if total_timeout is not None:
                deadlines.append(
                    ("total response", total_timeout - (now - started_at))
                )
            if not emitted_visible and first_response_timeout is not None:
                deadlines.append(
                    ("first response", first_response_timeout - (now - started_at))
                )
            if received_any and idle_timeout is not None:
                deadlines.append(
                    ("stream idle", idle_timeout - (now - last_activity_at))
                )

            try:
                if deadlines:
                    phase, wait_seconds = min(deadlines, key=lambda item: item[1])
                    if wait_seconds <= 0:
                        raise LLMStreamTimeout(phase)
                    chunk = await asyncio.wait_for(iterator.__anext__(), wait_seconds)
                else:
                    # No configured deadline: wait until Ollama produces the
                    # next chunk, the user cancels, or the connection fails.
                    phase = "response"
                    chunk = await iterator.__anext__()
            except StopAsyncIteration:
                break
            except TimeoutError as exc:
                raise LLMStreamTimeout(phase) from exc

            received_any = True
            last_activity_at = loop.time()
            text = _chunk_text(chunk)
            if not text:
                continue

            if mode == "stream":
                emitted_visible = True
                yield text
                continue

            buffer += text
            if mode == "detect":
                head = buffer.lstrip()
                if head.startswith("<think>"):
                    mode = "think"
                elif "<think>".startswith(head[: len("<think>")]):
                    continue
                else:
                    mode = "stream"
                    emitted_visible = True
                    yield buffer
                    buffer = ""
                    continue

            if mode == "think":
                end = buffer.find("</think>")
                if end != -1:
                    visible = buffer[end + len("</think>") :].lstrip("\n")
                    mode = "stream"
                    buffer = ""
                    if visible:
                        emitted_visible = True
                        yield visible

        if buffer and mode == "detect":
            emitted_visible = True
            yield buffer

        if not emitted_visible:
            raise LLMEmptyResponse("Ollama returned no user-visible response")
    finally:
        close = getattr(iterator, "aclose", None)
        if close is not None:
            try:
                await close()
            except Exception:
                pass


def build_llm_fallback(metrics: dict | None, *, partial: bool = False) -> str:
    """Create a deterministic response that does not invent nutrition advice."""
    if partial:
        return (
            "\n\n⚠️ **The Diet AI response stopped before it was complete.** "
            "Please retry your question. Do not rely on an incomplete medication "
            "or medical instruction."
        )

    metrics = metrics or {}
    profile_parts = []
    if metrics.get("health_goal"):
        profile_parts.append(f"goal: {metrics['health_goal']}")
    if metrics.get("dietary_preference"):
        profile_parts.append(f"diet: {metrics['dietary_preference']}")
    if metrics.get("allergies"):
        profile_parts.append(f"avoiding: {metrics['allergies']}")

    lines = [
        "**Diet AI is taking longer than expected.**",
        "",
        "I stopped this request so you would not have to wait indefinitely. "
        "I have not generated an unverified answer.",
    ]
    if profile_parts:
        lines.extend(("", "Your saved profile is still active — " + "; ".join(profile_parts) + "."))
    lines.extend(
        (
            "",
            "Please retry, or ask one of these for an immediate database-based response:",
            "- Give me a full-day meal plan.",
            "- Foods to avoid for my condition.",
            "- What is my calorie target?",
        )
    )
    return "\n".join(lines)
