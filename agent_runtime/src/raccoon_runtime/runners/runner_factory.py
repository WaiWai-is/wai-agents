"""Creates the appropriate runner based on execution mode."""

from raccoon_runtime.config import Settings
from raccoon_runtime.runners.base_runner import BaseAgentRunner


class RunnerFactory:
    """Creates the appropriate runner based on execution mode."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def create(
        self,
        mode: str,
        api_key: str | None = None,
    ) -> BaseAgentRunner:
        match mode:
            case "raw":
                from raccoon_runtime.runners.raw_runner import RawRunner

                return RawRunner(self.settings, api_key)
            case "claude_sdk":
                from raccoon_runtime.runners.claude_runner import ClaudeRunner

                return ClaudeRunner(self.settings, api_key)
            case "openai_sdk":
                from raccoon_runtime.runners.openai_runner import OpenAIRunner

                return OpenAIRunner(self.settings, api_key)
            case _:
                raise ValueError(f"Unknown execution mode: {mode}")
