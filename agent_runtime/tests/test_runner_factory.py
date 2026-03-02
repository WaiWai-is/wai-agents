"""Tests for RunnerFactory."""

import pytest

from raccoon_runtime.config import Settings
from raccoon_runtime.runners.runner_factory import RunnerFactory


@pytest.fixture
def factory(settings):
    return RunnerFactory(settings)


class TestRunnerFactory:
    def test_create_raw_runner(self, factory):
        from raccoon_runtime.runners.raw_runner import RawRunner

        runner = factory.create("raw")
        assert isinstance(runner, RawRunner)

    def test_create_claude_runner(self, factory):
        from raccoon_runtime.runners.claude_runner import ClaudeRunner

        runner = factory.create("claude_sdk")
        assert isinstance(runner, ClaudeRunner)

    def test_create_openai_runner(self, factory):
        from raccoon_runtime.runners.openai_runner import OpenAIRunner

        runner = factory.create("openai_sdk")
        assert isinstance(runner, OpenAIRunner)

    def test_create_unknown_mode_raises(self, factory):
        with pytest.raises(ValueError, match="Unknown execution mode"):
            factory.create("unknown_mode")

    def test_create_with_api_key(self, factory):
        from raccoon_runtime.runners.raw_runner import RawRunner

        runner = factory.create("raw", api_key="test-key")
        assert isinstance(runner, RawRunner)
        assert runner.api_key == "test-key"

    def test_create_claude_with_api_key(self, factory):
        from raccoon_runtime.runners.claude_runner import ClaudeRunner

        runner = factory.create("claude_sdk", api_key="test-key")
        assert isinstance(runner, ClaudeRunner)
        assert runner.api_key == "test-key"
