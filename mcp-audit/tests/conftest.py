from __future__ import annotations

import pytest
from mcp.server.mcpserver import MCPServer

from mcp_audit.llm import CallResult


@pytest.fixture
def fake_server() -> MCPServer:
    m = MCPServer("fake-crm")

    @m.tool()
    def create_record(name: str, value: str) -> str:
        "Create a brand new record with the given name and value."
        return "ok"

    @m.tool()
    def update_record(record_id: str, value: str) -> str:
        "Update the value of an existing record identified by id."
        return "ok"

    @m.tool()
    def delete_record(record_id: str) -> str:
        "Permanently delete an existing record by id."
        return "ok"

    return m


class FakeLLM:
    """Deterministic stand-in for the Anthropic wrapper.

    - complete_text: returns a canned JSON array (for generation).
    - select_tool: consults `plan` mapping query -> tool name to pick (or None).
    """

    def __init__(self, plan: dict[str, str | None] | None = None, gen_queries=None):
        self.plan = plan or {}
        self.gen_queries = gen_queries or ["query one", "query two"]
        self.select_calls = 0
        self._gen_calls = 0

    async def complete_text(self, model, prompt, max_tokens=2048, system=None):
        import json

        # Unique per call so generated queries never collide across tools.
        self._gen_calls += 1
        qs = [f"{q} [{self._gen_calls}-{i}]" for i, q in enumerate(self.gen_queries)]
        return CallResult(
            picked_names=[], inputs=[], stop_reason="end_turn",
            text=json.dumps(qs),
            input_tokens=100, output_tokens=20, attempts=1,
        )

    async def select_tool(self, model, query, tools, temperature, max_tokens=1024):
        self.select_calls += 1
        pick = self.plan.get(query, "__ABSENT__")
        if pick == "__ABSENT__":
            # default: pick nothing
            return CallResult([], [], "end_turn", "no tool", 50, 5, 1)
        if pick is None:
            return CallResult([], [], "end_turn", "cannot help", 50, 5, 1)
        return CallResult([pick], [{}], "tool_use", "", 60, 8, 1)

    async def count_input_tokens(self, model, messages, tools=None):
        return 42
