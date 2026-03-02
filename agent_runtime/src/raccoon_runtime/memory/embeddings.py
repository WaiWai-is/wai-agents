"""Embedding generation using OpenAI text-embedding-3-small."""

import httpx
import structlog

logger = structlog.get_logger()

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


async def generate_embedding(text: str, api_key: str) -> list[float]:
    """Generate an embedding vector for the given text.

    Args:
        text: The text to embed.
        api_key: OpenAI API key.

    Returns:
        A 1536-dimensional embedding vector.
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/embeddings",
            json={"input": text, "model": EMBEDDING_MODEL},
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json()["data"][0]["embedding"]
