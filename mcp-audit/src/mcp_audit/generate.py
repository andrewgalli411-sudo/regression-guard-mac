"""Test-case synthesis.

Two separate, differently-prompted call types keep judge integrity intact:
- positives: given ONE tool's contract, synthesize realistic user utterances that
  should require it.
- noise: given only the server's capability summary, synthesize plausible but
  out-of-scope requests that no tool should serve (measures over-triggering).

The eval step (evaluate.py) never sees any of this labeling — it receives only the
query and the full tool list, exactly what a real client sees.
"""

from __future__ import annotations

import asyncio
import json
import math
import re

from .llm import LLM
from .models import TestCase, ToolRecord

_JSON_ARRAY = re.compile(r"\[.*\]", re.DOTALL)


def _parse_string_list(text: str) -> list[str]:
    """Extract a JSON array of strings from a model response, tolerating fences."""
    m = _JSON_ARRAY.search(text)
    if not m:
        return []
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return []
    return [str(x).strip() for x in data if isinstance(x, (str, int, float)) and str(x).strip()]


def _positive_prompt(tool: ToolRecord, n: int) -> str:
    desc = tool.description or "(no description provided)"
    schema = json.dumps(tool.input_schema or {}, indent=2)[:2000]
    return (
        f"You are generating an evaluation set for an AI assistant's tool.\n\n"
        f"TOOL NAME: {tool.name}\n"
        f"TOOL DESCRIPTION: {desc}\n"
        f"INPUT SCHEMA:\n{schema}\n\n"
        f"Write {n} distinct, realistic end-user messages that a person would type to "
        f"an assistant and that SHOULD be handled by this tool. Vary phrasing, length, "
        f"specificity, and vocabulary. Write as the user would actually speak — do NOT "
        f"mention the tool's name, the schema, or the word 'tool'. Each message must be "
        f"self-contained.\n\n"
        f"Return ONLY a JSON array of {n} strings, nothing else."
    )


def _noise_prompt(tools: list[ToolRecord], n: int) -> str:
    caps = "\n".join(
        f"- {t.name}: {t.description or '(no description)'}" for t in tools
    )
    return (
        f"An AI assistant has exactly these capabilities:\n{caps}\n\n"
        f"Write {n} distinct, realistic user messages that are OUT OF SCOPE — plausible "
        f"things a user might ask this assistant, but that NONE of the capabilities above "
        f"can actually handle. They should be tempting near-misses and general requests, "
        f"not obviously absurd. Do not mention tool names.\n\n"
        f"Return ONLY a JSON array of {n} strings, nothing else."
    )


async def generate_test_cases(
    llm: LLM,
    tools: list[ToolRecord],
    model: str,
    positives_per_tool: int,
    noise_ratio: float,
    concurrency: int = 8,
) -> tuple[list[TestCase], int, int]:
    """Returns (cases, total_input_tokens, total_output_tokens)."""
    sem = asyncio.Semaphore(concurrency)
    cases: list[TestCase] = []
    counter = 0
    in_tok = 0
    out_tok = 0

    async def gen_positive(tool: ToolRecord):
        async with sem:
            res = await llm.complete_text(
                model, _positive_prompt(tool, positives_per_tool), max_tokens=2048
            )
            return tool, _parse_string_list(res.text)[:positives_per_tool], res

    results = await asyncio.gather(*(gen_positive(t) for t in tools))
    for tool, queries, res in results:
        in_tok += res.input_tokens
        out_tok += res.output_tokens
        for q in queries:
            counter += 1
            cases.append(
                TestCase(
                    id=f"tc_{counter:04d}",
                    query=q,
                    expected_tool=tool.name,
                    kind="positive",
                    generated_by=model,
                )
            )

    total_positives = len(cases)
    noise_n = int(math.ceil(total_positives * noise_ratio)) if noise_ratio > 0 else 0
    if noise_n > 0 and tools:
        res = await llm.complete_text(model, _noise_prompt(tools, noise_n), max_tokens=3072)
        in_tok += res.input_tokens
        out_tok += res.output_tokens
        for q in _parse_string_list(res.text)[:noise_n]:
            counter += 1
            cases.append(
                TestCase(
                    id=f"tc_{counter:04d}",
                    query=q,
                    expected_tool=None,
                    kind="noise",
                    generated_by=model,
                )
            )
    return cases, in_tok, out_tok
