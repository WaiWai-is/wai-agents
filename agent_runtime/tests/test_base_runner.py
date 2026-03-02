"""Tests for BaseAgentRunner ABC and AgentEvent dataclass."""

import pytest

from raccoon_runtime.runners.base_runner import AgentEvent, BaseAgentRunner


class TestAgentEvent:
    def test_create_event(self):
        event = AgentEvent(type="token", data={"text": "hello"})
        assert event.type == "token"
        assert event.data == {"text": "hello"}

    def test_event_types(self):
        for event_type in [
            "token",
            "status",
            "tool_call",
            "tool_result",
            "code_block",
            "approval_requested",
            "complete",
            "error",
        ]:
            event = AgentEvent(type=event_type, data={})
            assert event.type == event_type

    def test_event_data_dict(self):
        data = {"request_id": "abc", "tool_name": "search", "arguments": {"q": "test"}}
        event = AgentEvent(type="tool_call", data=data)
        assert event.data["request_id"] == "abc"
        assert event.data["tool_name"] == "search"


class TestBaseAgentRunner:
    def test_cannot_instantiate_abc(self):
        with pytest.raises(TypeError):
            BaseAgentRunner()

    def test_concrete_subclass_must_implement_all(self):
        class PartialRunner(BaseAgentRunner):
            async def execute(self, messages, config, tools, mcp_servers):
                yield AgentEvent(type="complete", data={})

        with pytest.raises(TypeError):
            PartialRunner()

    def test_concrete_subclass_complete(self):
        class FullRunner(BaseAgentRunner):
            async def execute(self, messages, config, tools, mcp_servers):
                yield AgentEvent(type="complete", data={})

            async def submit_approval(self, request_id, approved, scope):
                pass

            async def cancel(self):
                pass

        runner = FullRunner()
        assert runner is not None
