"""Raw runner — refactored from orchestrator.py.

Uses existing LLM providers (Anthropic/OpenAI) directly with streaming,
tool execution via ToolRegistry + MCPServerManager, and approval flow.
"""

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import structlog

from raccoon_runtime.config import Settings
from raccoon_runtime.llm.providers.anthropic_provider import AnthropicProvider
from raccoon_runtime.llm.providers.base import BaseLLMProvider
from raccoon_runtime.llm.providers.openai_provider import OpenAIProvider
from raccoon_runtime.mcp.mcp_server_manager import MCPServerManager
from raccoon_runtime.mcp.tool_registry import ToolRegistry
from raccoon_runtime.runners.base_runner import AgentEvent, BaseAgentRunner
from raccoon_runtime.status_messages import StatusMessageBank

logger = structlog.get_logger()


class RawRunner(BaseAgentRunner):
    """Raw provider-based streaming runner.

    Wraps the existing Anthropic/OpenAI provider logic with MCP tool
    integration and approval flow.
    """

    def __init__(self, settings: Settings, api_key: str | None = None) -> None:
        self.settings = settings
        self.api_key = api_key
        self.status_bank = StatusMessageBank()
        self.tool_registry = ToolRegistry()
        self._providers: dict[str, BaseLLMProvider] = {}
        self._pending_approvals: dict[str, tuple[asyncio.Event, dict[str, Any]]] = {}
        self._cancelled = False

    def _get_provider(self, model: str) -> BaseLLMProvider:
        """Get or create a provider for the given model."""
        if model.startswith("claude"):
            key = "anthropic"
            if self.api_key:
                return AnthropicProvider(self.api_key)
            if key not in self._providers:
                self._providers[key] = AnthropicProvider(self.settings.anthropic_api_key)
            return self._providers[key]
        elif model.startswith("gpt"):
            key = "openai"
            if self.api_key:
                return OpenAIProvider(self.api_key)
            if key not in self._providers:
                self._providers[key] = OpenAIProvider(self.settings.openai_api_key)
            return self._providers[key]
        else:
            raise ValueError(f"Unknown model: {model}")

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
        # Unblock any pending approvals so execution can exit
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
        model = config.get("model", self.settings.default_model)
        provider = self._get_provider(model)

        # Connect MCP servers and discover tools
        mcp_manager = MCPServerManager()
        try:
            if mcp_servers:
                await mcp_manager.connect_servers(mcp_servers)
                mcp_tools = await mcp_manager.discover_all_tools()

                # Register MCP tools in the registry with handlers
                for tool in mcp_tools:
                    tool_name = tool["name"]
                    self.tool_registry.register_tool(
                        name=tool_name,
                        schema=tool["input_schema"],
                        handler=lambda args, tn=tool_name: mcp_manager.execute_tool(tn, args),
                    )

                # Merge MCP tool schemas into config tools for the LLM
                tools = list(tools) + mcp_tools

            yield AgentEvent(
                type="status",
                data={
                    "message": self.status_bank.get_message("thinking"),
                    "category": "thinking",
                },
            )

            deadline = config.get("deadline_seconds", self.settings.agent_turn_deadline)

            async with asyncio.timeout(deadline):
                code_buffer = ""
                in_code_block = False
                code_language = ""

                async for event in provider.stream_completion(messages, config):
                    if self._cancelled:
                        yield AgentEvent(
                            type="error",
                            data={
                                "code": "cancelled",
                                "message": "Execution cancelled",
                                "retryable": False,
                            },
                        )
                        return

                    if event["type"] == "token":
                        text = event["text"]

                        # Detect code blocks in streaming text
                        code_buffer += text
                        if "```" in code_buffer and not in_code_block:
                            parts = code_buffer.split("```", 1)
                            if len(parts) > 1:
                                lang_line = parts[1].split("\n", 1)
                                code_language = (
                                    lang_line[0].strip() if lang_line[0].strip() else "text"
                                )
                                in_code_block = True
                                code_buffer = lang_line[1] if len(lang_line) > 1 else ""
                        elif "```" in code_buffer and in_code_block:
                            parts = code_buffer.split("```", 1)
                            code_content = parts[0]
                            remaining = parts[1] if len(parts) > 1 else ""
                            yield AgentEvent(
                                type="code_block",
                                data={
                                    "language": code_language,
                                    "code": code_content,
                                    "filename": "",
                                },
                            )
                            in_code_block = False
                            code_buffer = remaining

                        yield AgentEvent(type="token", data={"text": text})

                    elif event["type"] == "tool_use":
                        tool_name = event["name"]
                        tool_input = event["input"]
                        request_id = event["id"]

                        # Emit status for tool call
                        if "search" in tool_name.lower():
                            yield AgentEvent(
                                type="status",
                                data={
                                    "message": self.status_bank.get_message("searching"),
                                    "category": "searching",
                                },
                            )
                        elif "code" in tool_name.lower() or "exec" in tool_name.lower():
                            yield AgentEvent(
                                type="status",
                                data={
                                    "message": self.status_bank.get_message("coding"),
                                    "category": "coding",
                                },
                            )

                        # Check if tool requires approval
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
                                    "available_scopes": [
                                        "allow_once",
                                        "allow_for_session",
                                        "always_for_agent_tool",
                                    ],
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
                                yield AgentEvent(
                                    type="tool_result",
                                    data={
                                        "request_id": request_id,
                                        "tool_name": tool_name,
                                        "result": "Tool execution denied by user",
                                        "is_error": True,
                                    },
                                )
                                continue

                        yield AgentEvent(
                            type="tool_call",
                            data={
                                "request_id": request_id,
                                "tool_name": tool_name,
                                "arguments": tool_input,
                            },
                        )

                        # Execute tool
                        try:
                            async with asyncio.timeout(self.settings.tool_call_deadline):
                                if mcp_manager.has_tool(tool_name):
                                    result = await mcp_manager.execute_tool(tool_name, tool_input)
                                else:
                                    result = await self.tool_registry.execute_tool(
                                        tool_name, tool_input
                                    )
                                yield AgentEvent(
                                    type="tool_result",
                                    data={
                                        "request_id": request_id,
                                        "tool_name": tool_name,
                                        "result": str(result),
                                        "is_error": False,
                                    },
                                )
                        except TimeoutError:
                            yield AgentEvent(
                                type="tool_result",
                                data={
                                    "request_id": request_id,
                                    "tool_name": tool_name,
                                    "result": "Tool execution timed out",
                                    "is_error": True,
                                },
                            )
                        except Exception as e:
                            yield AgentEvent(
                                type="tool_result",
                                data={
                                    "request_id": request_id,
                                    "tool_name": tool_name,
                                    "result": str(e),
                                    "is_error": True,
                                },
                            )

                    elif event["type"] == "complete":
                        usage = event.get("usage", {})
                        yield AgentEvent(
                            type="complete",
                            data={
                                "message_id": "",
                                "model": model,
                                "stop_reason": event.get("stop_reason", "end_turn"),
                                "total_tokens": usage.get("total_tokens", 0),
                                "prompt_tokens": usage.get("prompt_tokens", 0),
                                "completion_tokens": usage.get("completion_tokens", 0),
                            },
                        )

        except TimeoutError:
            yield AgentEvent(
                type="error",
                data={
                    "code": "deadline_exceeded",
                    "message": f"Agent turn exceeded {config.get('deadline_seconds', self.settings.agent_turn_deadline)}s deadline",
                    "retryable": True,
                },
            )
        except Exception as e:
            logger.error("raw_runner_error", error=str(e))
            yield AgentEvent(
                type="error",
                data={
                    "code": "internal_error",
                    "message": str(e),
                    "retryable": True,
                },
            )
        finally:
            await mcp_manager.disconnect_all()
