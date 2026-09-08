"""Scoring: a pure function from artifact -> Scores. No model calls, no I/O.

Because the eval always presents the full tool list, every positive-for-B is
automatically a distractor for every other tool, so a single labeled set yields
both per-tool hit rates and the cross-tool confusion matrix.
"""

from __future__ import annotations

from .models import PerToolScore, RunArtifact, Scores


def compute_scores(artifact: RunArtifact) -> Scores:
    evals = {e.case_id: e for e in artifact.evaluations}
    cases = artifact.test_cases

    def _new_bucket() -> dict:
        return {
            "positives": 0, "hit": 0, "wrong_tool": 0, "miss": 0, "confused_with": {},
            "negatives": 0, "false_trigger": 0,
        }

    # tool -> counters
    per: dict[str, dict] = {t.name: _new_bucket() for t in artifact.tool_set.tools}
    total_positive = 0
    total_hit = 0
    total_noise = 0
    false_positive = 0
    total_negative = 0
    total_false_trigger = 0

    for c in cases:
        ev = evals.get(c.id)
        if ev is None or ev.error is not None:
            continue
        if c.kind == "negative":  # adversarial near-miss aimed at c.target_tool
            total_negative += 1
            bucket = per.setdefault(c.target_tool, _new_bucket()) if c.target_tool else None
            if bucket is not None:
                bucket["negatives"] += 1
                if ev.outcome == "false_trigger":
                    bucket["false_trigger"] += 1
                    total_false_trigger += 1
            continue
        if c.expected_tool is None:  # noise
            total_noise += 1
            if ev.outcome == "false_positive":
                false_positive += 1
            continue
        # positive
        bucket = per.setdefault(
            c.expected_tool,
            {"positives": 0, "hit": 0, "wrong_tool": 0, "miss": 0, "confused_with": {}},
        )
        bucket["positives"] += 1
        total_positive += 1
        if ev.outcome == "hit":
            bucket["hit"] += 1
            total_hit += 1
        elif ev.outcome == "wrong_tool":
            bucket["wrong_tool"] += 1
            if ev.picked_tool:
                cw = bucket["confused_with"]
                cw[ev.picked_tool] = cw.get(ev.picked_tool, 0) + 1
        elif ev.outcome == "miss":
            bucket["miss"] += 1

    per_tool: list[PerToolScore] = []
    confusion: dict[str, dict[str, int]] = {}
    for name, b in per.items():
        p = b["positives"]
        neg = b["negatives"]
        per_tool.append(
            PerToolScore(
                tool=name,
                positives=p,
                hit=b["hit"],
                wrong_tool=b["wrong_tool"],
                miss=b["miss"],
                hit_rate=(b["hit"] / p) if p else 0.0,
                wrong_tool_rate=(b["wrong_tool"] / p) if p else 0.0,
                miss_rate=(b["miss"] / p) if p else 0.0,
                confused_with=dict(
                    sorted(b["confused_with"].items(), key=lambda kv: -kv[1])
                ),
                negatives=neg,
                false_trigger=b["false_trigger"],
                false_trigger_rate=(b["false_trigger"] / neg) if neg else 0.0,
            )
        )
        if b["confused_with"]:
            confusion[name] = dict(
                sorted(b["confused_with"].items(), key=lambda kv: -kv[1])
            )

    # Worst-first: lowest hit-rate among tools that actually have positives.
    scored = [pt for pt in per_tool if pt.positives > 0]
    scored.sort(key=lambda pt: (pt.hit_rate, -pt.positives))
    per_tool.sort(key=lambda pt: (pt.hit_rate, -pt.positives))
    worst = [pt.tool for pt in scored[:3]]

    return Scores(
        overall_accuracy=(total_hit / total_positive) if total_positive else 0.0,
        over_trigger_rate=(false_positive / total_noise) if total_noise else 0.0,
        negative_false_trigger_rate=(
            (total_false_trigger / total_negative) if total_negative else 0.0
        ),
        total_positives=total_positive,
        total_noise=total_noise,
        total_negatives=total_negative,
        per_tool=per_tool,
        confusion_matrix=confusion,
        worst_tools=worst,
    )
