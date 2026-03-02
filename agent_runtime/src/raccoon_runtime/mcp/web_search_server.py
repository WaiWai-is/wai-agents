"""Built-in MCP server for web search via Exa API.

Exposes a web_search tool for agents.
Run via: python -m raccoon_runtime.mcp.web_search_server
"""

import asyncio
import json
import os

import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

app = Server("raccoon-web-search")

EXA_API_URL = "https://api.exa.ai/search"


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="web_search",
            description="Search the web for current information. Returns titles, URLs, and snippets.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query.",
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "Number of results to return (default 5, max 10).",
                        "minimum": 1,
                        "maximum": 10,
                    },
                },
                "required": ["query"],
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name != "web_search":
        raise ValueError(f"Unknown tool: {name}")

    api_key = os.environ.get("RACCOON_EXA_API_KEY", "")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            EXA_API_URL,
            json={
                "query": arguments["query"],
                "numResults": arguments.get("num_results", 5),
                "contents": {"text": {"maxCharacters": 500}},
            },
            headers={"x-api-key": api_key},
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()

    results = data.get("results", [])
    if not results:
        return [TextContent(type="text", text="No results found.")]

    formatted = []
    for i, r in enumerate(results, 1):
        title = r.get("title", "Untitled")
        url = r.get("url", "")
        text = r.get("text", "")
        formatted.append(f"{i}. [{title}]({url})\n{text}")

    return [TextContent(type="text", text="\n\n".join(formatted))]


async def main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
