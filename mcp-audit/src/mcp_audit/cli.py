"""mcp-audit CLI.

    mcp-audit run  --http URL | --stdio "cmd args"   -> connect, generate, evaluate, report
    mcp-audit report ARTIFACT.json                    -> re-render a report from an artifact
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path

import typer
from rich.console import Console

from . import artifact as art
from .connect import ConnectionError_, discover
from .evaluate import run_evaluation
from .generate import (
    _negative_prompt,
    _noise_prompt,
    _positive_prompt,
    generate_test_cases,
)
from .llm import LLM, model_supports_temperature, usd_cost
from .models import Config, RunArtifact, Target, ToolSet
from .report import render_html, render_markdown
from .score import compute_scores

app = typer.Typer(add_completion=False, help="Audit MCP tool-selection reliability.")
console = Console()

GEN_MODEL_DEFAULT = "claude-sonnet-5"
EVAL_MODEL_DEFAULT = "claude-haiku-4-5"


async def _estimate_cost(
    llm: LLM,
    tools,
    cases_count: int,
    positives_per_tool: int,
    noise_n: int,
    negatives_per_tool: int,
    gen_model: str,
    eval_model: str,
    anthropic_tools,
    have_cached_cases: bool,
) -> tuple[float, float]:
    """Return (gen_usd, eval_usd). Uses count_tokens (free) on representative
    requests; output sizes are estimated conservatively."""
    gen_usd = 0.0
    if not have_cached_cases and tools:
        sample_in = await llm.count_input_tokens(
            gen_model, [{"role": "user", "content": _positive_prompt(tools[0], positives_per_tool)}]
        )
        noise_in = await llm.count_input_tokens(
            gen_model, [{"role": "user", "content": _noise_prompt(tools, max(noise_n, 1))}]
        )
        gen_in = sample_in * len(tools) + noise_in
        gen_out = len(tools) * positives_per_tool * 25 + noise_n * 25
        if negatives_per_tool > 0 and len(tools) > 1:
            neg_in = await llm.count_input_tokens(
                gen_model,
                [{"role": "user", "content": _negative_prompt(tools[0], tools[1:], negatives_per_tool)}],
            )
            gen_in += neg_in * len(tools)
            gen_out += len(tools) * negatives_per_tool * 25
        gen_usd = usd_cost(gen_model, gen_in, gen_out)

    eval_usd = 0.0
    if cases_count and tools:
        sample_query = "Please help me with a moderately detailed request about my data."
        per_eval_in = await llm.count_input_tokens(
            eval_model, [{"role": "user", "content": sample_query}], tools=anthropic_tools
        )
        eval_in = per_eval_in * cases_count
        eval_out = cases_count * 60
        eval_usd = usd_cost(eval_model, eval_in, eval_out)
    return gen_usd, eval_usd


async def _run(
    http, stdio, gen_model, eval_model, positives, noise_ratio, negatives, concurrency,
    temperature, max_retries, out_dir, cache_dir, yes, cost_threshold, fresh,
):
    # 1. Connect + discover tools
    console.print("[bold]Connecting to MCP server…[/bold]")
    try:
        disc = await discover(http, stdio)
    except ConnectionError_ as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1)
    if not disc.tools:
        console.print("[red]Server exposed no tools — nothing to audit.[/red]")
        raise typer.Exit(1)
    console.print(
        f"Connected to [green]{disc.server_info.name or disc.endpoint}[/green] — "
        f"{len(disc.tools)} tools."
    )
    no_desc = [t.name for t in disc.tools if not t.has_description]
    if no_desc:
        console.print(f"[yellow]{len(no_desc)} tool(s) have no description.[/yellow]")

    hash_ = art.tool_set_hash(disc.tools)
    tool_set = ToolSet(hash=hash_, count=len(disc.tools), tools=disc.tools)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = out_dir / "artifact.json"

    temp_applied = model_supports_temperature(eval_model)
    eff_temp = temperature if temp_applied else None

    # 2. Resume an existing artifact iff same tool set
    artifact = None
    if artifact_path.exists() and not fresh:
        try:
            existing = art.load_artifact(artifact_path)
            if existing.tool_set.hash == hash_:
                artifact = existing
                console.print(
                    f"[cyan]Resuming: {len(art.evaluated_case_ids(existing))}/"
                    f"{len(existing.test_cases)} cases already evaluated.[/cyan]"
                )
        except Exception:  # noqa: BLE001
            artifact = None

    if artifact is None:
        artifact = RunArtifact(
            run_id=str(uuid.uuid4()),
            target=Target(
                transport=disc.transport, endpoint=disc.endpoint, server_info=disc.server_info
            ),
            config=Config(
                generation_model=gen_model,
                eval_model=eval_model,
                eval_temperature=temperature,
                eval_temperature_applied=temp_applied,
                positives_per_tool=positives,
                noise_ratio=noise_ratio,
                negatives_per_tool=negatives,
                max_concurrency=concurrency,
                max_retries=max_retries,
            ),
            tool_set=tool_set,
        )

    llm = LLM.create(max_retries=max_retries)

    # 3. Test cases: cache -> artifact -> generate
    from .llm import build_anthropic_tools

    anthropic_tools, _ = build_anthropic_tools(disc.tools)
    # Cache key includes generation params so changing -n / noise / negatives / model
    # regenerates rather than silently reusing a stale set.
    cache_key = (
        f"{hash_}_{gen_model}_p{positives}_nr{noise_ratio}_neg{negatives}".replace("/", "_")
    )
    cached = art.load_cached_cases(Path(cache_dir), cache_key)
    have_cached = bool(cached) or bool(artifact.test_cases)
    if not artifact.test_cases and cached:
        artifact.test_cases = cached

    import math

    noise_n = int(math.ceil(len(disc.tools) * positives * noise_ratio)) if noise_ratio > 0 else 0
    neg_total = negatives * len(disc.tools) if negatives > 0 and len(disc.tools) > 1 else 0
    cases_count = len(artifact.test_cases) or (
        len(disc.tools) * positives + noise_n + neg_total
    )

    # 4. Cost guardrail
    gen_usd, eval_usd = await _estimate_cost(
        llm, disc.tools, cases_count, positives, noise_n, negatives, gen_model, eval_model,
        anthropic_tools, have_cached,
    )
    total_est = gen_usd + eval_usd
    artifact.cost.estimated_usd = round(total_est, 4)
    console.print(
        f"\n[bold]Estimated spend[/bold]: generation ${gen_usd:.3f} + "
        f"evaluation ${eval_usd:.3f} = [bold]${total_est:.3f}[/bold] "
        f"(~{cases_count} eval queries)."
    )
    if total_est > cost_threshold and not yes:
        if not typer.confirm(f"This exceeds the ${cost_threshold:.2f} threshold. Proceed?"):
            console.print("Aborted.")
            raise typer.Exit(0)

    def persist():
        art.save_artifact(artifact, artifact_path)

    # 5. Generate (if needed)
    gen_in = gen_out = 0
    if not artifact.test_cases:
        artifact.status = "generating"
        persist()
        console.print("[bold]Generating test cases…[/bold]")
        cases, gen_in, gen_out = await generate_test_cases(
            llm, disc.tools, gen_model, positives, noise_ratio, concurrency,
            negatives_per_tool=negatives,
        )
        if not cases:
            console.print("[red]Generation produced no test cases.[/red]")
            artifact.status = "failed"
            persist()
            raise typer.Exit(1)
        artifact.test_cases = cases
        art.save_cached_cases(Path(cache_dir), cache_key, cases)
        console.print(f"Generated {len(cases)} test cases.")

    # 6. Evaluate
    artifact.status = "evaluating"
    persist()
    await run_evaluation(llm, artifact, persist, concurrency, eff_temp, console=console)

    # 7. Score + finalize. artifact.cost.{input,output}_tokens hold EVAL totals
    # (accumulated per-case in run_evaluation); generation tokens are priced with
    # the generation model separately, then folded into the totals.
    artifact.scores = compute_scores(artifact)
    eval_usd_actual = usd_cost(
        eval_model, artifact.cost.input_tokens, artifact.cost.output_tokens
    )
    gen_usd_actual = usd_cost(gen_model, gen_in, gen_out)
    artifact.cost.actual_usd = round(eval_usd_actual + gen_usd_actual, 4)
    artifact.cost.input_tokens += gen_in
    artifact.cost.output_tokens += gen_out
    errored = [e for e in artifact.evaluations if e.error]
    artifact.status = "complete" if not errored else "partial"
    artifact.completed_at = datetime.now(timezone.utc).isoformat()
    persist()

    # 8. Report
    md = render_markdown(artifact)
    html_ = render_html(artifact)
    (out_dir / "report.md").write_text(md, encoding="utf-8")
    (out_dir / "report.html").write_text(html_, encoding="utf-8")

    s = artifact.scores
    console.print(
        f"\n[bold green]Overall selection accuracy: {s.overall_accuracy * 100:.0f}%[/bold green] "
        f"over {s.total_positives} queries."
    )
    if errored:
        console.print(f"[yellow]{len(errored)} queries errored after retries (status: partial).[/yellow]")
    console.print(f"Artifact: {artifact_path}")
    console.print(f"Report:   {out_dir / 'report.html'}  (+ report.md)")


@app.command()
def run(
    http: str = typer.Option(None, "--http", help="Streamable-HTTP MCP server URL."),
    stdio: str = typer.Option(None, "--stdio", help='Stdio server command, e.g. "python server.py".'),
    eval_model: str = typer.Option(EVAL_MODEL_DEFAULT, help="Model under test (the tool picker)."),
    gen_model: str = typer.Option(GEN_MODEL_DEFAULT, help="Model that synthesizes test cases."),
    positives: int = typer.Option(10, "-n", "--positives", help="Positive queries per tool."),
    noise_ratio: float = typer.Option(0.5, help="Out-of-scope noise queries as a fraction of positives."),
    negatives: int = typer.Option(
        0, "--negatives-per-tool",
        help="Adversarial per-tool near-misses that must NOT trigger that tool (0 = off).",
    ),
    concurrency: int = typer.Option(8, help="Max concurrent eval calls."),
    temperature: float = typer.Option(0.0, help="Eval temperature (applied only if the model supports it)."),
    max_retries: int = typer.Option(6, help="Max retries per Claude call (exponential backoff)."),
    out_dir: str = typer.Option("./mcp-audit-run", "--out", help="Output directory."),
    cache_dir: str = typer.Option("./.mcp-audit-cache", help="Test-case cache directory."),
    yes: bool = typer.Option(False, "--yes", "-y", help="Skip the cost confirmation."),
    cost_threshold: float = typer.Option(2.0, help="Confirm before spending above this (USD)."),
    fresh: bool = typer.Option(False, help="Ignore an existing artifact and start over."),
):
    """Connect to an MCP server and audit tool-selection reliability."""
    import anthropic

    try:
        asyncio.run(
            _run(
                http, stdio, gen_model, eval_model, positives, noise_ratio, negatives,
                concurrency, temperature, max_retries, out_dir, cache_dir, yes,
                cost_threshold, fresh,
            )
        )
    except (anthropic.AuthenticationError, TypeError) as e:
        # AsyncAnthropic() with no resolvable credential raises TypeError at
        # construction; a rejected key raises AuthenticationError at call time.
        if isinstance(e, TypeError) and "authentication method" not in str(e):
            raise
        console.print(
            "[red]No Anthropic credentials found.[/red] Set ANTHROPIC_API_KEY "
            "(or run `ant auth login`) and retry."
        )
        raise typer.Exit(2)


@app.command()
def report(artifact_json: str = typer.Argument(..., help="Path to a run artifact.json.")):
    """Re-render Markdown + HTML from an existing artifact (no model calls)."""
    path = Path(artifact_json)
    artifact = art.load_artifact(path)
    if not artifact.scores.per_tool:
        artifact.scores = compute_scores(artifact)
    out_dir = path.parent
    (out_dir / "report.md").write_text(render_markdown(artifact), encoding="utf-8")
    (out_dir / "report.html").write_text(render_html(artifact), encoding="utf-8")
    console.print(f"Wrote {out_dir / 'report.md'} and {out_dir / 'report.html'}")


if __name__ == "__main__":
    app()
