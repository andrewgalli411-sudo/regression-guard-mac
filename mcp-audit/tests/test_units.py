from __future__ import annotations

from mcp_audit.artifact import (
    evaluated_case_ids,
    load_artifact,
    save_artifact,
    tool_set_hash,
)
from mcp_audit.evaluate import _classify, _classify_negative
from mcp_audit.generate import _parse_string_list
from mcp_audit.llm import (
    build_anthropic_tools,
    model_supports_temperature,
    price_for,
    usd_cost,
)
from mcp_audit.models import (
    Config,
    Evaluation,
    RunArtifact,
    Target,
    TestCase,
    ToolRecord,
    ToolSet,
    Usage,
)
from mcp_audit.report import render_html, render_markdown
from mcp_audit.score import compute_scores


def _tools():
    return [
        ToolRecord(name="create_record", description="Create a record.", input_schema={"type": "object"}, has_description=True),
        ToolRecord(name="update_record", description="Update a record.", input_schema={"type": "object"}, has_description=True),
        ToolRecord(name="weird.tool name!", description=None, input_schema={}, has_description=False),
    ]


def test_tool_set_hash_stable_under_reorder():
    a = _tools()
    b = list(reversed(a))
    assert tool_set_hash(a) == tool_set_hash(b)


def test_tool_set_hash_changes_on_description():
    a = _tools()
    b = _tools()
    b[0].description = "Different."
    assert tool_set_hash(a) != tool_set_hash(b)


def test_build_anthropic_tools_sanitizes_and_fixes_schema():
    tools, name_map = build_anthropic_tools(_tools())
    names = [t["name"] for t in tools]
    # invalid chars replaced
    assert "weird_tool_name_" in names
    # maps back to original
    assert name_map["weird_tool_name_"] == "weird.tool name!"
    # missing/empty schema becomes a valid object schema
    weird = next(t for t in tools if t["name"] == "weird_tool_name_")
    assert weird["input_schema"]["type"] == "object"
    # no-description tool omits description key
    assert "description" not in weird


def test_build_anthropic_tools_dedupes():
    tools = [
        ToolRecord(name="a.b", input_schema={}),
        ToolRecord(name="a!b", input_schema={}),
    ]
    at, name_map = build_anthropic_tools(tools)
    names = [t["name"] for t in at]
    assert len(set(names)) == 2  # collision resolved
    assert set(name_map.values()) == {"a.b", "a!b"}


def test_temperature_capability():
    assert model_supports_temperature("claude-haiku-4-5")
    assert not model_supports_temperature("claude-sonnet-5")
    assert not model_supports_temperature("claude-opus-4-8")


def test_pricing():
    assert price_for("claude-haiku-4-5") == (1.0, 5.0)
    assert usd_cost("claude-haiku-4-5", 1_000_000, 1_000_000) == 6.0


def test_classify():
    assert _classify("t", "t") == (True, "hit")
    assert _classify("t", "other") == (False, "wrong_tool")
    assert _classify("t", None) == (False, "miss")
    assert _classify(None, None) == (True, "correct_reject")
    assert _classify(None, "t") == (False, "false_positive")


def test_classify_negative():
    # fired the tool it must not -> false_trigger
    assert _classify_negative("create_record", "create_record") == (False, "false_trigger")
    # picked something else -> avoided (good)
    assert _classify_negative("create_record", "update_record") == (True, "avoided")
    # picked nothing -> avoided (good)
    assert _classify_negative("create_record", None) == (True, "avoided")


def test_scores_with_negatives():
    from mcp_audit.models import Usage as _U

    a = _artifact_with_evals()
    # add 4 negatives aimed at update_record; 1 wrongly fires it
    a.test_cases += [
        TestCase(id=f"n{i}", query=f"nq{i}", expected_tool=None, kind="negative",
                 generated_by="g", target_tool="update_record")
        for i in range(4)
    ]
    picks = ["update_record", "create_record", None, "delete_record"]
    for i, pk in enumerate(picks):
        correct = pk != "update_record"
        a.evaluations.append(
            Evaluation(case_id=f"n{i}", picked_tool=pk, correct=correct,
                       outcome="false_trigger" if not correct else "avoided",
                       model="e", usage=_U())
        )
    s = compute_scores(a)
    assert s.total_negatives == 4
    assert abs(s.negative_false_trigger_rate - 0.25) < 1e-9
    ur = next(pt for pt in s.per_tool if pt.tool == "update_record")
    assert ur.negatives == 4 and ur.false_trigger == 1
    assert abs(ur.false_trigger_rate - 0.25) < 1e-9
    # positives-only accuracy is unchanged by the negatives
    assert s.total_positives == 3


def test_parse_string_list():
    assert _parse_string_list('["a", "b"]') == ["a", "b"]
    assert _parse_string_list('junk ["x"] trailing') == ["x"]
    assert _parse_string_list("not json") == []


def _artifact_with_evals() -> RunArtifact:
    tools = [
        ToolRecord(name="create_record", has_description=True),
        ToolRecord(name="update_record", has_description=True),
    ]
    a = RunArtifact(
        run_id="r1",
        target=Target(transport="http", endpoint="http://x/mcp"),
        config=Config(
            generation_model="g", eval_model="e", eval_temperature=0.0,
            eval_temperature_applied=True, positives_per_tool=2, noise_ratio=0.5,
            max_concurrency=4, max_retries=3,
        ),
        tool_set=ToolSet(hash="h", count=2, tools=tools),
    )
    a.test_cases = [
        TestCase(id="c1", query="q1", expected_tool="create_record", kind="positive", generated_by="g"),
        TestCase(id="c2", query="q2", expected_tool="create_record", kind="positive", generated_by="g"),
        TestCase(id="c3", query="q3", expected_tool="update_record", kind="positive", generated_by="g"),
        TestCase(id="c4", query="q4", expected_tool=None, kind="noise", generated_by="g"),
    ]
    a.evaluations = [
        Evaluation(case_id="c1", picked_tool="create_record", correct=True, outcome="hit", model="e", usage=Usage()),
        Evaluation(case_id="c2", picked_tool="update_record", correct=False, outcome="wrong_tool", model="e", usage=Usage()),
        Evaluation(case_id="c3", picked_tool="update_record", correct=True, outcome="hit", model="e", usage=Usage()),
        Evaluation(case_id="c4", picked_tool="create_record", correct=False, outcome="false_positive", model="e", usage=Usage()),
    ]
    return a


def test_compute_scores():
    a = _artifact_with_evals()
    s = compute_scores(a)
    # 3 positives, 2 hits
    assert s.total_positives == 3
    assert abs(s.overall_accuracy - 2 / 3) < 1e-9
    assert s.total_noise == 1
    assert s.over_trigger_rate == 1.0
    cr = next(pt for pt in s.per_tool if pt.tool == "create_record")
    assert cr.positives == 2 and cr.hit == 1 and cr.wrong_tool == 1
    assert cr.confused_with == {"update_record": 1}
    # worst-first: create_record (0.5) before update_record (1.0)
    assert s.worst_tools[0] == "create_record"


def test_report_renders():
    a = _artifact_with_evals()
    a.scores = compute_scores(a)
    md = render_markdown(a)
    html = render_html(a)
    assert "Overall selection accuracy: 67%" in md
    assert "67%" in html and "confusion" in html.lower()
    assert "create_record" in html


def test_artifact_roundtrip_and_resume(tmp_path):
    a = _artifact_with_evals()
    p = tmp_path / "artifact.json"
    save_artifact(a, p)
    b = load_artifact(p)
    assert b.run_id == a.run_id
    assert evaluated_case_ids(b) == {"c1", "c2", "c3", "c4"}
