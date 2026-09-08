"""A tiny stdio MCP server with deliberately confusable tools, for smoke-testing
reticle end-to-end:

    uv run reticle run --stdio "python examples/demo_server.py" -n 5 --yes

create_record / update_record / delete_record are close in domain and phrasing —
a good target for watching the confusion matrix light up.
"""

from mcp.server.mcpserver import MCPServer

server = MCPServer("demo-crm")


@server.tool()
def create_record(name: str, value: str) -> str:
    "Create a brand new record with the given name and value."
    return "created"


@server.tool()
def update_record(record_id: str, value: str) -> str:
    "Update the value of an existing record identified by its id."
    return "updated"


@server.tool()
def delete_record(record_id: str) -> str:
    "Permanently delete an existing record by its id."
    return "deleted"


@server.tool()
def search_records(query: str) -> str:
    "Search existing records by a free-text query and return matches."
    return "[]"


if __name__ == "__main__":
    server.run()
