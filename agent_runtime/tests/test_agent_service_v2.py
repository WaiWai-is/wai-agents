"""Tests for updated AgentServiceServicer with runner routing + SubmitApproval."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from raccoon_runtime.config import Settings
from raccoon_runtime.runners.base_runner import AgentEvent
from raccoon_runtime.services.agent_service import AgentServiceServicer, _event_to_response


@pytest.fixture
def servicer(settings):
    return AgentServiceServicer(settings)


class TestEventToResponse:
    def test_token_event(self):
        event = AgentEvent(type="token", data={"text": "hello"})
        response = _event_to_response(event)
        assert response.HasField("token")
        assert response.token.text == "hello"

    def test_status_event(self):
        event = AgentEvent(
            type="status",
            data={"message": "Thinking...", "category": "thinking"},
        )
        response = _event_to_response(event)
        assert response.HasField("status")
        assert response.status.message == "Thinking..."
        assert response.status.category == "thinking"

    def test_tool_call_event(self):
        event = AgentEvent(
            type="tool_call",
            data={
                "request_id": "tc-1",
                "tool_name": "search",
                "arguments": {"q": "test"},
            },
        )
        response = _event_to_response(event)
        assert response.HasField("tool_call")
        assert response.tool_call.tool_call_id == "tc-1"
        assert response.tool_call.tool_name == "search"

    def test_tool_result_success(self):
        event = AgentEvent(
            type="tool_result",
            data={
                "request_id": "tc-1",
                "tool_name": "search",
                "result": "Found 5 results",
                "is_error": False,
            },
        )
        response = _event_to_response(event)
        assert response.HasField("tool_result")
        assert response.tool_result.success is True
        assert response.tool_result.output == "Found 5 results"
        assert response.tool_result.error_message == ""

    def test_tool_result_error(self):
        event = AgentEvent(
            type="tool_result",
            data={
                "request_id": "tc-1",
                "tool_name": "search",
                "result": "Timeout",
                "is_error": True,
            },
        )
        response = _event_to_response(event)
        assert response.HasField("tool_result")
        assert response.tool_result.success is False
        assert response.tool_result.error_message == "Timeout"

    def test_error_event(self):
        event = AgentEvent(
            type="error",
            data={
                "code": "deadline_exceeded",
                "message": "Timed out",
                "retryable": True,
            },
        )
        response = _event_to_response(event)
        assert response.HasField("error")
        assert response.error.code == "deadline_exceeded"
        assert response.error.recoverable is True

    def test_complete_event(self):
        event = AgentEvent(
            type="complete",
            data={
                "model": "claude-sonnet-4-6",
                "stop_reason": "end_turn",
                "prompt_tokens": 100,
                "completion_tokens": 50,
            },
        )
        response = _event_to_response(event)
        assert response.HasField("complete")
        assert response.complete.model == "claude-sonnet-4-6"
        assert response.complete.input_tokens == 100
        assert response.complete.output_tokens == 50

    def test_approval_requested_event(self):
        event = AgentEvent(
            type="approval_requested",
            data={
                "request_id": "apr-1",
                "tool_name": "delete_file",
                "arguments_preview": {"path": "/etc/hosts"},
            },
        )
        response = _event_to_response(event)
        assert response.HasField("approval_request")
        assert response.approval_request.approval_id == "apr-1"
        assert response.approval_request.tool_name == "delete_file"

    def test_unknown_event_type(self):
        event = AgentEvent(type="custom_event", data={"foo": "bar"})
        response = _event_to_response(event)
        # Should fall through to status
        assert response.HasField("status")


class TestServicerInit:
    def test_has_factory_and_active_runners(self, servicer):
        assert servicer.factory is not None
        assert servicer._active_runners == {}


class TestSubmitApproval:
    @pytest.mark.asyncio
    async def test_no_active_runner_returns_error(self, servicer):
        request = MagicMock()
        request.conversation_id = "conv-1"
        request.request_id = "req-1"
        request.approved = True
        request.scope = "allow_once"
        context = MagicMock()

        result = await servicer.SubmitApproval(request, context)
        assert result.accepted is False
        assert "No active execution" in result.error

    @pytest.mark.asyncio
    async def test_active_runner_accepts(self, servicer):
        mock_runner = AsyncMock()
        mock_runner.submit_approval = AsyncMock()
        servicer._active_runners["conv-1"] = mock_runner

        request = MagicMock()
        request.conversation_id = "conv-1"
        request.request_id = "req-1"
        request.approved = True
        request.scope = "allow_once"
        context = MagicMock()

        result = await servicer.SubmitApproval(request, context)
        assert result.accepted is True
        mock_runner.submit_approval.assert_called_once_with("req-1", True, "allow_once")

    @pytest.mark.asyncio
    async def test_submit_approval_value_error(self, servicer):
        mock_runner = AsyncMock()
        mock_runner.submit_approval = AsyncMock(
            side_effect=ValueError("No pending approval")
        )
        servicer._active_runners["conv-1"] = mock_runner

        request = MagicMock()
        request.conversation_id = "conv-1"
        request.request_id = "req-bad"
        request.approved = True
        request.scope = "allow_once"
        context = MagicMock()

        result = await servicer.SubmitApproval(request, context)
        assert result.accepted is False
        assert "No pending approval" in result.error
