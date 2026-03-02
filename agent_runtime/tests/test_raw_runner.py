"""Tests for RawRunner."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from raccoon_runtime.config import Settings
from raccoon_runtime.runners.base_runner import AgentEvent
from raccoon_runtime.runners.raw_runner import RawRunner


@pytest.fixture
def runner(settings):
    return RawRunner(settings)


@pytest.fixture
def mock_provider():
    provider = AsyncMock()
    return provider


class TestRawRunnerInit:
    def test_default_state(self, runner):
        assert runner.api_key is None
        assert runner._cancelled is False
        assert runner._pending_approvals == {}

    def test_with_api_key(self, settings):
        runner = RawRunner(settings, api_key="test-key")
        assert runner.api_key == "test-key"


class TestRawRunnerApproval:
    @pytest.mark.asyncio
    async def test_submit_approval_unknown_id_raises(self, runner):
        with pytest.raises(ValueError, match="No pending approval"):
            await runner.submit_approval("nonexistent", True, "allow_once")

    @pytest.mark.asyncio
    async def test_submit_approval_unblocks_event(self, runner):
        event = asyncio.Event()
        decision = {"approved": False, "scope": ""}
        runner._pending_approvals["req-1"] = (event, decision)

        await runner.submit_approval("req-1", True, "allow_for_session")

        assert event.is_set()
        assert decision["approved"] is True
        assert decision["scope"] == "allow_for_session"


class TestRawRunnerCancel:
    @pytest.mark.asyncio
    async def test_cancel_sets_flag(self, runner):
        await runner.cancel()
        assert runner._cancelled is True

    @pytest.mark.asyncio
    async def test_cancel_unblocks_pending_approvals(self, runner):
        event = asyncio.Event()
        decision = {"approved": False, "scope": ""}
        runner._pending_approvals["req-1"] = (event, decision)

        await runner.cancel()

        assert event.is_set()
        assert decision["approved"] is False
        assert decision["scope"] == "cancelled"


class TestRawRunnerExecute:
    @pytest.mark.asyncio
    async def test_emits_status_and_complete(self, settings):
        runner = RawRunner(settings)

        # Mock provider to return a simple completion
        mock_provider = AsyncMock()

        async def mock_stream(messages, config):
            yield {"type": "token", "text": "Hello"}
            yield {
                "type": "complete",
                "usage": {"total_tokens": 10, "prompt_tokens": 5, "completion_tokens": 5},
                "stop_reason": "end_turn",
            }

        mock_provider.stream_completion = mock_stream

        with patch.object(runner, "_get_provider", return_value=mock_provider):
            events = []
            async for event in runner.execute(
                messages=[{"role": "user", "content": "hi"}],
                config={"model": "claude-sonnet-4-6"},
                tools=[],
                mcp_servers=[],
            ):
                events.append(event)

        # Should have: status, token, complete
        types = [e.type for e in events]
        assert "status" in types
        assert "token" in types
        assert "complete" in types

    @pytest.mark.asyncio
    async def test_emits_error_on_exception(self, settings):
        runner = RawRunner(settings)

        mock_provider = AsyncMock()

        async def mock_stream(messages, config):
            raise RuntimeError("LLM API error")
            yield  # Make it a generator

        mock_provider.stream_completion = mock_stream

        with patch.object(runner, "_get_provider", return_value=mock_provider):
            events = []
            async for event in runner.execute(
                messages=[{"role": "user", "content": "hi"}],
                config={"model": "claude-sonnet-4-6"},
                tools=[],
                mcp_servers=[],
            ):
                events.append(event)

        error_events = [e for e in events if e.type == "error"]
        assert len(error_events) == 1
        assert "LLM API error" in error_events[0].data["message"]
