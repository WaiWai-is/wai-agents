"""Abstract base for agent execution runners."""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any


@dataclass
class AgentEvent:
    """Unified event type emitted by all runners.

    type: token, status, tool_call, tool_result, code_block,
          approval_requested, complete, error
    data: event-specific payload dict
    """

    type: str
    data: dict[str, Any]


class BaseAgentRunner(ABC):
    """Abstract interface for agent execution."""

    @abstractmethod
    async def execute(
        self,
        messages: list[dict[str, str]],
        config: dict[str, Any],
        tools: list[dict[str, Any]],
        mcp_servers: list[dict[str, Any]],
    ) -> AsyncIterator[AgentEvent]:
        """Execute an agent turn. Yields AgentEvent instances."""
        ...

    @abstractmethod
    async def submit_approval(
        self,
        request_id: str,
        approved: bool,
        scope: str,
    ) -> None:
        """Submit an approval decision for a pending tool call."""
        ...

    @abstractmethod
    async def cancel(self) -> None:
        """Cancel the current execution."""
        ...
