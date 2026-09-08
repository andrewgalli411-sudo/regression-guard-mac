"""Anthropic client wrapper: retry/backoff, temperature capability guard, tool
preparation, pricing, and token estimation.

We disable the SDK's built-in retries and own the loop ourselves so backoff is
explicit and a run stays resumable: a rate-limit or 5xx never kills a 300-query
sweep, and each call's outcome is recorded per-case in the artifact.
"""

from __future__ import annotations

import asyncio
import random
import re
from dataclasses import dataclass

import anthropic
from anthropic import AsyncAnthropic

from .models import ToolRecord

# Retryable transport/5xx/rate-limit errors. Non-retryable (400/401/404) propagate.
RETRYABLE = (
    anthropic.RateLimitError,
    anthropic.APIConnectionError,
    anthropic.APITimeoutError,
    anthropic.InternalServerError,
    anthropic.OverloadedError,
)

# Models on the 4.6+/5 generation reject the `temperature` param (HTTP 400).
# Heuristic deny-list of name substrings; anything else is assumed to accept
# temperature. The artifact records eval_temperature_applied either way.
_NO_TEMPERATURE = (
    "sonnet-5",
    "opus-5",
    "opus-4-6",
    "opus-4-7",
    "opus-4-8",
    "sonnet-4-6",
    "fable-5",
    "mythos-5",
)

# USD per 1M tokens (input, output). Substring match; conservative default.
_PRICES: dict[str, tuple[float, float]] = {
    "haiku-4-5": (1.0, 5.0),
    "sonnet-5": (2.0, 10.0),
    "sonnet-4-6": (3.0, 15.0),
    "opus-5": (5.0, 25.0),
    "opus-4-8": (5.0, 25.0),
    "opus-4-7": (5.0, 25.0),
    "opus-4-6": (5.0, 25.0),
    "fable-5": (10.0, 50.0),
}
_DEFAULT_PRICE = (3.0, 15.0)

_VALID_TOOL_NAME = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")


def model_supports_temperature(model: str) -> bool:
    return not any(s in model for s in _NO_TEMPERATURE)


def price_for(model: str) -> tuple[float, float]:
    for key, price in _PRICES.items():
        if key in model:
            return price
    return _DEFAULT_PRICE


def usd_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    pin, pout = price_for(model)
    return (input_tokens / 1_000_000) * pin + (output_tokens / 1_000_000) * pout


def _sanitize_name(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]", "_", name)[:128]
    return s or "tool"


# Top-level JSON-Schema keys real MCP servers emit that the Messages API's
# input_schema rejects or doesn't want.
_SCHEMA_STRIP_KEYS = ("$schema", "$id", "$ref", "$defs", "definitions", "id")


def _sanitize_schema(schema) -> dict:
    """Coerce an MCP tool's inputSchema into something the Messages API accepts:
    a JSON-Schema object with top-level ``type: object``. We strip only top-level
    dialect/reference keys and never rewrite nested shapes (that would change what
    the model sees). A non-dict or non-object schema degrades to an empty object."""
    if not isinstance(schema, dict) or not schema:
        return {"type": "object", "properties": {}}
    cleaned = {k: v for k, v in schema.items() if k not in _SCHEMA_STRIP_KEYS}
    if cleaned.get("type") != "object":
        cleaned["type"] = "object"
    cleaned.setdefault("properties", {})
    return cleaned


def build_anthropic_tools(
    tools: list[ToolRecord],
) -> tuple[list[dict], dict[str, str]]:
    """Map MCP tools to the Anthropic tool schema a real client would send.

    Returns (anthropic_tools, name_map) where name_map resolves the (possibly
    sanitized/deduped) name the model picks back to the original MCP tool name.
    Handles missing descriptions, invalid characters, and duplicate names.
    """
    out: list[dict] = []
    name_map: dict[str, str] = {}
    used: set[str] = set()
    for t in tools:
        base = t.name if _VALID_TOOL_NAME.match(t.name) else _sanitize_name(t.name)
        candidate = base
        i = 2
        while candidate in used:
            suffix = f"_{i}"
            candidate = base[: 128 - len(suffix)] + suffix
            i += 1
        used.add(candidate)
        name_map[candidate] = t.name

        tool_def: dict = {"name": candidate, "input_schema": _sanitize_schema(t.input_schema)}
        if t.description:
            tool_def["description"] = t.description
        out.append(tool_def)
    return out, name_map


@dataclass
class CallResult:
    picked_names: list[str]  # tool_use block names, in order
    inputs: list[dict]
    stop_reason: str | None
    text: str
    input_tokens: int
    output_tokens: int
    attempts: int


class LLM:
    def __init__(self, client: AsyncAnthropic, max_retries: int = 6):
        self.client = client
        self.max_retries = max_retries

    @classmethod
    def create(cls, max_retries: int = 6) -> "LLM":
        # max_retries=0 on the SDK: we own the retry loop.
        return cls(AsyncAnthropic(max_retries=0), max_retries=max_retries)

    async def _with_retries(self, factory):
        attempt = 0
        while True:
            try:
                return await factory(), attempt + 1
            except RETRYABLE:
                if attempt >= self.max_retries:
                    raise
                delay = min(2.0 * (2**attempt) + random.uniform(0, 1.0), 60.0)
                await asyncio.sleep(delay)
                attempt += 1

    async def count_input_tokens(
        self, model: str, messages: list[dict], tools: list[dict] | None = None
    ) -> int:
        kwargs: dict = {"model": model, "messages": messages}
        if tools:
            kwargs["tools"] = tools
        resp, _ = await self._with_retries(
            lambda: self.client.messages.count_tokens(**kwargs)
        )
        return resp.input_tokens

    async def complete_text(
        self,
        model: str,
        prompt: str,
        max_tokens: int = 2048,
        system: str | None = None,
    ) -> CallResult:
        kwargs: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system
        resp, attempts = await self._with_retries(
            lambda: self.client.messages.create(**kwargs)
        )
        text = "".join(b.text for b in resp.content if b.type == "text")
        return CallResult(
            picked_names=[],
            inputs=[],
            stop_reason=resp.stop_reason,
            text=text,
            input_tokens=resp.usage.input_tokens,
            output_tokens=resp.usage.output_tokens,
            attempts=attempts,
        )

    async def select_tool(
        self,
        model: str,
        query: str,
        tools: list[dict],
        temperature: float | None,
        max_tokens: int = 1024,
    ) -> CallResult:
        """Single-turn tool selection with tool_choice=auto (lets the model pick
        no tool, which is how we detect a 'miss'). Selection only — never executed."""
        kwargs: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": query}],
            "tools": tools,
            "tool_choice": {"type": "auto"},
        }
        # anthropic>=1.x dropped `temperature` from messages.create(); route it
        # through extra_body for the models that still accept sampling params.
        if temperature is not None:
            kwargs["extra_body"] = {"temperature": temperature}
        resp, attempts = await self._with_retries(
            lambda: self.client.messages.create(**kwargs)
        )
        picked = [b.name for b in resp.content if b.type == "tool_use"]
        inputs = [b.input for b in resp.content if b.type == "tool_use"]
        text = "".join(b.text for b in resp.content if b.type == "text")
        return CallResult(
            picked_names=picked,
            inputs=inputs,
            stop_reason=resp.stop_reason,
            text=text,
            input_tokens=resp.usage.input_tokens,
            output_tokens=resp.usage.output_tokens,
            attempts=attempts,
        )
