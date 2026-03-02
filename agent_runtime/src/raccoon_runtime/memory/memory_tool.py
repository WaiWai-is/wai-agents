"""Memory tools — save, search, forget agent memories via pgvector.

Connects directly to PostgreSQL (not through Elixir) for memory operations.
Uses pgvector's cosine distance operator for similarity search.
"""

import json
import os
import uuid
from typing import Any

import httpx
import structlog

from raccoon_runtime.memory.embeddings import EMBEDDING_DIM, generate_embedding

logger = structlog.get_logger()


def _get_db_url() -> str:
    """Get the database URL from environment."""
    return os.environ["RACCOON_DATABASE_URL"]


async def _get_connection():
    """Get an asyncpg connection to the database."""
    import asyncpg

    return await asyncpg.connect(_get_db_url())


async def save_memory(
    agent_id: str,
    user_id: str,
    content: str,
    api_key: str,
    importance: float = 0.5,
    memory_type: str = "observation",
    tags: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Save a memory for the given agent and user.

    Args:
        agent_id: The agent's UUID.
        user_id: The user's UUID.
        content: The memory content text.
        api_key: OpenAI API key for embedding generation.
        importance: Importance score 0.0-1.0 (default 0.5).
        memory_type: One of "observation", "reflection", "fact", "preference".
        tags: Optional list of tags.
        metadata: Optional metadata dict.

    Returns:
        The UUID of the created memory.
    """
    embedding = await generate_embedding(content, api_key)
    memory_id = str(uuid.uuid4())
    tags = tags or []
    metadata = metadata or {}

    conn = await _get_connection()
    try:
        await conn.execute(
            """
            INSERT INTO agent_memories
                (id, agent_id, user_id, content, embedding, importance,
                 memory_type, tags, metadata)
            VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, $9)
            """,
            uuid.UUID(memory_id),
            uuid.UUID(agent_id),
            uuid.UUID(user_id),
            content,
            str(embedding),
            importance,
            memory_type,
            tags,
            json.dumps(metadata),
        )
    finally:
        await conn.close()

    logger.info(
        "memory_saved",
        memory_id=memory_id,
        agent_id=agent_id,
        memory_type=memory_type,
    )
    return memory_id


async def search_memories(
    agent_id: str,
    user_id: str,
    query: str,
    api_key: str,
    limit: int = 10,
    memory_type: str | None = None,
) -> list[dict[str, Any]]:
    """Search memories by vector similarity.

    Uses pgvector cosine distance combined with importance and decay for relevance ranking.

    Args:
        agent_id: The agent's UUID.
        user_id: The user's UUID.
        query: The search query text.
        api_key: OpenAI API key for embedding generation.
        limit: Maximum number of results (default 10).
        memory_type: Optional filter by memory type.

    Returns:
        List of memory dicts with content, similarity, and relevance scores.
    """
    query_embedding = await generate_embedding(query, api_key)

    conn = await _get_connection()
    try:
        type_filter = ""
        params: list[Any] = [str(query_embedding), uuid.UUID(agent_id), uuid.UUID(user_id)]

        if memory_type:
            type_filter = "AND memory_type = $4"
            params.append(memory_type)

        params.append(limit)
        limit_param = f"${len(params)}"

        rows = await conn.fetch(
            f"""
            SELECT id, content, importance, memory_type, tags, metadata,
                1 - (embedding <=> $1::vector) AS similarity,
                importance * decay_factor * (1 - (embedding <=> $1::vector)) AS relevance_score
            FROM agent_memories
            WHERE agent_id = $2 AND user_id = $3 {type_filter}
            ORDER BY relevance_score DESC
            LIMIT {limit_param}
            """,
            *params,
        )

        # Update access count for retrieved memories
        memory_ids = [row["id"] for row in rows]
        if memory_ids:
            await conn.execute(
                """
                UPDATE agent_memories
                SET access_count = access_count + 1, last_accessed_at = NOW()
                WHERE id = ANY($1)
                """,
                memory_ids,
            )
    finally:
        await conn.close()

    return [
        {
            "id": str(row["id"]),
            "content": row["content"],
            "importance": row["importance"],
            "memory_type": row["memory_type"],
            "tags": row["tags"],
            "metadata": json.loads(row["metadata"]) if isinstance(row["metadata"], str) else row["metadata"],
            "similarity": float(row["similarity"]),
            "relevance_score": float(row["relevance_score"]),
        }
        for row in rows
    ]


async def forget_memory(memory_id: str) -> bool:
    """Delete a specific memory by ID.

    Args:
        memory_id: The UUID of the memory to delete.

    Returns:
        True if a memory was deleted, False if not found.
    """
    conn = await _get_connection()
    try:
        result = await conn.execute(
            "DELETE FROM agent_memories WHERE id = $1",
            uuid.UUID(memory_id),
        )
    finally:
        await conn.close()

    deleted = result == "DELETE 1"
    logger.info("memory_forgotten", memory_id=memory_id, deleted=deleted)
    return deleted
