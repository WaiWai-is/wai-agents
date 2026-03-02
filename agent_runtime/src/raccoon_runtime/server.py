"""gRPC server entry point."""

import asyncio

import grpc
import structlog

from raccoon_runtime.config import Settings
from raccoon_runtime.generated.raccoon.agent.v1 import agent_service_pb2_grpc
from raccoon_runtime.services.agent_service import AgentServiceServicer
from raccoon_runtime.services.sandbox_service import SandboxServiceServicer

logger = structlog.get_logger()


async def serve(settings: Settings) -> None:
    """Start the async gRPC server with AgentService and SandboxService."""
    server = grpc.aio.server(
        options=[
            ("grpc.max_send_message_length", settings.max_message_size),
            ("grpc.max_receive_message_length", settings.max_message_size),
        ],
    )

    # Instantiate service implementations
    agent_service = AgentServiceServicer(settings)
    sandbox_service = SandboxServiceServicer(settings)

    # Register services with the gRPC server via generated protobuf descriptors
    agent_service_pb2_grpc.add_AgentServiceServicer_to_server(agent_service, server)
    agent_service_pb2_grpc.add_SandboxServiceServicer_to_server(sandbox_service, server)

    logger.info(
        "services_registered",
        agent_service=type(agent_service).__name__,
        sandbox_service=type(sandbox_service).__name__,
    )

    listen_addr = f"{settings.grpc_host}:{settings.grpc_port}"
    server.add_insecure_port(listen_addr)

    logger.info("starting_grpc_server", address=listen_addr)
    await server.start()
    logger.info("grpc_server_started", port=settings.grpc_port)
    await server.wait_for_termination()


def main() -> None:
    """Configure logging and run the gRPC server."""
    settings = Settings()
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ]
    )
    asyncio.run(serve(settings))
