<img src="assets/reticle-mark.svg" alt="reticle" width="72" align="left">

# reticle

**Does the model aim at the right tool?** Measure how reliably an LLM picks the **right** tool from an MCP server. Connect to
any MCP server (stdio or streamable HTTP), synthesize realistic user queries, ask a
fresh model to pick a tool for each (`tool_choice=auto`, **selection only — tools are
never executed**), and emit a one-page report: overall accuracy, per-tool hit/wrong/miss
rates, a confusion matrix, and concrete failing queries.

v1 is **measurement + report only** — no description rewriting, no optimizer, no fix loop.

## Install

```bash
cd reticle
uv sync
export ANTHROPIC_API_KEY=sk-ant-...   # or `ant auth login`
```

## Run

```bash
# HTTP (streamable) server
uv run reticle run --http https://their-server.example/mcp

# stdio server
uv run reticle run --stdio "python their_server.py" -n 10 --yes

# re-render a report from a saved artifact (no model calls)
uv run reticle report ./reticle-run/artifact.json

# smoke-test end-to-end against the bundled example server (needs your API key)
uv run reticle run --stdio "python examples/demo_server.py" -n 5 --negatives-per-tool 3 --yes

# audit a real public server (9 confusable tools) — see the committed sample output
./examples/run-memory-audit.sh --yes
```

A real sample audit lives in [`examples/sample-memory-server/`](examples/sample-memory-server/)
(the official memory server, 81% selection accuracy).

Outputs land in `--out` (default `./reticle-run/`): `artifact.json`, `report.md`,
`report.html`. Screenshot `report.html` into a cold email.

### Key flags

| Flag | Default | Notes |
|---|---|---|
| `--eval-model` | `claude-haiku-4-5` | The model under test. Temperature is applied only if the model supports it. |
| `--gen-model` | `claude-sonnet-5` | Synthesizes test cases (separate prompt — never leaks the answer to the eval). |
| `-n / --positives` | 10 | Positive queries per tool. |
| `--noise-ratio` | 0.5 | Out-of-scope queries (as a fraction of positives) to measure over-triggering. |
| `--negatives-per-tool` | 0 | Opt-in: adversarial per-tool near-misses that must *not* fire that tool. Adds a per-tool false-trigger rate (a precision axis the confusion matrix can't show). |
| `--temperature` | 0.0 | Ignored by models that reject the param (recorded as `eval_temperature_applied: false`). |
| `--concurrency` | 8 | Bounded concurrent eval calls. |
| `--cost-threshold` | 2.0 | Confirm before spending above this (USD); `--yes` skips the prompt. |

## How it works

1. **Connect** — MCP Python SDK **v2** `Client` (URL → streamable HTTP; `StdioServerParameters`
   → subprocess); tools paginated via `next_cursor`.
2. **Generate** — per-tool positive queries + a pool of out-of-scope noise (and, with
   `--negatives-per-tool`, adversarial near-misses aimed at each tool). Cached on disk,
   keyed by the tool set **and** the generation parameters, so re-runs are free but a
   changed `-n` / noise / negatives / model regenerates.
3. **Evaluate** — one single-turn Claude call per query with the full tool list and
   `tool_choice=auto`. Bounded concurrency, live progress, every call retried with
   exponential backoff, and each result persisted immediately → **resumable** after a crash.
4. **Score** — per-tool hit / wrong-tool / miss rates + confusion matrix, derived purely
   from the artifact.
5. **Report** — Markdown + standalone HTML (worst tools first, 3 concrete failures each).

Every query, the tool-set hash, model strings, temperature, and each raw model choice are
dumped to `artifact.json`. **The report is always derived from that artifact, never from
memory** — so a run is reproducible and resumable.

## Engineering guarantees

- **Judge integrity:** generation and evaluation are separate calls with separate prompts.
  The eval sees only the query + the tool list a real client would see.
- **Cost guardrail:** spend is estimated (via `count_tokens`) and printed before any paid
  call; runs above the threshold require confirmation.
- **Messy reality:** missing descriptions, invalid/duplicate tool names, 50+ tool lists,
  and unreachable servers all degrade with clear errors instead of crashing.

## Test

```bash
uv run pytest
```

The suite runs fully offline: a real MCP `Client` against an in-process server plus a
deterministic fake model — covering discovery, generation, the eval loop, resume, scoring,
and report rendering.

## Notes / assumptions

- Requires **MCP Python SDK ≥ 2.2** (the v2 rework) and **Anthropic SDK ≥ 1.4**.
- HTTP support is **streamable HTTP** (the v2 transport). Legacy SSE-only servers won't
  connect and report a clear error.
- `claude-sonnet-5` and the whole 4.6+/5 generation reject `temperature`; that's why the
  default eval model is `claude-haiku-4-5` (accepts `temperature=0` → reproducible runs).
