"""Evaluation loop: for each query, one fresh single-turn tool-selection call with
the FULL tool list and tool_choice=auto. We record which tool the model picked (or
none); we never execute the tool. Bounded concurrency, live progress, and per-case
persistence so a crash is resumable.
"""

from __future__ import annotations

import asyncio
import time

from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    TextColumn,
    TimeElapsedColumn,
)

from .llm import LLM, build_anthropic_tools
from .models import Evaluation, RunArtifact, TestCase, Usage


def _classify(expected: str | None, picked: str | None) -> tuple[bool, str]:
    if expected is None:  # noise: should pick nothing
        if picked is None:
            return True, "correct_reject"
        return False, "false_positive"
    if picked is None:
        return False, "miss"
    if picked == expected:
        return True, "hit"
    return False, "wrong_tool"


def _classify_negative(target: str | None, picked: str | None) -> tuple[bool, str]:
    """A negative is correct as long as it did NOT fire the tool it targets."""
    if picked == target:
        return False, "false_trigger"
    return True, "avoided"


async def _eval_one(
    llm: LLM,
    model: str,
    case: TestCase,
    anthropic_tools: list[dict],
    name_map: dict[str, str],
    temperature: float | None,
) -> Evaluation:
    start = time.monotonic()
    try:
        res = await llm.select_tool(model, case.query, anthropic_tools, temperature)
    except Exception as e:  # noqa: BLE001 - record, don't crash the sweep
        return Evaluation(
            case_id=case.id,
            outcome="miss",
            model=model,
            temperature=temperature,
            error=f"{type(e).__name__}: {e}",
            latency_ms=int((time.monotonic() - start) * 1000),
        )
    # First tool_use block is the selection (tool_choice=auto yields at most one
    # unless the model parallel-calls; we treat the first as the pick).
    picked_sanitized = res.picked_names[0] if res.picked_names else None
    picked = name_map.get(picked_sanitized, picked_sanitized) if picked_sanitized else None
    if case.kind == "negative":
        correct, outcome = _classify_negative(case.target_tool, picked)
    else:
        correct, outcome = _classify(case.expected_tool, picked)
    excerpt = (
        f"tool_use:{picked} input={res.inputs[0]}" if res.picked_names else res.text[:300]
    )
    return Evaluation(
        case_id=case.id,
        picked_tool=picked,
        correct=correct,
        outcome=outcome,
        raw_stop_reason=res.stop_reason,
        raw_response_excerpt=excerpt[:300],
        model=model,
        temperature=temperature,
        attempts=res.attempts,
        latency_ms=int((time.monotonic() - start) * 1000),
        usage=Usage(input_tokens=res.input_tokens, output_tokens=res.output_tokens),
    )


async def run_evaluation(
    llm: LLM,
    artifact: RunArtifact,
    persist,  # callable() -> None, saves artifact
    concurrency: int,
    temperature: float | None,
    console=None,
) -> None:
    """Evaluate all not-yet-evaluated cases, appending results to the artifact and
    persisting after each completion. Safe to call again to resume."""
    model = artifact.config.eval_model
    anthropic_tools, name_map = build_anthropic_tools(artifact.tool_set.tools)

    done = {e.case_id for e in artifact.evaluations if e.error is None}
    pending = [c for c in artifact.test_cases if c.id not in done]
    if not pending:
        return

    sem = asyncio.Semaphore(concurrency)
    lock = asyncio.Lock()

    progress = Progress(
        TextColumn("[bold blue]evaluating"),
        BarColumn(),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        console=console,
        transient=False,
    )
    task_id = progress.add_task("eval", total=len(pending))

    async def worker(case: TestCase) -> None:
        async with sem:
            ev = await _eval_one(llm, model, case, anthropic_tools, name_map, temperature)
        async with lock:
            # Drop any prior errored eval for this case, then append the fresh one.
            artifact.evaluations = [e for e in artifact.evaluations if e.case_id != case.id]
            artifact.evaluations.append(ev)
            artifact.cost.input_tokens += ev.usage.input_tokens
            artifact.cost.output_tokens += ev.usage.output_tokens
            persist()
            progress.advance(task_id)

    with progress:
        await asyncio.gather(*(worker(c) for c in pending))
