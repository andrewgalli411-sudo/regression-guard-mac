"""Render a run artifact into a one-page Markdown + standalone HTML report.

The report is derived entirely from the artifact. HTML is self-contained (inline
CSS, no external assets) so it screenshots cleanly into a cold email.
"""

from __future__ import annotations

import html
from dataclasses import dataclass

from .models import RunArtifact


@dataclass
class FailExample:
    tool: str
    query: str
    picked: str
    outcome: str


def _pct(x: float) -> str:
    return f"{x * 100:.0f}%"


def failing_examples(artifact: RunArtifact, per_tool_limit: int = 3) -> list[FailExample]:
    evals = {e.case_id: e for e in artifact.evaluations}
    by_case = {c.id: c for c in artifact.test_cases}
    out: list[FailExample] = []
    for tool in artifact.scores.worst_tools:
        got = 0
        for c in artifact.test_cases:
            if c.expected_tool != tool:
                continue
            ev = evals.get(c.id)
            if ev is None or ev.error is not None or ev.outcome == "hit":
                continue
            picked = ev.picked_tool if ev.picked_tool else "(no tool picked)"
            out.append(FailExample(tool, c.query, picked, ev.outcome))
            got += 1
            if got >= per_tool_limit:
                break
    return out


def render_markdown(artifact: RunArtifact) -> str:
    s = artifact.scores
    t = artifact.target
    server = t.server_info.name or t.endpoint
    lines: list[str] = []
    lines.append(f"# MCP Tool-Selection Audit — {server}")
    lines.append("")
    lines.append(
        f"**Overall selection accuracy: {_pct(s.overall_accuracy)}** "
        f"across {s.total_positives} in-scope queries over {artifact.tool_set.count} tools."
    )
    if s.total_noise:
        lines.append("")
        lines.append(
            f"Over-triggering on out-of-scope queries: {_pct(s.over_trigger_rate)} "
            f"({s.total_noise} noise queries)."
        )
    if s.total_negatives:
        lines.append("")
        lines.append(
            f"False-trigger rate on adversarial near-misses: "
            f"{_pct(s.negative_false_trigger_rate)} ({s.total_negatives} negatives)."
        )
    lines.append("")
    lines.append(
        f"_Eval model: `{artifact.config.eval_model}` "
        f"(temperature {'applied' if artifact.config.eval_temperature_applied else 'not supported by model'}). "
        f"Generation model: `{artifact.config.generation_model}`. "
        f"Tool-set hash: `{artifact.tool_set.hash[:12]}`._"
    )
    lines.append("")
    show_neg = s.total_negatives > 0
    lines.append("## Per-tool accuracy (worst first)")
    lines.append("")
    if show_neg:
        lines.append("| Tool | Picked correctly | Wrong tool | Missed | False-trigger | n |")
        lines.append("|---|---|---|---|---|---|")
    else:
        lines.append("| Tool | Picked correctly | Wrong tool | Missed | n |")
        lines.append("|---|---|---|---|---|")
    for pt in s.per_tool:
        if pt.positives == 0 and pt.negatives == 0:
            continue
        top_conf = ""
        if pt.confused_with:
            k, v = next(iter(pt.confused_with.items()))
            top_conf = f" (→ `{k}` {_pct(v / pt.positives)})" if pt.positives else ""
        hit = _pct(pt.hit_rate) if pt.positives else "—"
        wrong = f"{_pct(pt.wrong_tool_rate)}{top_conf}" if pt.positives else "—"
        miss = _pct(pt.miss_rate) if pt.positives else "—"
        if show_neg:
            ft = f"{_pct(pt.false_trigger_rate)} of {pt.negatives}" if pt.negatives else "—"
            lines.append(
                f"| `{pt.tool}` | {hit} | {wrong} | {miss} | {ft} | {pt.positives} |"
            )
        else:
            lines.append(f"| `{pt.tool}` | {hit} | {wrong} | {miss} | {pt.positives} |")
    lines.append("")

    if s.confusion_matrix:
        lines.append("## Confusion matrix")
        lines.append("")
        lines.append("Rows = intended tool; entries = what got picked instead.")
        lines.append("")
        for tool, conf in s.confusion_matrix.items():
            parts = ", ".join(f"`{k}` ×{v}" for k, v in conf.items())
            lines.append(f"- `{tool}` → {parts}")
        lines.append("")

    fails = failing_examples(artifact)
    if fails:
        lines.append("## Concrete failures (worst 3 tools)")
        lines.append("")
        current = None
        for f in fails:
            if f.tool != current:
                current = f.tool
                lines.append(f"### `{f.tool}`")
            lines.append(f'- "{f.query}" → **{f.picked}** ({f.outcome})')
        lines.append("")
    return "\n".join(lines)


_CSS = """
:root { color-scheme: light dark; }
body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  max-width: 820px; margin: 2rem auto; padding: 0 1.2rem; line-height: 1.5;
  color: #1a1a1a; background: #fff; }
h1 { font-size: 1.6rem; margin-bottom: .2rem; }
h2 { font-size: 1.15rem; margin-top: 1.8rem; border-bottom: 1px solid #e5e5e5; padding-bottom: .3rem; }
h3 { font-size: 1rem; margin-bottom: .3rem; }
.headline { font-size: 1.35rem; font-weight: 700; margin: 1rem 0; }
.headline .num { color: #b00020; }
.meta { color: #666; font-size: .85rem; }
table { border-collapse: collapse; width: 100%; font-size: .9rem; margin: .6rem 0; }
th, td { border: 1px solid #e0e0e0; padding: .4rem .6rem; text-align: left; }
th { background: #f6f6f6; }
code { background: #f2f2f2; padding: .1rem .3rem; border-radius: 3px; font-size: .85em; }
.bar { display: inline-block; height: .8rem; background: #b00020; border-radius: 2px; vertical-align: middle; }
.bar-bg { display: inline-block; width: 90px; background: #eee; border-radius: 2px; margin-right: .4rem; }
.fail { color: #b00020; font-weight: 600; }
li { margin: .2rem 0; }
"""


def render_html(artifact: RunArtifact) -> str:
    s = artifact.scores
    t = artifact.target
    server = html.escape(t.server_info.name or t.endpoint)

    def esc(x: str) -> str:
        return html.escape(str(x))

    show_neg = s.total_negatives > 0
    rows = []
    for pt in s.per_tool:
        if pt.positives == 0 and pt.negatives == 0:
            continue
        width = int(pt.hit_rate * 90)
        conf = ""
        if pt.confused_with and pt.positives:
            k, v = next(iter(pt.confused_with.items()))
            conf = f" <span class='meta'>→ <code>{esc(k)}</code> {_pct(v / pt.positives)}</span>"
        neg_cell = ""
        if show_neg:
            ft = (
                f"{_pct(pt.false_trigger_rate)} <span class='meta'>of {pt.negatives}</span>"
                if pt.negatives
                else "—"
            )
            neg_cell = f"<td>{ft}</td>"
        rows.append(
            f"<tr><td><code>{esc(pt.tool)}</code></td>"
            f"<td><span class='bar-bg'><span class='bar' style='width:{width}px'></span></span>"
            f"{_pct(pt.hit_rate)}</td>"
            f"<td>{_pct(pt.wrong_tool_rate)}{conf}</td>"
            f"<td>{_pct(pt.miss_rate)}</td>{neg_cell}<td>{pt.positives}</td></tr>"
        )

    conf_html = ""
    if s.confusion_matrix:
        items = []
        for tool, conf in s.confusion_matrix.items():
            parts = ", ".join(f"<code>{esc(k)}</code> ×{v}" for k, v in conf.items())
            items.append(f"<li><code>{esc(tool)}</code> → {parts}</li>")
        conf_html = (
            "<h2>Confusion matrix</h2>"
            "<p class='meta'>Rows = intended tool; entries = what got picked instead.</p>"
            f"<ul>{''.join(items)}</ul>"
        )

    fails = failing_examples(artifact)
    fails_html = ""
    if fails:
        blocks = []
        current = None
        buf: list[str] = []
        for f in fails:
            if f.tool != current:
                if buf:
                    blocks.append(f"<ul>{''.join(buf)}</ul>")
                    buf = []
                current = f.tool
                blocks.append(f"<h3><code>{esc(f.tool)}</code></h3>")
            buf.append(
                f"<li>“{esc(f.query)}” → "
                f"<span class='fail'>{esc(f.picked)}</span> "
                f"<span class='meta'>({esc(f.outcome)})</span></li>"
            )
        if buf:
            blocks.append(f"<ul>{''.join(buf)}</ul>")
        fails_html = "<h2>Concrete failures (worst 3 tools)</h2>" + "".join(blocks)

    over = ""
    if s.total_noise:
        over = (
            f"<p class='meta'>Over-triggering on out-of-scope queries: "
            f"{_pct(s.over_trigger_rate)} of {s.total_noise} noise queries.</p>"
        )
    if s.total_negatives:
        over += (
            f"<p class='meta'>False-trigger rate on adversarial near-misses: "
            f"{_pct(s.negative_false_trigger_rate)} of {s.total_negatives} negatives.</p>"
        )

    temp_note = (
        "applied" if artifact.config.eval_temperature_applied else "not supported by model"
    )
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MCP Tool-Selection Audit — {server}</title>
<style>{_CSS}</style></head><body>
<h1>MCP Tool-Selection Audit</h1>
<p class="meta">{server}</p>
<p class="headline">Overall selection accuracy:
<span class="num">{_pct(s.overall_accuracy)}</span>
<span class="meta">across {s.total_positives} queries over {artifact.tool_set.count} tools</span></p>
{over}
<p class="meta">Eval model: <code>{esc(artifact.config.eval_model)}</code>
(temperature {temp_note}) · Generation: <code>{esc(artifact.config.generation_model)}</code>
· Tool-set hash <code>{esc(artifact.tool_set.hash[:12])}</code></p>
<h2>Per-tool accuracy (worst first)</h2>
<table><thead><tr><th>Tool</th><th>Picked correctly</th><th>Wrong tool</th><th>Missed</th>{"<th>False-trigger</th>" if show_neg else ""}<th>n</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table>
{conf_html}
{fails_html}
</body></html>"""
