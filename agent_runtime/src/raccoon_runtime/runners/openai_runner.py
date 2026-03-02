"""OpenAI Agents SDK runner.

Uses the OpenAI Agents SDK to run agents with function calling,
streaming events, and tool approval flow.
"""

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

import structlog

from raccoon_runtime.config import Settings
from raccoon_runtime.mcp.mcp_server_manager import MCPServerManager
from raccoon_runtime.runners.base_runner import AgentEvent, BaseAgentRunner

logger = structlog.get_logger()


class OpenAIRunner(BaseAgentRunner):
    """OpenAI Agents SDK runner.

    Wraps the OpenAI agents library to provide structured agent execution
    with function calling, streaming, and approval flow.
    """

    def __init__(self, settings: Settings, api_key: str | None = None) -> None:
        self.settings = settings
        self.api_key = api_key or settings.openai_api_key
        self._pending_approvals: dict[str, tuple[asyncio.Event, dict[str, Any]]] = {}
        self._cancelled = False

    async def submit_approval(
        self,
        request_id: str,
        approved: bool,
        scope: str,
    ) -> None:
        if request_id not in self._pending_approvals:
            raise ValueError(f"No pending approval for request_id: {request_id}")

        event, decision = self._pending_approvals[request_id]
        decision["approved"] = approved
        decision["scope"] = scope
        event.set()

    async def cancel(self) -> None:
        self._cancelled = True
        for event, decision in self._pending_approvals.values():
            decision["approved"] = False
            decision["scope"] = "cancelled"
            event.set()

    async def execute(
        self,
        messages: list[dict[str, str]],
        config: dict[str, Any],
        tools: list[dict[str, Any]],
        mcp_servers: list[dict[str, Any]],
    ) -> AsyncIterator[AgentEvent]:
        import openai

        model = config.get("model", "gpt-4o")
        system_prompt = config.get("system_prompt", "")
        temperature = config.get("temperature", 0.7)
        max_tokens = config.get("max_tokens", 4096)
        deadline = config.get("deadline_seconds", self.settings.agent_turn_deadline)

        # Connect MCP servers
        mcp_manager = MCPServerManager()
        try:
            if mcp_servers:
                await mcp_manager.connect_servers(mcp_servers)
                mcp_tools = await mcp_manager.discover_all_tools()
                tools = list(tools) + mcp_tools

            yield AgentEvent(
                type="status",
                data={"message": "Initializing OpenAI agent...", "category": "thinking"},
            )

            # Convert tool configs to OpenAI function format
            openai_tools = []
            for tool in tools:
                openai_tools.append({
                    "type": "function",
                    "function": {
                        "name": tool["name"],
                        "description": tool.get("description", ""),
                        "parameters": tool.get("input_schema", {}),
                    },
                })

            # Build OpenAI messages
            openai_messages: list[dict[str, Any]] = []
            if system_prompt:
                openai_messages.append({"role": "system", "content": system_prompt})
            for msg in messages:
                openai_messages.append({"role": msg["role"], "content": msg["content"]})

            client = openai.AsyncOpenAI(api_key=self.api_key)

            # Agentic loop
            async with asyncio.timeout(deadline):
                while not self._cancelled:
                    kwargs: dict[str, Any] = {
                        "model": model,
                        "messages": openai_messages,
                        "stream": True,
                    }
                    if max_tokens:
                        kwargs["max_tokens"] = max_tokens
                    if temperature is not None:
                        kwargs["temperature"] = temperature
                    if openai_tools:
                        kwargs["tools"] = openai_tools

                    # Stream the response
                    collected_text = ""
                    tool_calls_in_progress: dict[int, dict[str, Any]] = {}
                    finish_reason = None

                    stream = await client.chat.completions.create(**kwargs)

                    async for chunk in stream:
                        if self._cancelled:
                            yield AgentEvent(
                                type="error",
                                data={"code": "cancelled", "message": "Cancelled", "retryable": False},
                            )
                            return

                        choice = chunk.choices[0] if chunk.choices else None
                        if not choice:
                            continue

                        delta = choice.delta
                        finish_reason = choice.finish_reason

                        # Text delta
                        if delta and delta.content:
                            yield AgentEvent(type="token", data={"text": delta.content})
                            collected_text += delta.content

                        # Tool call deltas
                        if delta and delta.tool_calls:
                            for tc in delta.tool_calls:
                                idx = tc.index
                                if idx not in tool_calls_in_progress:
                                    tool_calls_in_progress[idx] = {
                                        "id": tc.id or "",
                                        "name": "",
                                        "arguments": "",
                                    }
                                if tc.id:
                                    tool_calls_in_progress[idx]["id"] = tc.id
                                if tc.function:
                                    if tc.function.name:
                                        tool_calls_in_progress[idx]["name"] = tc.function.name
                                    if tc.function.arguments:
                                        tool_calls_in_progress[idx]["arguments"] += tc.function.arguments

                    # Process completed tool calls
                    if finish_reason == "tool_calls" and tool_calls_in_progress:
                        # Build assistant message with tool calls for context
                        assistant_msg: dict[str, Any] = {"role": "assistant", "content": collected_text or None}
                        assistant_tool_calls = []
                        for tc_data in tool_calls_in_progress.values():
                            assistant_tool_calls.append({
                                "id": tc_data["id"],
                                "type": "function",
                                "function": {
                                    "name": tc_data["name"],
                                    "arguments": tc_data["arguments"],
                                },
                            })
                        assistant_msg["tool_calls"] = assistant_tool_calls
                        openai_messages.append(assistant_msg)

                        # Execute each tool call
                        for tc_data in tool_calls_in_progress.values():
                            tool_name = tc_data["name"]
                            request_id = tc_data["id"]
                            try:
                                tool_input = json.loads(tc_data["arguments"])
                            except json.JSONDecodeError:
                                tool_input = {}

                            # Check approval
                            needs_approval = any(
                                t.get("requires_approval", False)
                                for t in tools
                                if t.get("name") == tool_name
                            )

                            if needs_approval:
                                yield AgentEvent(
                                    type="approval_requested",
                                    data={
                                        "request_id": request_id,
                                        "tool_name": tool_name,
                                        "arguments_preview": tool_input,
                                        "available_scopes": ["allow_once", "allow_for_session", "always_for_agent_tool"],
                                    },
                                )

                                approval_event = asyncio.Event()
                                decision: dict[str, Any] = {"approved": False, "scope": ""}
                                self._pending_approvals[request_id] = (approval_event, decision)
                                try:
                                    await approval_event.wait()
                                finally:
                                    self._pending_approvals.pop(request_id, None)

                                if not decision.get("approved", False):
                                    openai_messages.append({
                                        "role": "tool",
                                        "tool_call_id": request_id,
                                        "content": "Tool execution denied by user",
                                    })
                                    yield AgentEvent(
                                        type="tool_result",
                                        data={"request_id": request_id, "tool_name": tool_name, "result": "Denied", "is_error": True},
                                    )
                                    continue

                            yield AgentEvent(
                                type="tool_call",
                                data={"request_id": request_id, "tool_name": tool_name, "arguments": tool_input},
                            )

                            # Execute tool
                            try:
                                async with asyncio.timeout(self.settings.tool_call_deadline):
                                    if mcp_manager.has_tool(tool_name):
                                        result = await mcp_manager.execute_tool(tool_name, tool_input)
                                    else:
                                        result = f"Tool '{tool_name}' not available via MCP"

                                    openai_messages.append({
                                        "role": "tool",
                                        "tool_call_id": request_id,
                                        "content": str(result),
                                    })
                                    yield AgentEvent(
                                        type="tool_result",
                                        data={"request_id": request_id, "tool_name": tool_name, "result": str(result), "is_error": False},
                                    )
                            except Exception as e:
                                openai_messages.append({
                                    "role": "tool",
                                    "tool_call_id": request_id,
                                    "content": str(e),
                                })
                                yield AgentEvent(
                                    type="tool_result",
                                    data={"request_id": request_id, "tool_name": tool_name, "result": str(e), "is_error": True},
                                )

                        # Continue the loop for another model response
                        continue

                    # No tool calls — done
                    usage = chunk.usage if hasattr(chunk, "usage") and chunk.usage else None
                    yield AgentEvent(
                        type="complete",
                        data={
                            "model": model,
                            "stop_reason": finish_reason or "end_turn",
                            "prompt_tokens": usage.prompt_tokens if usage else 0,
                            "completion_tokens": usage.completion_tokens if usage else 0,
                            "total_tokens": usage.total_tokens if usage else 0,
                        },
                    )
                    break

        except TimeoutError:
            yield AgentEvent(
                type="error",
                data={
                    "code": "deadline_exceeded",
                    "message": f"Agent turn exceeded {deadline}s deadline",
                    "retryable": True,
                },
            )
        except Exception as e:
            logger.error("openai_runner_error", error=str(e))
            yield AgentEvent(
                type="error",
                data={"code": "internal_error", "message": str(e), "retryable": True},
            )
        finally:
            await mcp_manager.disconnect_all()
