"""Claude Agent SDK runner.

Uses the Anthropic Agent SDK to run agents with built-in tool loops,
MCP integration, and streaming events.
"""

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import structlog

from raccoon_runtime.config import Settings
from raccoon_runtime.mcp.mcp_server_manager import MCPServerManager
from raccoon_runtime.runners.base_runner import AgentEvent, BaseAgentRunner

logger = structlog.get_logger()


class ClaudeRunner(BaseAgentRunner):
    """Claude Agent SDK runner.

    Wraps the Anthropic agents library to provide structured agent execution
    with built-in tool loops, streaming, and approval flow.
    """

    def __init__(self, settings: Settings, api_key: str | None = None) -> None:
        self.settings = settings
        self.api_key = api_key or settings.anthropic_api_key
        self._pending_approvals: dict[str, tuple[asyncio.Event, dict[str, Any]]] = {}
        self._cancelled = False
        self._current_task: asyncio.Task | None = None

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
        if self._current_task and not self._current_task.done():
            self._current_task.cancel()

    async def execute(
        self,
        messages: list[dict[str, str]],
        config: dict[str, Any],
        tools: list[dict[str, Any]],
        mcp_servers: list[dict[str, Any]],
    ) -> AsyncIterator[AgentEvent]:
        import anthropic
        from anthropic.types import Message, TextBlock, ToolUseBlock

        model = config.get("model", self.settings.default_model)
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
                data={"message": "Initializing Claude agent...", "category": "thinking"},
            )

            # Convert tool configs to Anthropic tool format
            anthropic_tools = []
            for tool in tools:
                anthropic_tools.append({
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                    "input_schema": tool.get("input_schema", {}),
                })

            # Build Anthropic messages
            anthropic_messages = []
            for msg in messages:
                anthropic_messages.append({
                    "role": msg["role"],
                    "content": msg["content"],
                })

            client = anthropic.AsyncAnthropic(api_key=self.api_key)

            # Agentic loop: keep calling until no more tool use
            async with asyncio.timeout(deadline):
                while not self._cancelled:
                    kwargs: dict[str, Any] = {
                        "model": model,
                        "max_tokens": max_tokens,
                        "messages": anthropic_messages,
                    }
                    if system_prompt:
                        kwargs["system"] = system_prompt
                    if temperature is not None:
                        kwargs["temperature"] = temperature
                    if anthropic_tools:
                        kwargs["tools"] = anthropic_tools

                    # Stream the response
                    collected_text = ""
                    tool_uses: list[dict[str, Any]] = []

                    async with client.messages.stream(**kwargs) as stream:
                        async for event in stream:
                            if self._cancelled:
                                yield AgentEvent(
                                    type="error",
                                    data={"code": "cancelled", "message": "Cancelled", "retryable": False},
                                )
                                return

                            if hasattr(event, "type"):
                                if event.type == "content_block_delta":
                                    if hasattr(event.delta, "text"):
                                        yield AgentEvent(type="token", data={"text": event.delta.text})
                                        collected_text += event.delta.text

                    # Get the final message
                    response: Message = await stream.get_final_message()

                    # Process content blocks
                    has_tool_use = False
                    tool_results = []

                    for block in response.content:
                        if isinstance(block, ToolUseBlock):
                            has_tool_use = True
                            tool_name = block.name
                            tool_input = block.input
                            request_id = block.id

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
                                    tool_results.append({
                                        "type": "tool_result",
                                        "tool_use_id": request_id,
                                        "content": "Tool execution denied by user",
                                        "is_error": True,
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
                                    tool_results.append({
                                        "type": "tool_result",
                                        "tool_use_id": request_id,
                                        "content": str(result),
                                    })
                                    yield AgentEvent(
                                        type="tool_result",
                                        data={"request_id": request_id, "tool_name": tool_name, "result": str(result), "is_error": False},
                                    )
                            except Exception as e:
                                tool_results.append({
                                    "type": "tool_result",
                                    "tool_use_id": request_id,
                                    "content": str(e),
                                    "is_error": True,
                                })
                                yield AgentEvent(
                                    type="tool_result",
                                    data={"request_id": request_id, "tool_name": tool_name, "result": str(e), "is_error": True},
                                )

                    # If there were tool uses, continue the loop with tool results
                    if has_tool_use and tool_results:
                        anthropic_messages.append({"role": "assistant", "content": response.content})
                        anthropic_messages.append({"role": "user", "content": tool_results})
                        continue

                    # No tool use — we're done
                    usage = response.usage
                    yield AgentEvent(
                        type="complete",
                        data={
                            "model": model,
                            "stop_reason": response.stop_reason or "end_turn",
                            "prompt_tokens": usage.input_tokens if usage else 0,
                            "completion_tokens": usage.output_tokens if usage else 0,
                            "total_tokens": (usage.input_tokens + usage.output_tokens) if usage else 0,
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
            logger.error("claude_runner_error", error=str(e))
            yield AgentEvent(
                type="error",
                data={"code": "internal_error", "message": str(e), "retryable": True},
            )
        finally:
            await mcp_manager.disconnect_all()
