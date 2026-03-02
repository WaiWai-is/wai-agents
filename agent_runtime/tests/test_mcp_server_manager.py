"""Tests for MCPServerManager."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from raccoon_runtime.mcp.mcp_server_manager import ALLOWED_COMMANDS, MCPServerManager


class TestMCPServerManagerInit:
    def test_empty_state(self):
        mgr = MCPServerManager()
        assert mgr.connected_servers == []
        assert mgr.available_tools == []

    def test_has_tool_false_initially(self):
        mgr = MCPServerManager()
        assert mgr.has_tool("anything") is False


class TestAllowedCommands:
    def test_allowed_commands_whitelist(self):
        assert "python" in ALLOWED_COMMANDS
        assert "python3" in ALLOWED_COMMANDS
        assert "node" in ALLOWED_COMMANDS
        assert "npx" in ALLOWED_COMMANDS
        assert "uvx" in ALLOWED_COMMANDS
        assert "docker" in ALLOWED_COMMANDS


class TestConnectServers:
    @pytest.mark.asyncio
    async def test_reject_disallowed_command(self):
        mgr = MCPServerManager()
        with pytest.raises(ValueError, match="not in allowed list"):
            await mgr.connect_servers([{
                "name": "evil",
                "transport": "stdio",
                "command": "/bin/rm",
            }])

    @pytest.mark.asyncio
    async def test_reject_unknown_transport(self):
        mgr = MCPServerManager()
        with pytest.raises(ValueError, match="Unknown MCP transport"):
            await mgr.connect_servers([{
                "name": "test",
                "transport": "grpc",
                "command": "python",
            }])


class TestExecuteTool:
    @pytest.mark.asyncio
    async def test_execute_unknown_tool_raises(self):
        mgr = MCPServerManager()
        with pytest.raises(ValueError, match="Unknown MCP tool"):
            await mgr.execute_tool("nonexistent", {})


class TestDisconnectAll:
    @pytest.mark.asyncio
    async def test_disconnect_clears_state(self):
        mgr = MCPServerManager()
        # Simulate some internal state
        mgr._sessions["test"] = MagicMock()
        mgr._sessions["test"].__aexit__ = AsyncMock()
        mgr._tools["search"] = ("test", {})

        await mgr.disconnect_all()

        assert mgr.connected_servers == []
        assert mgr.available_tools == []
