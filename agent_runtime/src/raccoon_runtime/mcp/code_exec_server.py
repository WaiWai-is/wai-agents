"""Built-in MCP server for sandboxed code execution.

Executes Python code in a subprocess with timeout and resource limits.
Run via: python -m raccoon_runtime.mcp.code_exec_server
"""

import asyncio
import os
import tempfile

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

app = Server("raccoon-code-exec")

MAX_TIMEOUT = 45
MAX_OUTPUT_SIZE = 50_000  # chars


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="execute_code",
            description="Execute Python code in a sandboxed environment. Returns stdout, stderr, and exit code.",
            inputSchema={
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "The Python code to execute.",
                    },
                    "timeout": {
                        "type": "integer",
                        "description": f"Timeout in seconds (default 30, max {MAX_TIMEOUT}).",
                        "minimum": 1,
                        "maximum": MAX_TIMEOUT,
                    },
                },
                "required": ["code"],
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name != "execute_code":
        raise ValueError(f"Unknown tool: {name}")

    code = arguments["code"]
    timeout = min(arguments.get("timeout", 30), MAX_TIMEOUT)

    # Write code to a temp file and execute in subprocess
    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(code)
        script_path = f.name

    try:
        proc = await asyncio.create_subprocess_exec(
            "python3",
            script_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            # Limit environment to reduce attack surface
            env={
                "PATH": "/usr/bin:/usr/local/bin",
                "HOME": "/tmp",
                "PYTHONDONTWRITEBYTECODE": "1",
            },
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return [
                TextContent(
                    type="text",
                    text=f"Execution timed out after {timeout}s.",
                )
            ]

        stdout_text = stdout.decode("utf-8", errors="replace")[:MAX_OUTPUT_SIZE]
        stderr_text = stderr.decode("utf-8", errors="replace")[:MAX_OUTPUT_SIZE]
        exit_code = proc.returncode

        parts = [f"Exit code: {exit_code}"]
        if stdout_text:
            parts.append(f"stdout:\n{stdout_text}")
        if stderr_text:
            parts.append(f"stderr:\n{stderr_text}")

        return [TextContent(type="text", text="\n\n".join(parts))]
    finally:
        os.unlink(script_path)


async def main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
