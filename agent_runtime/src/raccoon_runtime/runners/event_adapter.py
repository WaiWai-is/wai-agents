"""Normalize SDK-specific events to unified AgentEvent format."""

from typing import Any

from raccoon_runtime.runners.base_runner import AgentEvent


def from_raw_event(event: dict[str, Any]) -> AgentEvent:
    """Convert a raw orchestrator event dict to an AgentEvent."""
    return AgentEvent(type=event["type"], data={k: v for k, v in event.items() if k != "type"})


def from_anthropic_event(event_type: str, data: dict[str, Any]) -> AgentEvent:
    """Convert a Claude Agent SDK event to an AgentEvent.

    Maps Claude-specific event names to the unified event types:
    - content_block_delta (text) -> token
    - tool_use -> tool_call
    - tool_result -> tool_result
    - message_start/end -> status/complete
    """
    match event_type:
        case "text_delta":
            return AgentEvent(type="token", data={"text": data.get("text", "")})
        case "tool_use":
            return AgentEvent(
                type="tool_call",
                data={
                    "request_id": data.get("id", ""),
                    "tool_name": data.get("name", ""),
                    "arguments": data.get("input", {}),
                },
            )
        case "tool_result":
            return AgentEvent(
                type="tool_result",
                data={
                    "request_id": data.get("tool_use_id", ""),
                    "tool_name": data.get("tool_name", ""),
                    "result": data.get("content", ""),
                    "is_error": data.get("is_error", False),
                },
            )
        case "error":
            return AgentEvent(
                type="error",
                data={
                    "code": data.get("code", "sdk_error"),
                    "message": data.get("message", ""),
                    "retryable": data.get("retryable", False),
                },
            )
        case _:
            return AgentEvent(type=event_type, data=data)


def from_openai_event(event_type: str, data: dict[str, Any]) -> AgentEvent:
    """Convert an OpenAI Agents SDK event to an AgentEvent.

    Maps OpenAI-specific event names to the unified event types:
    - response.output_item.delta (text) -> token
    - function_call -> tool_call
    - function_call_output -> tool_result
    """
    match event_type:
        case "text_delta":
            return AgentEvent(type="token", data={"text": data.get("delta", "")})
        case "function_call":
            return AgentEvent(
                type="tool_call",
                data={
                    "request_id": data.get("call_id", ""),
                    "tool_name": data.get("name", ""),
                    "arguments": data.get("arguments", {}),
                },
            )
        case "function_call_output":
            return AgentEvent(
                type="tool_result",
                data={
                    "request_id": data.get("call_id", ""),
                    "tool_name": data.get("name", ""),
                    "result": data.get("output", ""),
                    "is_error": data.get("is_error", False),
                },
            )
        case "error":
            return AgentEvent(
                type="error",
                data={
                    "code": data.get("code", "sdk_error"),
                    "message": data.get("message", ""),
                    "retryable": data.get("retryable", False),
                },
            )
        case _:
            return AgentEvent(type=event_type, data=data)
