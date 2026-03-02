"""Manages MCP server connections for a single agent execution.

Uses the official MCP Python SDK for stdio and SSE transports.
Each execution creates its own MCPServerManager; connections are torn down
when the execution completes.
"""

from typing import Any

import structlog
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.sse import sse_client

logger = structlog.get_logger()

# Allowed commands for stdio transport (security whitelist)
ALLOWED_COMMANDS = {"python", "python3", "node", "npx", "uvx", "docker"}


class MCPServerManager:
    """Manages MCP server connections for a single agent execution."""

    def __init__(self) -> None:
        self._sessions: dict[str, ClientSession] = {}
        self._transports: list[Any] = []  # Keep references for cleanup
        self._tools: dict[str, tuple[str, dict[str, Any]]] = {}  # tool_name -> (server_name, schema)

    async def connect_servers(self, configs: list[dict[str, Any]]) -> None:
        """Connect to all configured MCP servers."""
        for config in configs:
            name = config["name"]
            transport = config.get("transport", "stdio")

            logger.info("mcp_connecting", server=name, transport=transport)

            if transport == "stdio":
                command = config["command"]
                if command not in ALLOWED_COMMANDS:
                    raise ValueError(
                        f"Command '{command}' not in allowed list: {ALLOWED_COMMANDS}"
                    )

                params = StdioServerParameters(
                    command=command,
                    args=config.get("args", []),
                    env=config.get("env"),
                )
                transport_ctx = stdio_client(params)
                read_stream, write_stream = await transport_ctx.__aenter__()
                self._transports.append(transport_ctx)

            elif transport in ("sse", "streamable_http"):
                url = config["url"]
                headers = config.get("headers")
                transport_ctx = sse_client(url=url, headers=headers)
                read_stream, write_stream = await transport_ctx.__aenter__()
                self._transports.append(transport_ctx)

            else:
                raise ValueError(f"Unknown MCP transport: {transport}")

            session = ClientSession(read_stream, write_stream)
            await session.initialize()
            self._sessions[name] = session
            logger.info("mcp_connected", server=name)

    async def discover_all_tools(self) -> list[dict[str, Any]]:
        """Discover tools from all connected servers.

        Returns list of tool schemas in LLM-compatible format.
        """
        all_tools: list[dict[str, Any]] = []
        for server_name, session in self._sessions.items():
            result = await session.list_tools()
            for tool in result.tools:
                schema: dict[str, Any] = {
                    "name": tool.name,
                    "description": tool.description or "",
                    "input_schema": tool.inputSchema,
                }
                self._tools[tool.name] = (server_name, schema)
                all_tools.append(schema)
            logger.info(
                "mcp_tools_discovered",
                server=server_name,
                tool_count=len(result.tools),
            )
        return all_tools

    async def execute_tool(self, tool_name: str, arguments: dict[str, Any]) -> str:
        """Execute a tool on the appropriate MCP server."""
        if tool_name not in self._tools:
            raise ValueError(f"Unknown MCP tool: {tool_name}")

        server_name, _ = self._tools[tool_name]
        session = self._sessions[server_name]

        logger.info("mcp_execute_tool", server=server_name, tool=tool_name)
        result = await session.call_tool(tool_name, arguments)

        # Concatenate text content from result
        return "\n".join(
            block.text for block in result.content if hasattr(block, "text")
        )

    async def disconnect_all(self) -> None:
        """Disconnect from all MCP servers."""
        for name, session in self._sessions.items():
            try:
                await session.__aexit__(None, None, None)
                logger.info("mcp_disconnected", server=name)
            except Exception as e:
                logger.warning("mcp_disconnect_error", server=name, error=str(e))

        for transport_ctx in self._transports:
            try:
                await transport_ctx.__aexit__(None, None, None)
            except Exception:
                pass

        self._sessions.clear()
        self._tools.clear()
        self._transports.clear()

    @property
    def connected_servers(self) -> list[str]:
        """Return names of all connected servers."""
        return list(self._sessions.keys())

    @property
    def available_tools(self) -> list[str]:
        """Return names of all discovered tools."""
        return list(self._tools.keys())

    def has_tool(self, tool_name: str) -> bool:
        """Check if a tool is available."""
        return tool_name in self._tools
