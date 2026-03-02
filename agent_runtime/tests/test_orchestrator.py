"""Tests for the LLM orchestrator (backwards-compat wrapper around RawRunner)."""

import pytest

from raccoon_runtime.config import Settings
from raccoon_runtime.llm.orchestrator import LLMOrchestrator


class TestOrchestrator:
    def test_init(self):
        settings = Settings()
        orch = LLMOrchestrator(settings)
        assert orch.settings is settings
        assert orch._runner is None

    def test_submit_approval_no_runner_raises(self):
        settings = Settings()
        orch = LLMOrchestrator(settings)
        with pytest.raises(ValueError, match="No active runner"):
            orch.submit_approval_decision("req-1", True, "allow_once")
