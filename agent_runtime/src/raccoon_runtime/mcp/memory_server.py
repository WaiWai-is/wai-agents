"""Built-in MCP server for agent memory.

Exposes save_memory, search_memories, and forget_memory tools.
Run via: python -m raccoon_runtime.mcp.memory_server
"""

import asyncio
import json
import os
import sys

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

from raccoon_runtime.memory.memory_tool import forget_memory, save_memory, search_memories

app = Server("raccoon-memory")


@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="save_memory",
            description="Save a memory about the user or conversation for later retrieval.",
            inputSchema={
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The memory content to save.",
                    },
                    "importance": {
                        "type": "number",
                        "description": "Importance score from 0.0 to 1.0 (default 0.5).",
                        "minimum": 0.0,
                        "maximum": 1.0,
                    },
                    "memory_type": {
                        "type": "string",
                        "enum": ["observation", "reflection", "fact", "preference"],
                        "description": "Type of memory (default: observation).",
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional tags for categorization.",
                    },
                },
                "required": ["content"],
            },
        ),
        Tool(
            name="search_memories",
            description="Search your memories about the user. Use before answering questions where past context might be relevant.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query to find relevant memories.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results (default 10).",
                        "minimum": 1,
                        "maximum": 50,
                    },
                    "memory_type": {
                        "type": "string",
                        "enum": ["observation", "reflection", "fact", "preference"],
                        "description": "Optional filter by memory type.",
                    },
                },
                "required": ["query"],
            },
        ),
        Tool(
            name="forget_memory",
            description="Delete a specific memory by its ID.",
            inputSchema={
                "type": "object",
                "properties": {
                    "memory_id": {
                        "type": "string",
                        "description": "The UUID of the memory to delete.",
                    },
                },
                "required": ["memory_id"],
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    agent_id = os.environ.get("RACCOON_AGENT_ID", "")
    user_id = os.environ.get("RACCOON_USER_ID", "")
    api_key = os.environ.get("RACCOON_OPENAI_API_KEY", "")

    if name == "save_memory":
        memory_id = await save_memory(
            agent_id=agent_id,
            user_id=user_id,
            content=arguments["content"],
            api_key=api_key,
            importance=arguments.get("importance", 0.5),
            memory_type=arguments.get("memory_type", "observation"),
            tags=arguments.get("tags"),
        )
        return [TextContent(type="text", text=f"Memory saved with ID: {memory_id}")]

    elif name == "search_memories":
        memories = await search_memories(
            agent_id=agent_id,
            user_id=user_id,
            query=arguments["query"],
            api_key=api_key,
            limit=arguments.get("limit", 10),
            memory_type=arguments.get("memory_type"),
        )
        if not memories:
            return [TextContent(type="text", text="No relevant memories found.")]
        result = json.dumps(memories, indent=2)
        return [TextContent(type="text", text=result)]

    elif name == "forget_memory":
        deleted = await forget_memory(arguments["memory_id"])
        if deleted:
            return [TextContent(type="text", text="Memory deleted.")]
        return [TextContent(type="text", text="Memory not found.")]

    else:
        raise ValueError(f"Unknown tool: {name}")


async def main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
