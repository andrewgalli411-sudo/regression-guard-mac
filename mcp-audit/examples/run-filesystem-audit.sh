#!/usr/bin/env bash
# Audit the official @modelcontextprotocol/server-filesystem (file-reading tools:
# read_file, read_multiple_files, list_directory, directory_tree, get_file_info,
# search_files, ... — several overlap heavily). Requires ANTHROPIC_API_KEY and npx.
#
#   ./examples/run-filesystem-audit.sh                 # allows the current repo dir
#   ALLOW_DIR=/path/to/project ./examples/run-filesystem-audit.sh
#
# ALLOW_DIR is the directory the server is permitted to read (selection is measured,
# not executed, so nothing is actually read). Writes to ./filesystem-audit/ (gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."

ALLOW_DIR="${ALLOW_DIR:-$PWD}"
POSITIVES="${POSITIVES:-10}"
NEGATIVES="${NEGATIVES:-4}"
NOISE_RATIO="${NOISE_RATIO:-0.4}"
OUT="${OUT:-./filesystem-audit}"

exec uv run mcp-audit run \
  --stdio "npx -y @modelcontextprotocol/server-filesystem $ALLOW_DIR" \
  -n "$POSITIVES" \
  --negatives-per-tool "$NEGATIVES" \
  --noise-ratio "$NOISE_RATIO" \
  --out "$OUT" \
  "$@"
