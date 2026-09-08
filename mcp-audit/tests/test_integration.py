"""Offline end-to-end: real MCP Client against an in-process server, plus a
deterministic fake LLM. Covers discovery, generation, the eval loop, resume, and
scoring — with no network."""

from __future__ import annotations

import pytest

from reticle.artifact import evaluated_case_ids, load_artifact, save_artifact
from reticle.connect import discover_from_target
from reticle.evaluate import run_evaluation
from reticle.generate import generate_test_cases
from reticle.models import Config, RunArtifact, Target, ToolSet
from reticle.score import compute_scores

from conftest import FakeLLM


async def test_discovery_inprocess(fake_server):
    disc = await discover_from_target("inproc", "fake-crm", fake_server)
    names = {t.name for t in disc.tools}
    assert names == {"create_record", "update_record", "delete_record"}
    assert disc.server_info.name == "fake-crm"
    assert all(t.has_description for t in disc.tools)


async def test_generate_test_cases():
    llm = FakeLLM(gen_queries=["make a new one", "add another"])
    from reticle.models import ToolRecord

    tools = [ToolRecord(name="create_record", description="Create.", has_description=True)]
    cases, gin, gout = await generate_test_cases(llm, tools, "g", positives_per_tool=2, noise_ratio=0.5)
    positives = [c for c in cases if c.kind == "positive"]
    noise = [c for c in cases if c.kind == "noise"]
    assert len(positives) == 2
    assert all(c.expected_tool == "create_record" for c in positives)
    assert len(noise) >= 1
    assert all(c.expected_tool is None for c in noise)
    assert gin > 0 and gout > 0


def _fresh_artifact(disc) -> RunArtifact:
    from reticle.artifact import tool_set_hash

    return RunArtifact(
        run_id="run",
        target=Target(transport="http", endpoint="fake-crm", server_info=disc.server_info),
        config=Config(
            generation_model="g", eval_model="e", eval_temperature=0.0,
            eval_temperature_applied=True, positives_per_tool=1, noise_ratio=0.0,
            max_concurrency=4, max_retries=3,
        ),
        tool_set=ToolSet(hash=tool_set_hash(disc.tools), count=len(disc.tools), tools=disc.tools),
    )


async def test_eval_loop_and_scoring(fake_server, tmp_path):
    disc = await discover_from_target("inproc", "fake-crm", fake_server)
    a = _fresh_artifact(disc)
    from reticle.models import TestCase

    a.test_cases = [
        TestCase(id="c1", query="create please", expected_tool="create_record", kind="positive", generated_by="g"),
        TestCase(id="c2", query="update please", expected_tool="update_record", kind="positive", generated_by="g"),
        TestCase(id="c3", query="delete please", expected_tool="delete_record", kind="positive", generated_by="g"),
        TestCase(id="c4", query="unrelated weather", expected_tool=None, kind="noise", generated_by="g"),
    ]
    plan = {
        "create please": "create_record",   # hit
        "update please": "create_record",   # wrong_tool (confused with create)
        "delete please": None,              # miss
        "unrelated weather": None,          # correct_reject
    }
    llm = FakeLLM(plan=plan)
    p = tmp_path / "artifact.json"

    await run_evaluation(llm, a, lambda: save_artifact(a, p), concurrency=4, temperature=0.0)
    a.scores = compute_scores(a)

    assert a.scores.total_positives == 3
    assert abs(a.scores.overall_accuracy - 1 / 3) < 1e-9  # 1 hit of 3
    assert a.scores.over_trigger_rate == 0.0
    ur = next(pt for pt in a.scores.per_tool if pt.tool == "update_record")
    assert ur.confused_with == {"create_record": 1}
    # persisted after each case
    assert p.exists()
    assert evaluated_case_ids(load_artifact(p)) == {"c1", "c2", "c3", "c4"}


async def test_negatives_mode_generate_eval_score(fake_server, tmp_path):
    disc = await discover_from_target("inproc", "fake-crm", fake_server)
    a = _fresh_artifact(disc)
    llm = FakeLLM(gen_queries=["near miss one", "near miss two"])
    cases, _, _ = await generate_test_cases(
        llm, disc.tools, "g", positives_per_tool=1, noise_ratio=0.0,
        negatives_per_tool=2,
    )
    negs = [c for c in cases if c.kind == "negative"]
    # 3 tools x 2 negatives
    assert len(negs) == 6
    assert all(c.target_tool in {"create_record", "update_record", "delete_record"} for c in negs)
    assert all(c.expected_tool is None for c in negs)

    a.test_cases = cases
    # Make every negative aimed at create_record wrongly fire it; others avoid.
    plan = {}
    for c in cases:
        if c.kind == "negative":
            plan[c.query] = "create_record" if c.target_tool == "create_record" else None
        else:
            plan[c.query] = c.expected_tool  # positives all hit
    # queries collide across tools (same gen_queries text) -> disambiguate by using
    # the last-writer plan; instead give the fake a per-target rule via marker.
    llm2 = FakeLLM(plan=plan)
    await run_evaluation(llm2, a, lambda: None, concurrency=4, temperature=0.0)
    a.scores = compute_scores(a)
    assert a.scores.total_negatives == 6
    cr = next(pt for pt in a.scores.per_tool if pt.tool == "create_record")
    assert cr.negatives == 2 and cr.false_trigger == 2
    assert cr.false_trigger_rate == 1.0


async def test_resume_skips_done(fake_server, tmp_path):
    disc = await discover_from_target("inproc", "fake-crm", fake_server)
    a = _fresh_artifact(disc)
    from reticle.models import Evaluation, TestCase, Usage

    a.test_cases = [
        TestCase(id="c1", query="q1", expected_tool="create_record", kind="positive", generated_by="g"),
        TestCase(id="c2", query="q2", expected_tool="update_record", kind="positive", generated_by="g"),
    ]
    # c1 already evaluated
    a.evaluations = [
        Evaluation(case_id="c1", picked_tool="create_record", correct=True, outcome="hit", model="e", usage=Usage()),
    ]
    llm = FakeLLM(plan={"q2": "update_record"})
    await run_evaluation(llm, a, lambda: None, concurrency=2, temperature=0.0)
    # only c2 should have been sent to the model
    assert llm.select_calls == 1
    assert len(a.evaluations) == 2
