"""Main LLM orchestration logic.

Thin backwards-compatibility wrapper around RawRunner.
New code should use runners directly via RunnerFactory.
"""

from collections.abc import AsyncIterator
from typing import Any

import structlog

from raccoon_runtime.config import Settings
from raccoon_runtime.runners.raw_runner import RawRunner

logger = structlog.get_logger()


class LLMOrchestrator:
    """Orchestrates LLM calls via RawRunner.

    Maintained for backwards compatibility with existing agent_service.py.
    Delegates all work to RawRunner and converts AgentEvent back to dicts.
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._runner: RawRunner | None = None

    def submit_approval_decision(
        self,
        request_id: str,
        approved: bool,
        scope: str = "allow_once",
    ) -> None:
        """Submit an approval decision for a pending tool execution."""
        if self._runner is None:
            raise ValueError("No active runner")
        import asyncio

        loop = asyncio.get_event_loop()
        loop.create_task(self._runner.submit_approval(request_id, approved, scope))

    async def execute(
        self,
        messages: list[dict[str, str]],
        config: dict[str, Any],
        api_key: str | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Execute an agent turn with streaming.

        Yields event dicts for backwards compatibility.
        """
        runner = RawRunner(self.settings, api_key)
        self._runner = runner

        try:
            tools = config.get("tools", [])
            mcp_servers = config.get("mcp_servers", [])

            async for event in runner.execute(
                messages=messages,
                config=config,
                tools=tools,
                mcp_servers=mcp_servers,
            ):
                yield {"type": event.type, **event.data}
        finally:
            self._runner = None
