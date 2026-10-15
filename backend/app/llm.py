"""AI model calls with retries."""

from __future__ import annotations

import json
import re
import time
from typing import Any

import httpx

from . import config


class LLMError(RuntimeError):
    pass


DEFAULT_MAX_TOKENS = 16384
MAX_TOKENS_CEILING = 32768


def chat(
    system: str,
    user: str,
    *,
    temperature: float = 0.7,
    json_mode: bool = False,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    model: str | None = None,
) -> str:
    payload: dict[str, Any] = {
        "model": model or config.FAST_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {config.GATEWAY_KEY}",
        "Content-Type": "application/json",
    }

    last_error = ""
    budget = max_tokens
    budget_bumps = 0

    for attempt in range(6):
        payload["max_tokens"] = budget
        try:
            response = httpx.post(
                config.GATEWAY_URL,
                headers=headers,
                json=payload,
                timeout=config.LLM_TIMEOUT,
            )
            if response.status_code in (429, 500, 502, 503, 504):
                last_error = f"HTTP {response.status_code}: {response.text[:300]}"
                time.sleep(min(2**attempt, 8))
                continue
            if response.status_code >= 400:
                if json_mode and "response_format" in payload and budget_bumps < 1:
                    payload.pop("response_format", None)
                    last_error = f"HTTP {response.status_code}: {response.text[:300]}"
                    continue
                raise LLMError(f"Gateway error {response.status_code}: {response.text[:500]}")

            data = response.json()
            choices = data.get("choices") or []
            if not choices:
                last_error = f"No choices in response: {str(data)[:300]}"
                time.sleep(1)
                continue

            choice = choices[0]
            message = choice.get("message") or {}
            content = (message.get("content") or "").strip()
            finish_reason = choice.get("finish_reason")

            if content:
                return content

            budget_bumps += 1
            last_error = (
                f"Empty content (finish_reason={finish_reason}, "
                f"reasoning_chars={len(message.get('reasoning') or '')})"
            )
            if budget < MAX_TOKENS_CEILING:
                budget = min(budget * 2, MAX_TOKENS_CEILING)
            time.sleep(1)

        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            time.sleep(min(2**attempt, 8))

    raise LLMError(f"Model call failed after retries: {last_error}")


def extract_json(text: str) -> Any:
    if not text:
        raise LLMError("Empty text, cannot extract JSON")

    stripped = text.strip()

    fence = re.search(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", stripped, re.DOTALL)
    if fence:
        try:
            return json.loads(fence.group(1))
        except json.JSONDecodeError:
            pass

    for open_ch, close_ch in (("{", "}"), ("[", "]")):
        start = stripped.find(open_ch)
        if start == -1:
            continue
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(stripped)):
            char = stripped[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char == open_ch:
                depth += 1
            elif char == close_ch:
                depth -= 1
                if depth == 0:
                    candidate = stripped[start : index + 1]
                    try:
                        return json.loads(candidate)
                    except json.JSONDecodeError:
                        break

    try:
        return json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise LLMError(f"Could not parse JSON from model output: {text[:400]}") from exc
