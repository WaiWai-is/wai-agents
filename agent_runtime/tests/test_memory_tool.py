"""Tests for memory tools (embeddings + memory_tool)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from raccoon_runtime.memory.embeddings import EMBEDDING_DIM, EMBEDDING_MODEL, generate_embedding


class TestEmbeddings:
    def test_constants(self):
        assert EMBEDDING_MODEL == "text-embedding-3-small"
        assert EMBEDDING_DIM == 1536

    @pytest.mark.asyncio
    async def test_generate_embedding(self):
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "data": [{"embedding": [0.1] * EMBEDDING_DIM}]
        }

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("raccoon_runtime.memory.embeddings.httpx.AsyncClient", return_value=mock_client):
            result = await generate_embedding("test text", "fake-api-key")

        assert len(result) == EMBEDDING_DIM
        assert all(isinstance(v, float) for v in result)
        mock_client.post.assert_called_once()
        call_kwargs = mock_client.post.call_args
        assert call_kwargs[1]["json"]["model"] == EMBEDDING_MODEL


class TestMemoryToolSave:
    @pytest.mark.asyncio
    async def test_save_memory_calls_db(self):
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.close = AsyncMock()

        with (
            patch("raccoon_runtime.memory.memory_tool._get_connection", return_value=mock_conn),
            patch(
                "raccoon_runtime.memory.memory_tool.generate_embedding",
                return_value=[0.1] * EMBEDDING_DIM,
            ),
        ):
            from raccoon_runtime.memory.memory_tool import save_memory

            memory_id = await save_memory(
                agent_id="00000000-0000-0000-0000-000000000001",
                user_id="00000000-0000-0000-0000-000000000002",
                content="The user prefers dark mode",
                api_key="fake-key",
                importance=0.8,
                memory_type="preference",
                tags=["ui", "preference"],
            )

        assert memory_id is not None
        mock_conn.execute.assert_called_once()
        mock_conn.close.assert_called_once()


class TestMemoryToolSearch:
    @pytest.mark.asyncio
    async def test_search_memories(self):
        mock_row = {
            "id": "00000000-0000-0000-0000-000000000099",
            "content": "User likes dark mode",
            "importance": 0.8,
            "memory_type": "preference",
            "tags": ["ui"],
            "metadata": "{}",
            "similarity": 0.95,
            "relevance_score": 0.76,
        }
        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[mock_row])
        mock_conn.execute = AsyncMock()
        mock_conn.close = AsyncMock()

        with (
            patch("raccoon_runtime.memory.memory_tool._get_connection", return_value=mock_conn),
            patch(
                "raccoon_runtime.memory.memory_tool.generate_embedding",
                return_value=[0.1] * EMBEDDING_DIM,
            ),
        ):
            from raccoon_runtime.memory.memory_tool import search_memories

            results = await search_memories(
                agent_id="00000000-0000-0000-0000-000000000001",
                user_id="00000000-0000-0000-0000-000000000002",
                query="dark mode",
                api_key="fake-key",
                limit=5,
            )

        assert len(results) == 1
        assert results[0]["content"] == "User likes dark mode"
        assert results[0]["similarity"] == 0.95


class TestMemoryToolForget:
    @pytest.mark.asyncio
    async def test_forget_memory_success(self):
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value="DELETE 1")
        mock_conn.close = AsyncMock()

        with patch("raccoon_runtime.memory.memory_tool._get_connection", return_value=mock_conn):
            from raccoon_runtime.memory.memory_tool import forget_memory

            result = await forget_memory("00000000-0000-0000-0000-000000000099")

        assert result is True

    @pytest.mark.asyncio
    async def test_forget_memory_not_found(self):
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value="DELETE 0")
        mock_conn.close = AsyncMock()

        with patch("raccoon_runtime.memory.memory_tool._get_connection", return_value=mock_conn):
            from raccoon_runtime.memory.memory_tool import forget_memory

            result = await forget_memory("00000000-0000-0000-0000-000000000099")

        assert result is False
