"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables prefixed with RACCOON_."""

    # gRPC
    grpc_host: str = "127.0.0.1"
    grpc_port: int = 50051
    max_workers: int = 10
    max_message_size: int = 50 * 1024 * 1024  # 50MB

    # LLM providers
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    default_model: str = "claude-sonnet-4-6"

    # E2B
    e2b_api_key: str = ""
    sandbox_timeout: int = 300
    sandbox_max_cpu: int = 8
    sandbox_max_memory_mb: int = 8192

    # Deadlines (seconds) — from Runtime Reliability Policy
    agent_turn_deadline: int = 60
    tool_call_deadline: int = 20
    code_execution_deadline: int = 45

    # Agent execution limits
    max_agent_turns: int = 25  # Max tool-loop iterations per execution

    # Observability
    otel_endpoint: str = ""
    metrics_port: int = 9090

    model_config = {"env_prefix": "RACCOON_"}
