"""MCP connection + tool discovery (MCP Python SDK v2).

v2 exposes a single high-level ``Client``: a URL string means streamable HTTP; a
``StdioServerParameters`` launches a subprocess and talks over stdio. We paginate
``list_tools`` via ``next_cursor`` so servers with large or paged tool lists are
fully enumerated.
"""

from __future__ import annotations

import shlex
from dataclasses import dataclass

from mcp import Client, StdioServerParameters
from mcp.types import Tool

from .models import ServerInfo, ToolRecord


class ConnectionError_(Exception):
    """Raised when the target server cannot be reached or handshaked."""


@dataclass
class Discovery:
    transport: str  # "stdio" | "http"
    endpoint: str
    server_info: ServerInfo
    tools: list[ToolRecord]


def _looks_like_url(target: str) -> bool:
    return target.startswith(("http://", "https://"))


def build_target(http: str | None, stdio: str | None):
    """Return (transport, endpoint_str, client_arg) for the CLI's mutually
    exclusive --http / --stdio options."""
    if bool(http) == bool(stdio):
        raise ValueError("Provide exactly one of --http or --stdio.")
    if http:
        if not _looks_like_url(http):
            raise ValueError(f"--http must be an http(s) URL, got: {http!r}")
        return "http", http, http
    parts = shlex.split(stdio)
    if not parts:
        raise ValueError("--stdio command is empty.")
    params = StdioServerParameters(command=parts[0], args=parts[1:])
    return "stdio", stdio, params


def _tool_to_record(t: Tool) -> ToolRecord:
    desc = t.description
    return ToolRecord(
        name=t.name,
        description=desc,
        input_schema=t.input_schema or {},
        has_description=bool(desc and desc.strip()),
    )


async def discover(http: str | None, stdio: str | None) -> Discovery:
    transport, endpoint, client_arg = build_target(http, stdio)
    return await discover_from_target(transport, endpoint, client_arg)


async def discover_from_target(transport: str, endpoint: str, client_arg) -> Discovery:
    """Discover tools from any Client-acceptable target (URL, StdioServerParameters,
    or an in-process MCPServer/Server instance — the last is used by tests)."""
    try:
        async with Client(client_arg, raise_exceptions=True) as client:
            info = getattr(client, "server_info", None)
            server_info = ServerInfo(
                name=getattr(info, "name", None),
                version=getattr(info, "version", None),
            )
            tools: list[Tool] = []
            cursor: str | None = None
            seen_cursors: set[str] = set()
            while True:
                result = await client.list_tools(cursor=cursor)
                tools.extend(result.tools)
                cursor = result.next_cursor
                if not cursor or cursor in seen_cursors:
                    break
                seen_cursors.add(cursor)
    except ConnectionError_:
        raise
    except Exception as e:  # noqa: BLE001 - surface any transport/handshake failure cleanly
        raise ConnectionError_(
            f"Failed to connect to MCP server ({transport}: {endpoint}): "
            f"{type(e).__name__}: {e}"
        ) from e

    records = [_tool_to_record(t) for t in tools]
    return Discovery(
        transport=transport,
        endpoint=endpoint,
        server_info=server_info,
        tools=records,
    )
