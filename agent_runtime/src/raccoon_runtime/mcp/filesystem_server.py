"""Built-in MCP server for sandboxed filesystem operations.

Restricts all operations to /tmp/raccoon-sandbox/{conversation_id}/.
Run via: python -m raccoon_runtime.mcp.filesystem_server
"""

import asyncio
import os
from pathlib import Path

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

app = Server("raccoon-filesystem")

MAX_FILE_SIZE = 1_000_000  # 1MB


def _get_sandbox_root() -> Path:
    """Get the sandboxed root directory for the current conversation."""
    conversation_id = os.environ.get("RACCOON_CONVERSATION_ID", "default")
    root = Path(f"/tmp/raccoon-sandbox/{conversation_id}")
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_path(sandbox_root: Path, relative_path: str) -> Path:
    """Resolve a path within the sandbox, preventing traversal attacks."""
    resolved = (sandbox_root / relative_path).resolve()
    if not str(resolved).startswith(str(sandbox_root.resolve())):
        raise ValueError(f"Path traversal detected: {relative_path}")
    return resolved


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="read_file",
            description="Read the contents of a file from the sandbox.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path within the sandbox.",
                    },
                },
                "required": ["path"],
            },
        ),
        Tool(
            name="write_file",
            description="Write content to a file in the sandbox.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path within the sandbox.",
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to write to the file.",
                    },
                },
                "required": ["path", "content"],
            },
        ),
        Tool(
            name="list_directory",
            description="List files and directories in the sandbox.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative directory path within the sandbox (default: root).",
                    },
                },
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    sandbox_root = _get_sandbox_root()

    if name == "read_file":
        target = _safe_path(sandbox_root, arguments["path"])
        if not target.exists():
            raise FileNotFoundError(f"File not found: {arguments['path']}")
        if not target.is_file():
            raise ValueError(f"Not a file: {arguments['path']}")
        content = target.read_text(encoding="utf-8")
        return [TextContent(type="text", text=content)]

    elif name == "write_file":
        target = _safe_path(sandbox_root, arguments["path"])
        content = arguments["content"]
        if len(content) > MAX_FILE_SIZE:
            raise ValueError(f"File content exceeds {MAX_FILE_SIZE} byte limit.")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return [TextContent(type="text", text=f"Written {len(content)} bytes to {arguments['path']}")]

    elif name == "list_directory":
        rel_path = arguments.get("path", ".")
        target = _safe_path(sandbox_root, rel_path)
        if not target.exists():
            raise FileNotFoundError(f"Directory not found: {rel_path}")
        if not target.is_dir():
            raise ValueError(f"Not a directory: {rel_path}")

        entries = []
        for entry in sorted(target.iterdir()):
            rel = entry.relative_to(sandbox_root)
            suffix = "/" if entry.is_dir() else ""
            size = entry.stat().st_size if entry.is_file() else 0
            entries.append(f"{rel}{suffix} ({size} bytes)" if not suffix else f"{rel}{suffix}")

        if not entries:
            return [TextContent(type="text", text="Directory is empty.")]
        return [TextContent(type="text", text="\n".join(entries))]

    else:
        raise ValueError(f"Unknown tool: {name}")


async def main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
