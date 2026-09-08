# Sample audit — `@modelcontextprotocol/server-memory`

A real, unmodified run of `mcp-audit` against the official memory server (9
knowledge-graph tools). Regenerate with [`../run-memory-audit.sh`](../run-memory-audit.sh).

- **`report.html`** — the shareable one-pager (open in a browser / screenshot).
- **`report.md`** — the same report in Markdown.
- **`artifact.json`** — the full run-artifact: every generated query, the tool-set
  hash, model strings, and each raw model choice. Doubles as living documentation of
  the artifact schema, and the report is derived entirely from it.

Headline from this run: **81% overall selection accuracy**. `create_relations` is
picked correctly only **20%** of the time — the model reaches for `create_entities`
instead half the time. The server also over-triggers on **39%** of out-of-scope
queries. (Numbers vary slightly run to run; Haiku 4.5 at temperature 0 keeps them
close.)
