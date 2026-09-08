#!/usr/bin/env bash
# Audit the official @modelcontextprotocol/server-memory (9 knowledge-graph tools,
# several near-synonyms) — a good real-world target for watching selection break
# down. Requires ANTHROPIC_API_KEY (or `ant auth login`) and npx on PATH.
#
#   ./examples/run-memory-audit.sh            # default: -n 10, negatives 4
#   POSITIVES=15 NEGATIVES=6 ./examples/run-memory-audit.sh
#
# Writes the artifact + report.{md,html} to ./memory-audit/ (gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."

POSITIVES="${POSITIVES:-10}"
NEGATIVES="${NEGATIVES:-4}"
NOISE_RATIO="${NOISE_RATIO:-0.4}"
OUT="${OUT:-./memory-audit}"

exec uv run reticle run \
  --stdio "npx -y @modelcontextprotocol/server-memory" \
  -n "$POSITIVES" \
  --negatives-per-tool "$NEGATIVES" \
  --noise-ratio "$NOISE_RATIO" \
  --out "$OUT" \
  "$@"
