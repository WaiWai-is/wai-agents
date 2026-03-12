# SPECS_AGENTS.md — WaiAgents Agent Platform Technical Specification

## 1. Executive Summary

WaiAgents is an Elixir/Phoenix + Python gRPC + Next.js + SwiftUI platform that currently supports basic agent chat via LLM streaming. This spec transforms it into a full **event-driven agent platform** with:

- **MCP tool ecosystem** — agents use real tools (web search, filesystem, code execution, memory, 30+ integrations) via the Model Context Protocol
- **Persistent agent memory** — PostgreSQL + pgvector for per-agent, per-user memory with vector similarity retrieval
- **Multi-SDK execution** — support for raw streaming (existing), Claude Agent SDK, and OpenAI Agents SDK
- **30+ integrations** — Gmail, Calendar, GitHub, Slack, Discord, Notion, and more via OAuth 2.0
- **Scheduling** — cron, interval, and one-shot triggers via Oban
- **Channel routing** — same agent accessible from web, Telegram, WhatsApp, and future platforms

**Architecture principle:** Lightweight Elixir supervisor always running, LLM called on-demand per event. No persistent Python processes per agent — the Python sidecar is stateless and handles execution turns.

**Resource constraint:** Hetzner CPX22 (4 vCPU, 4GB RAM + 4GB swap). All designs must fit within ~2GB for agent runtime, leaving headroom for Phoenix, PostgreSQL, and the OS.

---

## 2. Current State Assessment

### 2.1 What Works

| Component | Status | Location |
|-----------|--------|----------|
| Agent CRUD | Working | `wai_agents_agents/agent.ex` — schema with name, slug, system_prompt, model, temperature, max_tokens, tools, mcp_servers, visibility, category, metadata |
| gRPC streaming | Working | `agent_executor.ex` → `grpc_client.ex` → Python `agent_service.py` → `orchestrator.py` |
| LLM providers | Working | `AnthropicProvider` (Claude) + `OpenAIProvider` (GPT) with BYOK support |
| Event pipeline | Working | 8 event types: token, status, tool_call, tool_result, code_block, approval_requested, complete, error |
| WebSocket channels | Working | `AgentChannel` (`agent:{conversation_id}`) streams events to clients |
| Marketplace | Working | Public agent discovery, search, categories, ratings |
| Bridges | Working | Telegram (polling) + WhatsApp (webhooks) with media handling, encrypted credentials |
| Cost tracking | Working | `CostTracker` GenServer with per-user token accounting and limits |
| Tool approval flow (partial) | Working | Scopes: allow_once, allow_for_session, always_for_agent_tool. ETS storage via `ToolApproval.Store` |
| Oban job system | Working | 7 queues configured: default, mailers, media, bridges, agents, feed, maintenance |
| Web chat UI | Working | Real-time streaming, tool log, approval cards, typing indicators |

### 2.2 What's Broken or Missing

#### Tool registry is empty
The Python `ToolRegistry` (`agent_runtime/src/wai_agents_runtime/mcp/tool_registry.py`) has full register/validate/execute logic but **zero tools are registered at startup**. The `LLMOrchestrator` instantiates `ToolRegistry()` with no registrations, so `execute_tool()` always raises `ValueError("No handler registered for tool: ...")`.

#### Tool approval bridge is incomplete
The approval flow is split across two processes that never connect:
1. **Elixir side:** `AgentChannel.handle_in("approval_decision")` records the decision via `ToolApproval.record_decision()` and broadcasts `approval_granted`/`approval_denied` on PubSub — but **never sends the decision back to Python**.
2. **Python side:** `LLMOrchestrator.submit_approval_decision()` exists and correctly unblocks the `asyncio.Event` — but **nothing ever calls it**. The gRPC `ExecuteAgent` is a server-streaming RPC (client sends one request, server streams responses). There is no bidirectional mechanism for the client to send an approval decision mid-stream.

**Result:** When an agent requests tool approval, the orchestrator blocks on `await approval_event.wait()` forever (until the 60s deadline kills it).

#### MCP servers stored but never connected
The `Agent` schema has an `mcp_servers` field (`{:array, :map}`, default `[]`), but:
- The field is never read during execution
- No MCP client exists in the Python runtime
- The `AgentConfig` proto has a `tools` field but no `mcp_servers` field
- There is no code to connect to MCP servers, discover tools, or route tool calls through MCP

#### AgentExecutionWorker is a placeholder
`agent_execution_worker.ex` defines an Oban worker with `execute` and `cleanup_stale` tasks but the execution path duplicates `AgentExecutor` without the streaming infrastructure. It's a dead code path.

### 2.3 Current Architecture Diagram

```
                    ┌─────────────┐
                    │  Next.js    │ port 3000
                    │  Web App    │
                    └──────┬──────┘
                           │ WebSocket + REST
                    ┌──────┴──────┐
                    │   Nginx     │ port 443
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
       ┌──────┴──────┐          ┌──────┴──────┐
       │   Phoenix   │ port 4000│   Phoenix   │
       │   REST API  │          │  WebSocket  │
       └──────┬──────┘          └──────┬──────┘
              │                        │
              │   Phoenix PubSub       │
              │   (agent:{conv_id})    │
              │                        │
       ┌──────┴──────┐                 │
       │   Agent     │─────────────────┘
       │   Executor  │
       └──────┬──────┘
              │ gRPC (unary → server stream)
       ┌──────┴──────┐
       │   Python    │ port 50051
       │   Sidecar   │
       │  ┌────────┐ │
       │  │Orchestr.│ │
       │  │ToolReg. │ │ ← empty, no tools
       │  │Providers│ │
       │  └────────┘ │
       └─────────────┘
```

---

## 3. Agent Runtime Redesign

### 3.1 Execution Modes

Add an `execution_mode` field to the `Agent` schema:

```elixir
field(:execution_mode, Ecto.Enum,
  values: [:raw, :claude_sdk, :openai_sdk],
  default: :raw)
```

| Mode | Description | Python Module |
|------|-------------|---------------|
| `raw` | Existing provider-based streaming (Anthropic/OpenAI APIs directly) | `raw_runner.py` (refactored from current `orchestrator.py`) |
| `claude_sdk` | Claude Agent SDK with built-in tool loop, computer use, MCP | `claude_runner.py` |
| `openai_sdk` | OpenAI Agents SDK with handoffs, guardrails, tracing | `openai_runner.py` |

### 3.2 Python Module Structure

```
agent_runtime/src/wai_agents_runtime/
├── runners/
│   ├── __init__.py
│   ├── base_runner.py        # Abstract interface
│   ├── raw_runner.py         # Refactored orchestrator.py
│   ├── claude_runner.py      # Claude Agent SDK wrapper
│   ├── openai_runner.py      # OpenAI Agents SDK wrapper
│   └── event_adapter.py      # Normalize SDK events → AgentEvent
├── mcp/
│   ├── __init__.py
│   ├── tool_registry.py      # Existing (will be populated)
│   ├── mcp_client.py         # MCP SDK client (rewrite)
│   └── mcp_server_manager.py # Per-execution MCP lifecycle
├── memory/
│   ├── __init__.py
│   └── memory_tool.py        # save_memory / search_memory tools
└── services/
    ├── agent_service.py       # Updated to route by execution_mode
    └── runner_factory.py      # Creates runner by mode
```

### 3.3 BaseAgentRunner Interface

```python
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any


@dataclass
class AgentEvent:
    """Unified event type emitted by all runners."""
    type: str  # token, status, tool_call, tool_result, code_block,
               # approval_requested, complete, error
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
```

### 3.4 Proto Changes

Add to `agent_service.proto`:

```protobuf
// New message for MCP server configuration
message MCPServerConfig {
  string name = 1;
  string transport = 2;      // "stdio" | "sse" | "streamable_http"
  string command = 3;         // For stdio: command to run
  repeated string args = 4;   // For stdio: command arguments
  string url = 5;             // For sse/streamable_http: server URL
  map<string, string> env = 6; // Environment variables
  map<string, string> headers = 7; // HTTP headers (for auth)
}

// Add to AgentConfig
message AgentConfig {
  // ... existing fields ...
  string execution_mode = 8;              // "raw", "claude_sdk", "openai_sdk"
  repeated MCPServerConfig mcp_servers = 9; // MCP server configs
}

// New bidirectional RPC for approval
service AgentService {
  // ... existing RPCs ...

  // SubmitApproval sends an approval decision to a running execution.
  rpc SubmitApproval (ApprovalDecision) returns (ApprovalAck);
}

message ApprovalDecision {
  string conversation_id = 1;
  string request_id = 2;
  bool approved = 3;
  string scope = 4;   // "allow_once", "allow_for_session", "always_for_agent_tool"
}

message ApprovalAck {
  bool accepted = 1;
  string error = 2;
}
```

### 3.5 Runner Factory

```python
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
                return RawRunner(self.settings, api_key)
            case "claude_sdk":
                return ClaudeRunner(self.settings, api_key)
            case "openai_sdk":
                return OpenAIRunner(self.settings, api_key)
            case _:
                raise ValueError(f"Unknown execution mode: {mode}")
```

### 3.6 Updated AgentServiceServicer

The servicer must track active runners to support `SubmitApproval`:

```python
class AgentServiceServicer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.factory = RunnerFactory(settings)
        # Active runners keyed by conversation_id
        self._active_runners: dict[str, BaseAgentRunner] = {}

    async def ExecuteAgent(self, request, context):
        mode = request.config.execution_mode or "raw"
        runner = self.factory.create(mode, request.user_api_key or None)
        self._active_runners[request.conversation_id] = runner

        try:
            mcp_configs = [
                {
                    "name": s.name,
                    "transport": s.transport,
                    "command": s.command,
                    "args": list(s.args),
                    "url": s.url,
                    "env": dict(s.env),
                    "headers": dict(s.headers),
                }
                for s in (request.config.mcp_servers or [])
            ]

            async for event in runner.execute(
                messages=msg_dicts,
                config=config_dict,
                tools=tool_dicts,
                mcp_servers=mcp_configs,
            ):
                yield self._event_to_response(event)
        finally:
            self._active_runners.pop(request.conversation_id, None)

    async def SubmitApproval(self, request, context):
        runner = self._active_runners.get(request.conversation_id)
        if not runner:
            return pb2.ApprovalAck(
                accepted=False,
                error="No active execution for conversation"
            )
        await runner.submit_approval(
            request.request_id,
            request.approved,
            request.scope,
        )
        return pb2.ApprovalAck(accepted=True)
```

---

## 4. Agent Supervisor System (Elixir)

### 4.1 Overview

Replace ad-hoc `AgentExecutor` GenServer spawning with a formal supervision tree:

```
Application
└── AgentSupervisor (DynamicSupervisor, max_children: 20)
    ├── AgentProcess (GenServer, :temporary) — conversation A
    ├── AgentProcess (GenServer, :temporary) — conversation B
    └── ...

EventRouter (GenServer) — routes triggers to AgentProcess instances
ProcessRegistry (Registry) — lookup by {conversation_id, agent_id}
```

### 4.2 Module: `WaiAgentsAgents.AgentSupervisor`

New umbrella app location: `wai_agents/apps/wai_agents_agents/lib/wai_agents_agents/agent_supervisor.ex`

```elixir
defmodule WaiAgentsAgents.AgentSupervisor do
  use DynamicSupervisor

  def start_link(_opts) do
    DynamicSupervisor.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @impl true
  def init(:ok) do
    DynamicSupervisor.init(
      strategy: :one_for_one,
      max_children: 20
    )
  end

  def start_agent(conversation_id, agent_id, user_id, opts \\ []) do
    spec = {
      WaiAgentsAgents.AgentProcess,
      %{
        conversation_id: conversation_id,
        agent_id: agent_id,
        user_id: user_id,
        opts: opts
      }
    }

    DynamicSupervisor.start_child(__MODULE__, spec)
  end

  def stop_agent(conversation_id, agent_id) do
    case ProcessRegistry.lookup(conversation_id, agent_id) do
      {:ok, pid} -> DynamicSupervisor.terminate_child(__MODULE__, pid)
      :error -> {:error, :not_found}
    end
  end

  def active_count do
    DynamicSupervisor.count_children(__MODULE__).active
  end
end
```

### 4.3 Module: `WaiAgentsAgents.AgentProcess`

```elixir
defmodule WaiAgentsAgents.AgentProcess do
  use GenServer, restart: :temporary

  @idle_timeout :timer.minutes(5)

  defstruct [
    :conversation_id,
    :agent_id,
    :user_id,
    :agent,
    :execution_pid,
    started_at: nil,
    last_activity: nil
  ]

  def start_link(init_arg) do
    GenServer.start_link(__MODULE__, init_arg,
      name: via(init_arg.conversation_id, init_arg.agent_id)
    )
  end

  # Public API
  def execute(conversation_id, agent_id, messages, config) do
    GenServer.call(
      via(conversation_id, agent_id),
      {:execute, messages, config}
    )
  end

  def submit_approval(conversation_id, agent_id, request_id, approved, scope) do
    GenServer.cast(
      via(conversation_id, agent_id),
      {:submit_approval, request_id, approved, scope}
    )
  end

  # Callbacks
  @impl true
  def init(args) do
    agent = WaiAgentsAgents.get_agent!(args.agent_id)
    now = System.monotonic_time(:millisecond)

    state = %__MODULE__{
      conversation_id: args.conversation_id,
      agent_id: args.agent_id,
      user_id: args.user_id,
      agent: agent,
      started_at: now,
      last_activity: now
    }

    {:ok, state, @idle_timeout}
  end

  @impl true
  def handle_call({:execute, messages, config}, _from, state) do
    # Delegate to AgentExecutor (existing gRPC streaming logic)
    {:ok, pid} = WaiAgentsAgents.AgentExecutor.execute(
      state.conversation_id,
      state.agent_id,
      state.user_id,
      messages,
      config
    )

    state = %{state |
      execution_pid: pid,
      last_activity: System.monotonic_time(:millisecond)
    }

    {:reply, {:ok, pid}, state, @idle_timeout}
  end

  @impl true
  def handle_cast({:submit_approval, request_id, approved, scope}, state) do
    # Forward to Python sidecar via new SubmitApproval RPC
    WaiAgentsAgents.GRPCClient.submit_approval(
      state.conversation_id,
      request_id,
      approved,
      scope
    )

    {:noreply, %{state | last_activity: System.monotonic_time(:millisecond)}, @idle_timeout}
  end

  @impl true
  def handle_info(:timeout, state) do
    # Idle timeout — shut down
    {:stop, :normal, state}
  end

  defp via(conversation_id, agent_id) do
    {:via, Registry, {WaiAgentsAgents.ProcessRegistry, {conversation_id, agent_id}}}
  end
end
```

### 4.4 Module: `WaiAgentsAgents.ProcessRegistry`

```elixir
# In application.ex children:
{Registry, keys: :unique, name: WaiAgentsAgents.ProcessRegistry}
```

### 4.5 Module: `WaiAgentsAgents.EventRouter`

Routes inbound triggers to the correct `AgentProcess`:

```elixir
defmodule WaiAgentsAgents.EventRouter do
  use GenServer

  @trigger_types [:user_message, :cron_schedule, :webhook,
                  :channel_message, :api_call]

  def route_trigger(trigger_type, payload) when trigger_type in @trigger_types do
    GenServer.cast(__MODULE__, {:trigger, trigger_type, payload})
  end

  @impl true
  def handle_cast({:trigger, :user_message, payload}, state) do
    %{conversation_id: conv_id, agent_id: agent_id, user_id: user_id,
      messages: messages, config: config} = payload

    # Find or start agent process
    case Registry.lookup(WaiAgentsAgents.ProcessRegistry, {conv_id, agent_id}) do
      [{_pid, _}] ->
        AgentProcess.execute(conv_id, agent_id, messages, config)

      [] ->
        {:ok, _pid} = AgentSupervisor.start_agent(conv_id, agent_id, user_id)
        AgentProcess.execute(conv_id, agent_id, messages, config)
    end

    {:noreply, state}
  end

  # Similar handlers for :cron_schedule, :webhook, :channel_message, :api_call
end
```

### 4.6 Resource Budget

| Component | Per-instance | Max instances | Total |
|-----------|-------------|---------------|-------|
| AgentProcess (GenServer) | ~50KB | 20 | 1MB |
| gRPC stream (during execution) | ~5MB | 5 concurrent | 25MB |
| MCP server connections | ~20MB | 10 (across all) | 200MB |
| LLM context windows (Python) | ~50MB | 5 concurrent | 250MB |
| **Total agent runtime** | | | **~500MB** |

Fits well within the 2GB budget, leaving 1.5GB headroom for spikes.

---

## 5. MCP Server Integration

### 5.1 Rewrite MCPClient

Replace the empty MCP integration with the official `mcp` Python SDK.

**Dependency:** `pip install mcp` (Model Context Protocol SDK)

### 5.2 MCPServerManager

```python
# agent_runtime/src/wai_agents_runtime/mcp/mcp_server_manager.py

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.sse import sse_client


class MCPServerManager:
    """Manages MCP server connections for a single agent execution."""

    def __init__(self) -> None:
        self._sessions: dict[str, ClientSession] = {}
        self._tools: dict[str, tuple[str, dict]] = {}  # tool_name → (server_name, schema)

    async def connect_servers(
        self, configs: list[dict]
    ) -> None:
        """Connect to all configured MCP servers."""
        for config in configs:
            name = config["name"]
            transport = config.get("transport", "stdio")

            if transport == "stdio":
                params = StdioServerParameters(
                    command=config["command"],
                    args=config.get("args", []),
                    env=config.get("env"),
                )
                read_stream, write_stream = await stdio_client(params).__aenter__()
                session = ClientSession(read_stream, write_stream)

            elif transport in ("sse", "streamable_http"):
                read_stream, write_stream = await sse_client(
                    url=config["url"],
                    headers=config.get("headers"),
                ).__aenter__()
                session = ClientSession(read_stream, write_stream)

            await session.initialize()
            self._sessions[name] = session

    async def discover_all_tools(self) -> list[dict]:
        """Discover tools from all connected servers.
        Returns list of tool schemas in LLM-compatible format."""
        all_tools = []
        for server_name, session in self._sessions.items():
            result = await session.list_tools()
            for tool in result.tools:
                schema = {
                    "name": tool.name,
                    "description": tool.description or "",
                    "input_schema": tool.inputSchema,
                }
                self._tools[tool.name] = (server_name, schema)
                all_tools.append(schema)
        return all_tools

    async def execute_tool(
        self, tool_name: str, arguments: dict
    ) -> str:
        """Execute a tool on the appropriate MCP server."""
        server_name, _ = self._tools[tool_name]
        session = self._sessions[server_name]
        result = await session.call_tool(tool_name, arguments)
        # Concatenate text content from result
        return "\n".join(
            block.text for block in result.content
            if hasattr(block, "text")
        )

    async def disconnect_all(self) -> None:
        """Disconnect from all MCP servers."""
        for session in self._sessions.values():
            try:
                await session.__aexit__(None, None, None)
            except Exception:
                pass
        self._sessions.clear()
        self._tools.clear()
```

### 5.3 Integration with ToolRegistry

During execution, the runner:
1. Creates an `MCPServerManager` instance
2. Calls `connect_servers()` with configs from the agent's `mcp_servers` field
3. Calls `discover_all_tools()` to get all available tool schemas
4. Registers each discovered tool in the `ToolRegistry` with a handler that routes through `MCPServerManager.execute_tool()`
5. Passes combined tool schemas to the LLM provider
6. On execution complete, calls `disconnect_all()`

```python
# In RawRunner.execute():
mcp_manager = MCPServerManager()
try:
    await mcp_manager.connect_servers(mcp_servers)
    mcp_tools = await mcp_manager.discover_all_tools()

    # Register MCP tools in the registry
    for tool in mcp_tools:
        self.tool_registry.register_tool(
            name=tool["name"],
            schema=tool["input_schema"],
            handler=lambda args, tn=tool["name"]: mcp_manager.execute_tool(tn, args),
        )

    # ... execute LLM with tools ...
finally:
    await mcp_manager.disconnect_all()
```

### 5.4 Built-in MCP Servers

These ship with the platform and are available to all agents:

| Server | Transport | Purpose | Command |
|--------|-----------|---------|---------|
| `waiagents-memory` | stdio | Agent memory (save/search/forget) | `python -m wai_agents_runtime.mcp.memory_server` |
| `waiagents-web-search` | stdio | Web search via Exa API | `python -m wai_agents_runtime.mcp.web_search_server` |
| `waiagents-code-exec` | stdio | Sandboxed code execution | `python -m wai_agents_runtime.mcp.code_exec_server` |
| `waiagents-filesystem` | stdio | Sandboxed file read/write | `python -m wai_agents_runtime.mcp.filesystem_server` |

### 5.5 User-Configurable MCP Servers

Users configure additional MCP servers per agent via the existing `mcp_servers` schema field. The web/native UIs provide a form to add servers:

```json
{
  "name": "my-github-server",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "{{integration:github:access_token}}"
  }
}
```

The `{{integration:service:field}}` syntax is resolved at execution time from the user's stored integration credentials.

### 5.6 Security

- **Command whitelist for stdio:** Only allow known commands (`python`, `node`, `npx`, `uvx`, `docker`). Reject arbitrary binaries.
- **Sandbox directories:** Filesystem MCP server restricted to `/tmp/waiagents-sandbox/{conversation_id}/`.
- **Network isolation:** MCP servers run in the same process space. Future: Docker isolation per execution.
- **Credential injection:** Integration tokens are resolved server-side; never sent to the client.

---

## 6. Scheduling System

### 6.1 Database Table: `agent_schedules`

```sql
CREATE TABLE agent_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_type VARCHAR(20) NOT NULL,  -- 'cron', 'interval', 'once'
  cron_expression VARCHAR(100),         -- e.g. "0 9 * * 1-5"
  interval_seconds INTEGER,             -- e.g. 3600
  run_at        TIMESTAMPTZ,            -- for one-time schedules
  enabled       BOOLEAN NOT NULL DEFAULT true,
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ,
  run_count     INTEGER NOT NULL DEFAULT 0,
  max_runs      INTEGER,                -- NULL = unlimited
  payload       JSONB NOT NULL DEFAULT '{}',  -- context passed to agent
  metadata      JSONB NOT NULL DEFAULT '{}',
  inserted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_schedules_agent_id ON agent_schedules(agent_id);
CREATE INDEX idx_agent_schedules_next_run ON agent_schedules(next_run_at)
  WHERE enabled = true;
```

### 6.2 Ecto Schema

```elixir
defmodule WaiAgentsAgents.AgentSchedule do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "agent_schedules" do
    belongs_to :agent, WaiAgentsAgents.Agent
    belongs_to :user, WaiAgentsAccounts.User

    field :schedule_type, Ecto.Enum, values: [:cron, :interval, :once]
    field :cron_expression, :string
    field :interval_seconds, :integer
    field :run_at, :utc_datetime_usec
    field :enabled, :boolean, default: true
    field :last_run_at, :utc_datetime_usec
    field :next_run_at, :utc_datetime_usec
    field :run_count, :integer, default: 0
    field :max_runs, :integer
    field :payload, :map, default: %{}
    field :metadata, :map, default: %{}

    timestamps(type: :utc_datetime_usec)
  end
end
```

### 6.3 Oban Worker: `AgentScheduleWorker`

Uses the existing `:agents` queue (concurrency: 5).

**Self-rescheduling pattern:** The worker executes the agent, then re-inserts the next job with the computed `scheduled_at` timestamp.

```elixir
defmodule WaiAgentsAgents.Workers.AgentScheduleWorker do
  use Oban.Worker, queue: :agents, max_attempts: 2

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"schedule_id" => schedule_id}}) do
    schedule = Repo.get!(AgentSchedule, schedule_id) |> Repo.preload(:agent)

    if not schedule.enabled do
      :ok
    else
      # 1. Execute the agent
      execute_scheduled_agent(schedule)

      # 2. Update run count and last_run_at
      update_schedule_after_run(schedule)

      # 3. Re-schedule next run (unless max_runs reached or one-shot)
      maybe_schedule_next(schedule)

      :ok
    end
  end

  defp maybe_schedule_next(%{schedule_type: :once}), do: :ok
  defp maybe_schedule_next(%{max_runs: max, run_count: count})
    when is_integer(max) and count + 1 >= max, do: :ok
  defp maybe_schedule_next(schedule) do
    next_at = compute_next_run(schedule)

    %{"schedule_id" => schedule.id}
    |> __MODULE__.new(scheduled_at: next_at)
    |> Oban.insert!()
  end
end
```

### 6.4 Cron Parsing

Use the `crontab` Hex package for cron expression parsing:

```elixir
defp compute_next_run(%{schedule_type: :cron, cron_expression: expr}) do
  {:ok, cron} = Crontab.CronExpression.Parser.parse(expr)
  Crontab.Scheduler.get_next_run_date!(cron)
  |> DateTime.from_naive!("Etc/UTC")
end

defp compute_next_run(%{schedule_type: :interval, interval_seconds: seconds}) do
  DateTime.utc_now() |> DateTime.add(seconds, :second)
end
```

### 6.5 API Endpoints

Add to the authenticated scope in `router.ex`:

```elixir
# Schedules
get "/agents/:agent_id/schedules", ScheduleController, :index
post "/agents/:agent_id/schedules", ScheduleController, :create
get "/agents/:agent_id/schedules/:id", ScheduleController, :show
patch "/agents/:agent_id/schedules/:id", ScheduleController, :update
delete "/agents/:agent_id/schedules/:id", ScheduleController, :delete
```

---

## 7. Agent Memory (pgvector)

### 7.1 Prerequisites

Install pgvector extension on the production PostgreSQL instance:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 7.2 Database Table: `agent_memories`

```sql
CREATE TABLE agent_memories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  embedding     vector(1536) NOT NULL,
  importance    FLOAT NOT NULL DEFAULT 0.5,   -- 0.0 to 1.0
  memory_type   VARCHAR(20) NOT NULL DEFAULT 'observation',  -- observation, reflection, fact, preference
  tags          TEXT[] DEFAULT '{}',
  access_count  INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  decay_factor  FLOAT NOT NULL DEFAULT 1.0,   -- Decays over time
  metadata      JSONB NOT NULL DEFAULT '{}',
  inserted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IVFFlat index: lower memory than HNSW, adequate for thousands of memories
-- Lists = 100 is good for up to ~100K rows
CREATE INDEX idx_agent_memories_embedding ON agent_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_agent_memories_agent_user ON agent_memories(agent_id, user_id);
CREATE INDEX idx_agent_memories_type ON agent_memories(memory_type);
```

### 7.3 Embedding Generation

Use OpenAI `text-embedding-3-small` (1536 dimensions):
- Cost: $0.02 per 1M tokens (~negligible)
- Offloads compute from the server (no local model needed)
- ~100ms per embedding call

```python
# agent_runtime/src/wai_agents_runtime/memory/embeddings.py

import httpx

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


async def generate_embedding(text: str, api_key: str) -> list[float]:
    """Generate an embedding vector for the given text."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/embeddings",
            json={"input": text, "model": EMBEDDING_MODEL},
            headers={"Authorization": f"Bearer {api_key}"},
        )
        response.raise_for_status()
        return response.json()["data"][0]["embedding"]
```

### 7.4 Memory Retrieval

Retrieval combines vector similarity, importance, and temporal decay:

```sql
SELECT id, content, importance, memory_type, tags, metadata,
  1 - (embedding <=> $1::vector) AS similarity,
  importance * decay_factor * (1 - (embedding <=> $1::vector)) AS relevance_score
FROM agent_memories
WHERE agent_id = $2 AND user_id = $3
ORDER BY relevance_score DESC
LIMIT $4;
```

The top-K memories (default K=10) are injected into the system prompt as context.

### 7.5 Memory Tools (MCP)

The built-in `waiagents-memory` MCP server exposes these tools:

| Tool | Description | Parameters |
|------|-------------|------------|
| `save_memory` | Save a memory for the current user | `content: str`, `importance: float` (0-1), `memory_type: str`, `tags: list[str]` |
| `search_memories` | Search relevant memories | `query: str`, `limit: int` (default 10), `memory_type: str` (optional) |
| `forget_memory` | Delete a specific memory | `memory_id: str` |

The agent calls these tools naturally during conversation. Example system prompt addition:

```
You have persistent memory. Use the save_memory tool to remember important information
about the user (preferences, facts, decisions). Use search_memories before answering
questions where past context might be relevant.
```

### 7.6 Memory Lifecycle

- **Decay:** Daily Oban cron job reduces `decay_factor` by 5% for memories not accessed in 7+ days.
- **Pruning:** When a user-agent pair exceeds 500 memories, the lowest-relevance memories are deleted.
- **Retention by tier:** Free = 7 days, Pro = 90 days, Enterprise = unlimited.

```elixir
# Add to Oban cron config:
{"0 2 * * *", WaiAgentsAgents.Workers.MemoryDecayWorker}
```

---

## 8. Integration Platform

### 8.1 New Umbrella App: `wai_agents_integrations`

```
wai_agents/apps/wai_agents_integrations/
├── lib/
│   ├── wai_agents_integrations.ex           # Public API
│   ├── wai_agents_integrations/
│   │   ├── integration.ex                # Behaviour definition
│   │   ├── registry.ex                   # Compile-time integration registry
│   │   ├── oauth.ex                      # Generic OAuth 2.0 + PKCE flow
│   │   ├── credential.ex                 # Encrypted credential schema
│   │   ├── rate_limiter.ex               # Per-integration rate limiting
│   │   ├── token_refresher.ex            # Proactive token refresh
│   │   ├── webhook_handler.ex            # Inbound webhook processing
│   │   └── integrations/
│   │       ├── telegram.ex               # Upgraded from bridges
│   │       ├── whatsapp.ex               # Upgraded from bridges
│   │       ├── gmail.ex
│   │       ├── google_calendar.ex
│   │       ├── google_drive.ex
│   │       ├── github.ex
│   │       ├── slack.ex
│   │       ├── discord.ex
│   │       ├── notion.ex
│   │       └── twitter.ex
│   └── ...
├── test/
└── mix.exs
```

### 8.2 Integration Behaviour

```elixir
defmodule WaiAgentsIntegrations.Integration do
  @moduledoc "Behaviour that all integrations must implement."

  @type auth_method :: :oauth2 | :oauth2_pkce | :bot_token | :api_key
  @type capability :: :read | :write | :webhook | :realtime

  @callback service_name() :: String.t()
  @callback auth_method() :: auth_method()
  @callback oauth_config() :: map()  # client_id, scopes, auth_url, token_url
  @callback capabilities() :: [capability()]
  @callback rate_limits() :: map()  # %{requests_per_minute: N, ...}
  @callback normalize_webhook(map()) :: {:ok, IntegrationEvent.t()} | {:error, term()}
  @callback verify_webhook(map(), binary()) :: :ok | {:error, term()}
  @callback execute_action(atom(), map(), Credential.t()) :: {:ok, map()} | {:error, term()}
end
```

### 8.3 Database Tables

#### `integration_credentials`

```sql
CREATE TABLE integration_credentials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service           VARCHAR(50) NOT NULL,   -- "gmail", "github", "slack", etc.
  auth_method       VARCHAR(20) NOT NULL,   -- "oauth2", "api_key", "bot_token"
  encrypted_tokens  BYTEA NOT NULL,         -- AES-256-GCM encrypted JSON
  scopes            TEXT[] DEFAULT '{}',
  expires_at        TIMESTAMPTZ,            -- Token expiry
  refresh_expires_at TIMESTAMPTZ,           -- Refresh token expiry
  status            VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, expired, revoked
  metadata          JSONB NOT NULL DEFAULT '{}',
  inserted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, service)
);
```

**Encryption:** Reuse `WaiAgentsBridges.CredentialEncryption` (AES-256-GCM with `BRIDGE_ENCRYPTION_KEY`). The encrypted payload is a JSON object containing `access_token`, `refresh_token`, and provider-specific fields.

#### `integration_rate_limits`

```sql
CREATE TABLE integration_rate_limits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service     VARCHAR(50) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, service, window_start)
);
```

#### `integration_webhooks`

```sql
CREATE TABLE integration_webhooks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service       VARCHAR(50) NOT NULL,
  webhook_id    VARCHAR(100) NOT NULL,  -- External-facing ID in URLs
  secret        BYTEA NOT NULL,         -- HMAC signing secret (encrypted)
  event_types   TEXT[] DEFAULT '{}',    -- Filter: ["push", "pull_request"]
  enabled       BOOLEAN NOT NULL DEFAULT true,
  metadata      JSONB NOT NULL DEFAULT '{}',
  inserted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(webhook_id)
);
```

### 8.4 OAuth 2.0 Flow

Generic OAuth module with PKCE support:

```elixir
defmodule WaiAgentsIntegrations.OAuth do
  @doc "Generate authorization URL with optional PKCE."
  def authorize_url(integration, user_id, opts \\ []) do
    config = integration.oauth_config()
    state = generate_state(user_id, integration.service_name())

    params = %{
      client_id: config.client_id,
      redirect_uri: callback_url(integration.service_name()),
      response_type: "code",
      scope: Enum.join(config.scopes, " "),
      state: state
    }

    params = if config[:pkce] do
      {verifier, challenge} = generate_pkce()
      store_pkce_verifier(state, verifier)
      Map.merge(params, %{
        code_challenge: challenge,
        code_challenge_method: "S256"
      })
    else
      params
    end

    {:ok, "#{config.auth_url}?#{URI.encode_query(params)}"}
  end

  @doc "Exchange authorization code for tokens."
  def exchange_code(integration, code, state) do
    config = integration.oauth_config()
    user_id = verify_state(state)

    body = %{
      grant_type: "authorization_code",
      code: code,
      client_id: config.client_id,
      client_secret: config.client_secret,
      redirect_uri: callback_url(integration.service_name())
    }

    body = case get_pkce_verifier(state) do
      nil -> body
      verifier -> Map.put(body, :code_verifier, verifier)
    end

    case Req.post(config.token_url, json: body) do
      {:ok, %{status: 200, body: tokens}} ->
        save_credentials(user_id, integration.service_name(), tokens)
      {:ok, %{status: status, body: body}} ->
        {:error, {status, body}}
    end
  end
end
```

### 8.5 Token Refresh

Proactive Oban cron job refreshes tokens before they expire:

```elixir
# Add to Oban cron config:
{"*/5 * * * *", WaiAgentsIntegrations.Workers.TokenRefreshWorker}
```

The worker queries for credentials expiring within 10 minutes and refreshes them.

### 8.6 Priority Integrations (10)

#### 1. Telegram (upgrade from bridges)

| Field | Value |
|-------|-------|
| Auth | Bot token (existing) |
| Capabilities | read, write, webhook, realtime |
| Rate limits | 30 messages/sec (global), 1 message/sec/chat |
| Agent tools | `telegram_send_message`, `telegram_send_photo`, `telegram_get_updates` |
| Webhook | Existing `/api/v1/webhooks/telegram` |

Upgrade path: Migrate `BridgeConnection` records with `platform: :telegram` to `IntegrationCredential` records. Keep `BridgeWorker` polling adapter as a compatibility layer.

#### 2. WhatsApp (upgrade from bridges)

| Field | Value |
|-------|-------|
| Auth | Cloud API access token (existing) |
| Capabilities | read, write, webhook |
| Rate limits | 80 messages/sec (business), 250 messages/day (user-initiated) |
| Agent tools | `whatsapp_send_message`, `whatsapp_send_template`, `whatsapp_send_media` |
| Webhook | Existing `/api/v1/webhooks/whatsapp` |

#### 3. Gmail

| Field | Value |
|-------|-------|
| Auth | OAuth 2.0 |
| Scopes | `gmail.readonly`, `gmail.send`, `gmail.modify` |
| Auth URL | `https://accounts.google.com/o/oauth2/v2/auth` |
| Token URL | `https://oauth2.googleapis.com/token` |
| Capabilities | read, write, webhook |
| Rate limits | 250 quota units/sec/user |
| Agent tools | `gmail_search`, `gmail_read`, `gmail_send`, `gmail_reply`, `gmail_label` |
| Webhook | Gmail Push Notifications via Google Cloud Pub/Sub |

#### 4. Google Calendar

| Field | Value |
|-------|-------|
| Auth | OAuth 2.0 (shared Google OAuth client) |
| Scopes | `calendar.readonly`, `calendar.events` |
| Capabilities | read, write, webhook |
| Rate limits | 500 requests/100sec/user |
| Agent tools | `calendar_list_events`, `calendar_create_event`, `calendar_update_event`, `calendar_delete_event`, `calendar_find_free_time` |
| Webhook | Calendar push notifications |

#### 5. Google Drive

| Field | Value |
|-------|-------|
| Auth | OAuth 2.0 (shared Google OAuth client) |
| Scopes | `drive.readonly`, `drive.file` |
| Capabilities | read, write |
| Rate limits | 12000 requests/min/user |
| Agent tools | `drive_search`, `drive_read`, `drive_create`, `drive_upload`, `drive_share` |

#### 6. GitHub

| Field | Value |
|-------|-------|
| Auth | OAuth 2.0 |
| Scopes | `repo`, `read:user`, `read:org` |
| Auth URL | `https://github.com/login/oauth/authorize` |
| Token URL | `https://github.com/login/oauth/access_token` |
| Capabilities | read, write, webhook |
| Rate limits | 5000 requests/hour (authenticated) |
| Agent tools | `github_search_repos`, `github_get_file`, `github_create_issue`, `github_create_pr`, `github_list_prs`, `github_review_pr` |
| Webhook | `POST /api/v1/webhooks/github/:webhook_id` |
| Signature | HMAC-SHA256 (`X-Hub-Signature-256` header) |

#### 7. Slack

| Field | Value |
|-------|-------|
| Auth | OAuth 2.0 (Slack app) |
| Scopes | `channels:read`, `chat:write`, `users:read`, `files:read` |
| Auth URL | `https://slack.com/oauth/v2/authorize` |
| Token URL | `https://slack.com/api/oauth.v2.access` |
| Capabilities | read, write, webhook, realtime |
| Rate limits | Tier 2-4 (20-100 req/min depending on method) |
| Agent tools | `slack_send_message`, `slack_search`, `slack_list_channels`, `slack_upload_file`, `slack_react` |
| Webhook | Slack Events API via `/api/v1/webhooks/slack/:webhook_id` |
| Signature | HMAC-SHA256 (`X-Slack-Signature` header, `v0:timestamp:body`) |

#### 8. Discord

| Field | Value |
|-------|-------|
| Auth | Bot token + OAuth 2.0 for user-level actions |
| Capabilities | read, write, webhook, realtime |
| Rate limits | 50 requests/sec (global), per-route limits |
| Agent tools | `discord_send_message`, `discord_list_channels`, `discord_create_thread`, `discord_react`, `discord_search` |
| Webhook | Discord Interactions endpoint via `/api/v1/webhooks/discord/:webhook_id` |
| Signature | Ed25519 (`X-Signature-Ed25519`, `X-Signature-Timestamp`) |

#### 9. Notion

| Field | Value |
|-------|-------|
| Auth | OAuth 2.0 |
| Auth URL | `https://api.notion.com/v1/oauth/authorize` |
| Token URL | `https://api.notion.com/v1/oauth/token` |
| Capabilities | read, write |
| Rate limits | 3 requests/sec |
| Agent tools | `notion_search`, `notion_read_page`, `notion_create_page`, `notion_update_page`, `notion_query_database`, `notion_create_database_entry` |
| API version | `2022-06-28` (via `Notion-Version` header) |

#### 10. Twitter/X

| Field | Value |
|-------|-------|
| Auth | OAuth 2.0 + PKCE (required by X API v2) |
| Scopes | `tweet.read`, `tweet.write`, `users.read`, `offline.access` |
| Auth URL | `https://twitter.com/i/oauth2/authorize` |
| Token URL | `https://api.twitter.com/2/oauth2/token` |
| Capabilities | read, write |
| Rate limits | App-level: 300 tweets/3hr, 500 reads/15min |
| Agent tools | `twitter_post`, `twitter_search`, `twitter_reply`, `twitter_dm`, `twitter_get_user` |

### 8.7 Future Integrations (Roadmap)

| Priority | Integration | Auth | Primary Use |
|----------|------------|------|-------------|
| High | Google Sheets | OAuth 2.0 | Data read/write |
| High | Microsoft Teams | OAuth 2.0 | Messaging |
| High | Linear | OAuth 2.0 | Issue tracking |
| High | Jira | OAuth 2.0 | Issue tracking |
| Medium | Zoom | OAuth 2.0 | Meeting scheduling |
| Medium | Stripe | API key | Payment processing |
| Medium | Shopify | OAuth 2.0 | E-commerce |
| Medium | HubSpot | OAuth 2.0 | CRM |
| Medium | Airtable | OAuth 2.0 | Database |
| Medium | Trello | OAuth 1.0a | Task management |
| Medium | Asana | OAuth 2.0 | Project management |
| Medium | Monday.com | OAuth 2.0 | Work management |
| Medium | Twilio | API key | SMS/Voice |
| Medium | SendGrid | API key | Email delivery |
| Medium | Mailchimp | OAuth 2.0 | Email marketing |
| Low | AWS (S3, Lambda) | IAM keys | Cloud infrastructure |
| Low | Vercel | OAuth 2.0 | Deployment |
| Low | Supabase | API key | Backend-as-a-service |
| Low | Firebase | Service account | Backend-as-a-service |
| Low | Dropbox | OAuth 2.0 | File storage |
| Low | Box | OAuth 2.0 | File storage |
| Low | Spotify | OAuth 2.0 | Music |
| Low | Reddit | OAuth 2.0 | Social |
| Low | LinkedIn | OAuth 2.0 | Professional network |
| Low | YouTube | OAuth 2.0 | Video |

---

## 9. Channel System

### 9.1 Overview

Evolve the bridge system into a formal **channel architecture** where agents are accessible from multiple platforms simultaneously.

### 9.2 Database Table: `channel_routes`

```sql
CREATE TABLE channel_routes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id          UUID REFERENCES agents(id) ON DELETE SET NULL,
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
  service           VARCHAR(50) NOT NULL,   -- "telegram", "whatsapp", "slack", "discord"
  external_chat_id  VARCHAR(255) NOT NULL,  -- Platform-specific chat/channel ID
  direction         VARCHAR(10) NOT NULL DEFAULT 'both',  -- 'inbound', 'outbound', 'both'
  enabled           BOOLEAN NOT NULL DEFAULT true,
  metadata          JSONB NOT NULL DEFAULT '{}',
  inserted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(service, external_chat_id)
);

CREATE INDEX idx_channel_routes_agent ON channel_routes(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_channel_routes_lookup ON channel_routes(service, external_chat_id);
```

### 9.3 Routing Flow

```
Inbound message (Telegram/WhatsApp/Slack/Discord)
  │
  ▼
WebhookController (existing)
  │
  ▼
Platform Adapter.normalize_message(payload) → MessageEnvelope
  │
  ▼
ChannelRouter.route(envelope)
  │
  ├── Lookup channel_routes by (service, external_chat_id)
  │
  ├── If route.agent_id → EventRouter.route_trigger(:channel_message, ...)
  │                        → AgentProcess.execute(...)
  │                        → Agent response → ChannelOutboundWorker
  │
  └── If route.conversation_id → Insert as message in conversation
                                  → Broadcast via PubSub
```

### 9.4 Outbound Routing

```elixir
defmodule WaiAgentsIntegrations.Workers.ChannelOutboundWorker do
  use Oban.Worker, queue: :bridges, max_attempts: 3

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    %{
      "service" => service,
      "external_chat_id" => chat_id,
      "content" => content,
      "user_id" => user_id
    } = args

    credential = IntegrationCredentials.get!(user_id, service)
    adapter = Registry.adapter_for(service)
    adapter.send_message(%{chat_id: chat_id, content: content}, credential)
  end
end
```

### 9.5 Multi-Channel Agent Access

A single agent can be connected to multiple channels:

```
User's "Research Assistant" agent
  ├── Web chat (conversation:abc)
  ├── Telegram bot (chat_id: 12345)
  ├── Slack channel (#research, channel_id: C0123)
  └── Discord channel (channel_id: 98765)
```

Each channel route maintains its own conversation context. The agent has access to its memory across all channels (shared per user-agent pair).

---

## 10. Webhook System

### 10.1 Generic Inbound Endpoint

Add to the webhook scope in `router.ex`:

```elixir
# Generic webhook endpoint for all integrations
scope "/api/v1/webhooks", WaiAgentsGatewayWeb do
  pipe_through :api

  # Existing
  post "/telegram", WebhookController, :telegram
  post "/whatsapp", WebhookController, :whatsapp
  get "/whatsapp", WebhookController, :whatsapp_verify

  # New generic endpoint
  post "/:service/:webhook_id", WebhookController, :generic
end
```

### 10.2 Signature Verification

Per-service verification in `WebhookHandler`:

```elixir
defmodule WaiAgentsIntegrations.WebhookHandler do
  def verify_and_process(service, webhook_id, headers, body) do
    with {:ok, webhook} <- get_webhook(webhook_id),
         :ok <- verify_signature(service, webhook, headers, body),
         {:ok, event} <- normalize_event(service, body) do
      route_event(webhook, event)
    end
  end

  defp verify_signature("github", webhook, headers, body) do
    expected = headers["x-hub-signature-256"]
    secret = decrypt_secret(webhook.secret)
    computed = "sha256=" <> :crypto.mac(:hmac, :sha256, secret, body) |> Base.encode16(case: :lower)
    if Plug.Crypto.secure_compare(computed, expected), do: :ok, else: {:error, :invalid_signature}
  end

  defp verify_signature("slack", webhook, headers, body) do
    timestamp = headers["x-slack-request-timestamp"]
    expected = headers["x-slack-signature"]
    secret = decrypt_secret(webhook.secret)
    basestring = "v0:#{timestamp}:#{body}"
    computed = "v0=" <> :crypto.mac(:hmac, :sha256, secret, basestring) |> Base.encode16(case: :lower)
    if Plug.Crypto.secure_compare(computed, expected), do: :ok, else: {:error, :invalid_signature}
  end

  defp verify_signature("discord", webhook, _headers, body) do
    # Ed25519 verification
    signature = headers["x-signature-ed25519"]
    timestamp = headers["x-signature-timestamp"]
    public_key = decrypt_secret(webhook.secret)
    message = timestamp <> body
    case :crypto.verify(:eddsa, :none, message, Base.decode16!(signature, case: :lower), [public_key, :ed25519]) do
      true -> :ok
      false -> {:error, :invalid_signature}
    end
  end
end
```

### 10.3 Event Normalization

All webhook payloads are normalized into an `IntegrationEvent` struct:

```elixir
defmodule WaiAgentsIntegrations.IntegrationEvent do
  defstruct [
    :service,        # "github", "slack", "discord", etc.
    :event_type,     # "push", "message", "issue_created", etc.
    :external_id,    # Platform-specific event ID
    :actor,          # %{id: "", name: "", avatar_url: ""}
    :payload,        # Normalized event data
    :raw_payload,    # Original payload for debugging
    :timestamp       # Event timestamp
  ]
end
```

---

## 11. Fix Broken Systems

### 11.1 Tool Approval Bridge

**Problem:** Elixir broadcasts approval decisions on PubSub but never sends them to the Python sidecar. The orchestrator blocks on `await approval_event.wait()` forever.

**Fix:**

1. **Add `SubmitApproval` RPC** to the proto (see Section 3.4).

2. **Add `submit_approval/4` to GRPCClient:**

```elixir
def submit_approval(conversation_id, request_id, approved, scope) do
  case connect() do
    {:ok, channel} ->
      request = WaiAgents.Agent.V1.ApprovalDecision.new(
        conversation_id: conversation_id,
        request_id: request_id,
        approved: approved,
        scope: to_string(scope)
      )
      WaiAgents.Agent.V1.AgentService.Stub.submit_approval(channel, request)

    {:error, reason} ->
      {:error, reason}
  end
end
```

3. **Update `AgentChannel.handle_in("approval_decision")`** to call the gRPC RPC:

```elixir
def handle_in("approval_decision", payload, socket) do
  %{"request_id" => request_id, "decision" => decision} = payload
  scope = parse_scope(payload["scope"])
  approved = decision == "approved"

  # Record in ETS (existing)
  ToolApproval.record_decision(%{...})

  # NEW: Forward to Python sidecar
  GRPCClient.submit_approval(
    socket.assigns.conversation_id,
    request_id,
    approved,
    scope
  )

  # Broadcast to other clients (existing)
  event = if approved, do: "approval_granted", else: "approval_denied"
  broadcast(socket, event, %{request_id: request_id, scope: to_string(scope)})

  {:noreply, socket}
end
```

4. **Update Python servicer** to track active runners and route approvals (see Section 3.6).

### 11.2 MCP Connection Wiring

**Problem:** `mcp_servers` field exists on the Agent schema but is never passed to the Python sidecar.

**Fix:**

1. Add `MCPServerConfig` message and `repeated MCPServerConfig mcp_servers` to `AgentConfig` proto.

2. In `AgentExecutor.handle_cast`, load the agent and pass `mcp_servers`:

```elixir
# In request_params construction:
agent = Repo.get!(Agent, state.agent_id)

request_params = %{
  # ... existing fields ...
  config: Map.merge(config, %{
    mcp_servers: agent.mcp_servers || []
  })
}
```

3. In `GRPCClient.execute_agent`, serialize `mcp_servers` into the proto:

```elixir
mcp_servers =
  Enum.map(config.mcp_servers || [], fn server ->
    WaiAgents.Agent.V1.MCPServerConfig.new(
      name: server["name"],
      transport: server["transport"] || "stdio",
      command: server["command"] || "",
      args: server["args"] || [],
      url: server["url"] || "",
      env: server["env"] || %{},
      headers: server["headers"] || %{}
    )
  end)
```

4. In the Python servicer, pass MCP configs to the runner (see Section 3.6).

### 11.3 Tool Registry Population

**Problem:** `ToolRegistry` is instantiated empty.

**Fix:** The runner connects MCP servers and populates the registry during execution (see Section 5.3). Built-in tools are also registered:

```python
# In runner initialization:
self.tool_registry.register_tool(
    "save_memory",
    schema=SAVE_MEMORY_SCHEMA,
    handler=memory_tool.save_memory,
)
self.tool_registry.register_tool(
    "search_memories",
    schema=SEARCH_MEMORIES_SCHEMA,
    handler=memory_tool.search_memories,
)
```

### 11.4 Tool Approval Persistence

**Problem:** Tool approvals are stored in ETS only — lost on restart.

**Fix:** Add `tool_approvals` table:

```sql
CREATE TABLE tool_approvals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id          UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
  tool_name         VARCHAR(100) NOT NULL,
  scope             VARCHAR(30) NOT NULL,   -- 'allow_once', 'allow_for_session', 'always_for_agent_tool'
  decision          VARCHAR(20) NOT NULL,   -- 'approved', 'denied', 'revoked', 'pending'
  arguments_hash    VARCHAR(64),
  decided_at        TIMESTAMPTZ,
  inserted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tool_approvals_lookup
  ON tool_approvals(user_id, agent_id, tool_name)
  WHERE scope = 'always_for_agent_tool' AND decision = 'approved';
```

On startup, `ToolApproval.Store` loads `always_for_agent_tool` approvals from the database into ETS.

---

## 12. Database Migrations

### 12.1 New Tables Summary

| Table | Section | Purpose |
|-------|---------|---------|
| `agent_schedules` | 6.1 | Schedule definitions (cron, interval, one-shot) |
| `agent_memories` | 7.2 | Agent memory with pgvector embeddings |
| `agent_events` | 12.2 | Execution history and audit log |
| `integration_credentials` | 8.3 | Encrypted OAuth/API tokens |
| `integration_rate_limits` | 8.3 | Sliding window request counters |
| `integration_webhooks` | 8.3 | Inbound webhook configuration |
| `channel_routes` | 9.2 | Channel → agent/conversation routing |
| `tool_approvals` | 11.4 | Persistent tool approval decisions |

### 12.2 Agent Events Table

Execution audit log for monitoring and debugging:

```sql
CREATE TABLE agent_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  event_type      VARCHAR(30) NOT NULL,   -- 'execution_start', 'execution_complete', 'execution_error', 'tool_call', 'schedule_trigger'
  trigger_type    VARCHAR(20),            -- 'user_message', 'cron_schedule', 'webhook', 'channel_message', 'api_call'
  duration_ms     INTEGER,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  model           VARCHAR(64),
  status          VARCHAR(20) NOT NULL,   -- 'running', 'completed', 'failed', 'timeout'
  error_code      VARCHAR(50),
  error_message   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  inserted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_events_agent ON agent_events(agent_id, inserted_at DESC);
CREATE INDEX idx_agent_events_user ON agent_events(user_id, inserted_at DESC);

-- Partition by month for efficient pruning
-- (implementation via Oban MaintenanceWorker create_partitions task)
```

### 12.3 Modified Tables

#### `agents` table

```sql
ALTER TABLE agents ADD COLUMN execution_mode VARCHAR(20) NOT NULL DEFAULT 'raw';
-- Valid values: 'raw', 'claude_sdk', 'openai_sdk'
```

### 12.4 Migration Order

Run in a single Ecto migration (numbered sequentially):

1. `CREATE EXTENSION IF NOT EXISTS vector;` (pgvector)
2. `ALTER TABLE agents ADD COLUMN execution_mode ...`
3. `CREATE TABLE agent_schedules ...`
4. `CREATE TABLE agent_memories ...` (with vector index)
5. `CREATE TABLE agent_events ...`
6. `CREATE TABLE integration_credentials ...`
7. `CREATE TABLE integration_rate_limits ...`
8. `CREATE TABLE integration_webhooks ...`
9. `CREATE TABLE channel_routes ...`
10. `CREATE TABLE tool_approvals ...`

---

## 13. Web App (Next.js) Changes

### 13.1 Agent Builder

New feature at `web/src/features/agent-builder/`.

**Route:** `/agents` (list) and `/agents/new` or `/agents/:id/edit` (editor).

**Components:**

```
agent-builder/
├── AgentBuilderView.tsx       # List + editor layout
├── AgentForm.tsx              # Main agent configuration form
├── SystemPromptEditor.tsx     # Textarea with variable insertion
├── ModelSelector.tsx          # Model + SDK dropdown
├── ToolConfigurator.tsx       # Tool selection and MCP server config
├── MCPServerForm.tsx          # Add/edit MCP server connection
├── VisibilitySelector.tsx     # Public/unlisted/private
├── ScheduleManager.tsx        # Schedule CRUD
├── AgentTestSandbox.tsx       # Live test conversation
└── AgentCard.tsx              # List item card
```

**Agent Form Fields:**

| Section | Fields |
|---------|--------|
| Basic Info | name, slug (auto-generated), description, avatar_url, category |
| Model | model (dropdown), execution_mode (raw/claude_sdk/openai_sdk), temperature (slider), max_tokens |
| System Prompt | Multi-line editor with syntax highlighting, variable insertion (`{{user.name}}`, `{{date}}`) |
| Tools | Toggle built-in tools (memory, web search, code exec, filesystem), add custom MCP servers |
| MCP Servers | Name, transport (stdio/sse), command/URL, args, env vars, headers |
| Visibility | public, unlisted, private |
| Scheduling | Add/edit/delete schedules (cron builder, interval, one-shot) |

**Test Sandbox:** Embedded mini-chat that lets the creator test the agent before publishing. Uses the same `AgentChannel` WebSocket connection.

### 13.2 Conversation UX Upgrades

Enhancements to `web/src/features/chat/ChatView.tsx`:

**Tool Approval Card:**
- Larger, more prominent card matching the Swift design
- Shows tool name, argument preview (syntax-highlighted JSON), and reason
- Three buttons: "Allow Once", "Allow for Session", "Always Allow"
- Deny button (secondary)
- Loading state while waiting for approval result

**Agent Execution Indicators:**
- Pulsing dot indicator next to agent avatar while streaming
- Status message display with category-specific icons (thinking, searching, coding)
- Expandable tool execution log (collapsible panel showing tool_call → tool_result pairs)
- Code syntax highlighting for code_block events (use `highlight.js` or `prism.js`)
- Memory indicators — show when agent saves or retrieves memories

**Streaming Improvements:**
- Token-by-token rendering with cursor blink
- Auto-scroll with "New messages" button when scrolled up
- Markdown rendering for agent responses (already partial — ensure full GFM support)

### 13.3 Integration Management

New settings section at `web/src/features/settings/IntegrationSettings.tsx`:

**Components:**

```
settings/
├── IntegrationSettings.tsx     # Main integration management page
├── IntegrationCard.tsx         # Per-service connection card
├── OAuthConnectButton.tsx      # Initiates OAuth flow
├── BYOKPanel.tsx               # Bring Your Own Key input
├── IntegrationHealth.tsx       # Connection status + last sync
└── IntegrationList.tsx         # Grid of available integrations
```

**OAuth Flow (browser):**
1. User clicks "Connect" on an integration card
2. Frontend calls `POST /api/v1/integrations/:service/authorize` → returns `{authorize_url}`
3. Frontend opens `authorize_url` in a popup window
4. User authorizes on the service's OAuth page
5. Service redirects to `https://openraccoon.com/api/v1/integrations/callback/:service?code=...&state=...`
6. Backend exchanges code for tokens, encrypts, stores
7. Popup closes, frontend polls for connection status

**BYOK Panel:**
- For users who want to use their own API keys (Anthropic, OpenAI, etc.)
- Encrypted input field, stored via `integration_credentials` with `auth_method: "api_key"`

### 13.4 Agent Monitoring Dashboard

New feature at `web/src/features/agent-dashboard/`.

**Components:**

```
agent-dashboard/
├── AgentDashboardView.tsx      # Overview page
├── StatsCards.tsx              # Executions, success rate, tokens, latency
├── ExecutionHistory.tsx        # Paginated list of agent_events
├── CostBreakdown.tsx          # Token usage by model, daily/weekly/monthly
├── ScheduleManager.tsx        # View/edit/toggle schedules
├── MemoryViewer.tsx           # Browse agent memories
└── AgentHealthIndicator.tsx   # Current status (active, idle, error)
```

**Stats displayed:**
- Total executions (24h / 7d / 30d)
- Success rate (%)
- Average response time (ms)
- Token usage (input/output breakdown)
- Cost estimate (based on model pricing)
- Active schedules count
- Memory count

### 13.5 Pricing UI

New page at `web/src/features/pricing/`.

**Components:**

```
pricing/
├── PricingView.tsx            # Plan comparison page
├── PlanCard.tsx               # Individual plan card
├── UsageBars.tsx              # Current usage vs. limits
├── UpgradeFlow.tsx            # Stripe checkout integration
└── BillingSettings.tsx        # Manage subscription
```

### 13.6 Navigation Changes

Add "Agents" tab to the sidebar navigation in `web/src/app/page.tsx`:

```typescript
// Current sidebar tabs:
// Chat, Feed, Marketplace, Pages, Settings

// New order:
// Chat, Agents, Feed, Marketplace, Pages, Settings
```

The "Agents" tab shows the agent builder/list view. Agent dashboard is accessible from each agent's card.

### 13.7 API Service Additions

Add to `web/src/lib/api/services.ts`:

```typescript
// Agent CRUD
createAgent(data: CreateAgentPayload): Promise<{ agent: Agent }>
updateAgent(id: string, data: Partial<Agent>): Promise<{ agent: Agent }>
deleteAgent(id: string): Promise<void>
getAgent(id: string): Promise<{ agent: Agent }>
listMyAgents(params?: PaginationParams): Promise<ApiListResponse<Agent>>

// Agent Schedules
listSchedules(agentId: string): Promise<{ items: AgentSchedule[] }>
createSchedule(agentId: string, data: CreateSchedulePayload): Promise<{ schedule: AgentSchedule }>
updateSchedule(agentId: string, scheduleId: string, data: Partial<AgentSchedule>): Promise<{ schedule: AgentSchedule }>
deleteSchedule(agentId: string, scheduleId: string): Promise<void>

// Agent Memory
listMemories(agentId: string, params?: PaginationParams): Promise<ApiListResponse<AgentMemory>>
deleteMemory(agentId: string, memoryId: string): Promise<void>

// Agent Events (monitoring)
listAgentEvents(agentId: string, params?: PaginationParams & { event_type?: string }): Promise<ApiListResponse<AgentEvent>>

// Integrations
listIntegrations(): Promise<{ items: IntegrationStatus[] }>
authorizeIntegration(service: string): Promise<{ authorize_url: string }>
disconnectIntegration(service: string): Promise<void>
integrationStatus(service: string): Promise<IntegrationStatus>

// Channel Routes
listChannelRoutes(agentId: string): Promise<{ items: ChannelRoute[] }>
createChannelRoute(agentId: string, data: CreateChannelRoutePayload): Promise<{ route: ChannelRoute }>
deleteChannelRoute(routeId: string): Promise<void>
```

### 13.8 Type Additions

Add to `web/src/lib/types.ts`:

```typescript
// Agent (full, for builder/dashboard)
interface Agent {
  id: string;
  creator_id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  system_prompt: string;
  model: string;
  execution_mode: "raw" | "claude_sdk" | "openai_sdk";
  temperature: number;
  max_tokens: number;
  tools: ToolConfig[];
  mcp_servers: McpServerConfig[];
  visibility: "public" | "unlisted" | "private";
  category: string | null;
  usage_count: number;
  rating_sum: number;
  rating_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ToolConfig {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  requires_approval: boolean;
}

interface McpServerConfig {
  name: string;
  transport: "stdio" | "sse" | "streamable_http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

interface AgentSchedule {
  id: string;
  agent_id: string;
  schedule_type: "cron" | "interval" | "once";
  cron_expression: string | null;
  interval_seconds: number | null;
  run_at: string | null;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  max_runs: number | null;
  payload: Record<string, unknown>;
}

interface AgentMemory {
  id: string;
  agent_id: string;
  content: string;
  importance: number;
  memory_type: "observation" | "reflection" | "fact" | "preference";
  tags: string[];
  access_count: number;
  last_accessed_at: string | null;
  created_at: string;
}

interface AgentEvent {
  id: string;
  agent_id: string;
  event_type: string;
  trigger_type: string | null;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  model: string | null;
  status: "running" | "completed" | "failed" | "timeout";
  error_code: string | null;
  error_message: string | null;
  inserted_at: string;
}

interface IntegrationStatus {
  service: string;
  connected: boolean;
  status: "active" | "expired" | "revoked" | "not_connected";
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
}

interface ChannelRoute {
  id: string;
  agent_id: string;
  service: string;
  external_chat_id: string;
  direction: "inbound" | "outbound" | "both";
  enabled: boolean;
  metadata: Record<string, unknown>;
}
```

---

## 14. Native App (SwiftUI) Changes

### 14.1 Agent Builder

**View:** `AgentBuilderView` — NavigationStack with form sections.

**Sections:**
1. **Basic Info** — name, description, avatar (photo picker), category picker
2. **Model Configuration** — model picker (segmented control), execution mode picker, temperature slider, max tokens stepper
3. **System Prompt** — TextEditor with large text area
4. **Tools** — toggle list of built-in tools, "Add MCP Server" button → sheet
5. **MCP Server Configuration** — sheet with name, transport picker, command/URL fields, key-value editors for env/headers
6. **Visibility** — picker (public/unlisted/private)
7. **Schedules** — list of schedules with add/edit/delete, cron builder or interval picker

### 14.2 Integration Management

**View:** `IntegrationSettingsView` in Settings tab.

**OAuth flow:**
1. User taps "Connect" on integration
2. App calls `POST /api/v1/integrations/:service/authorize`
3. App opens `authorize_url` via `ASWebAuthenticationSession`
4. After authorization, callback URL scheme `waiagents://integrations/callback?service=...&code=...` triggers token exchange
5. App refreshes integration status

**UI:**
- Grid of integration cards with status indicators (connected/disconnected/expired)
- Tap to connect/disconnect
- Pull-to-refresh for status updates

### 14.3 Scheduling UI

**View:** `AgentSchedulesView` — list of schedules for an agent.

**Cron Builder:**
- Simplified picker: "Every day at [time]", "Every [weekday] at [time]", "Every [N] hours", "Custom cron"
- Custom cron: text field with validation and human-readable preview

### 14.4 Memory Viewer

**View:** `AgentMemoryView` — timeline of memories with search.

- Vertical list sorted by creation date
- Each memory shows: content (truncated), memory_type badge, importance bar, tags
- Search bar filters by content similarity
- Swipe to delete individual memories
- "Clear All Memories" button with confirmation

### 14.5 Agent Dashboard (Native)

**View:** `AgentDashboardView` — summary stats and recent events.

- Stats grid: executions (24h), success rate, avg latency, token usage
- Recent executions list (tappable for detail)
- Active schedules summary
- Quick actions: "Test Agent", "Edit", "View in Marketplace"

---

## 15. Pricing Tiers

### 15.1 Plan Comparison

| Feature | Free | Pro ($12/mo) | Enterprise (Custom) |
|---------|------|-------------|---------------------|
| **Agents** | 3 | 25 | Unlimited |
| **Tokens/month** | 50,000 | 500,000 | Custom |
| **Models** | Sonnet 4.6, GPT-5.2 | All (incl. Opus 4.6) | All + custom endpoints |
| **Integrations** | 2 | All 30+ | All + custom MCP |
| **Schedules** | None | 10 per agent | Unlimited |
| **Memory retention** | 7 days | 90 days | Unlimited |
| **Memory per agent** | 100 | 500 | Unlimited |
| **Bridge connections** | 1 | 5 | Unlimited |
| **API rate limit** | 10 req/min | 60 req/min | Custom |
| **BYOK** | Yes | Yes | Yes |
| **Code execution** | 10 runs/day | 100 runs/day | Unlimited |
| **File storage** | 100 MB | 5 GB | Custom |
| **Webhook endpoints** | 1 | 10 | Unlimited |
| **Support** | Community | Email | Dedicated |

### 15.2 BYOK (Bring Your Own Key)

All tiers support BYOK for LLM providers. When using BYOK:
- Token limits do not apply (usage is billed directly by the provider)
- All models available regardless of tier
- Platform charges only for infrastructure (integrations, storage, etc.)

### 15.3 Implementation

- **Payments:** Stripe Checkout + Stripe Customer Portal
- **Enforcement:** `CostTracker` already checks limits; extend with tier-aware limits from `users.metadata.plan`
- **Metering:** Existing `agent_usage_logs` table provides token counts; extend with execution counts and storage usage
- **Upgrade flow:** Web → Stripe Checkout session → webhook confirms → update user plan

### 15.4 Database Changes for Plans

```sql
-- Add to users table (or use metadata JSONB field):
ALTER TABLE users ADD COLUMN plan VARCHAR(20) NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN plan_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(100);
ALTER TABLE users ADD COLUMN stripe_subscription_id VARCHAR(100);
```

---

## 16. Implementation Sequence

### Phase 1: Fix Broken Systems (1-2 weeks)
1. Add `SubmitApproval` RPC to proto, regenerate
2. Implement `GRPCClient.submit_approval/4`
3. Update `AgentChannel.handle_in("approval_decision")` to call gRPC
4. Track active runners in Python servicer
5. Add `MCPServerConfig` to proto, pass through from schema
6. Add `tool_approvals` table, load into ETS on startup

### Phase 2: Database Migrations (1 week)
1. Install pgvector extension
2. Add `execution_mode` to agents table
3. Create all 8 new tables (see Section 12.4)
4. Add plan-related columns to users table

### Phase 3: Agent Supervisor System (1-2 weeks)
1. Create `AgentSupervisor` (DynamicSupervisor)
2. Create `AgentProcess` (GenServer)
3. Create `ProcessRegistry` (Registry)
4. Create `EventRouter`
5. Wire `AgentExecutor` through `AgentProcess`
6. Add idle timeout and resource monitoring

### Phase 4: MCP Server Integration (2 weeks)
1. Rewrite `MCPClient` using `mcp` Python SDK
2. Create `MCPServerManager`
3. Implement built-in MCP servers (memory, web search, code exec, filesystem)
4. Wire MCP tool discovery → ToolRegistry → LLM provider
5. Test end-to-end tool execution

### Phase 5: Agent Memory (1-2 weeks)
1. Generate embeddings via OpenAI API
2. Implement memory retrieval query (vector similarity + importance + decay)
3. Create `save_memory` / `search_memories` / `forget_memory` MCP tools
4. Add memory context injection to system prompt
5. Implement decay cron job and pruning

### Phase 6: Scheduling System (1 week)
1. Create `AgentScheduleWorker` Oban worker
2. Implement self-rescheduling pattern
3. Add schedule CRUD API endpoints
4. Wire `EventRouter` for `:cron_schedule` triggers

### Phase 7: SDK Runners (2 weeks)
1. Implement `ClaudeRunner` (Claude Agent SDK)
2. Implement `OpenAIRunner` (OpenAI Agents SDK)
3. Create `RunnerFactory`
4. Update `AgentServiceServicer` to route by execution mode
5. Test all three modes end-to-end

### Phase 8: Integration Platform (3-4 weeks)
1. Create `wai_agents_integrations` umbrella app
2. Implement generic OAuth 2.0 + PKCE flow
3. Implement token refresh worker
4. Build 10 priority integrations (Telegram upgrade, WhatsApp upgrade, Gmail, Calendar, Drive, GitHub, Slack, Discord, Notion, Twitter)
5. Add integration credential management API

### Phase 9: Channel System (1-2 weeks)
1. Create `channel_routes` routing table
2. Implement `ChannelRouter`
3. Create `ChannelOutboundWorker`
4. Wire inbound messages through routing → agent trigger
5. Test multi-channel agent access

### Phase 10: Web — Agent Builder + Dashboard (2-3 weeks)
1. Agent list view with create/edit/delete
2. Agent configuration form (all sections)
3. MCP server configuration UI
4. Agent test sandbox
5. Agent monitoring dashboard (stats, events, cost)
6. Schedule management UI
7. Memory viewer

### Phase 11: Web — Conversation UX Upgrades (1-2 weeks)
1. Enhanced tool approval card
2. Pulsing agent status indicators
3. Expandable tool execution log
4. Code syntax highlighting
5. Memory save/retrieve indicators
6. Streaming improvements

### Phase 12: Web — Integrations + Pricing (2 weeks)
1. Integration management settings page
2. OAuth connection flow (popup-based)
3. BYOK panel
4. Pricing page with plan comparison
5. Stripe checkout integration
6. Usage bars and billing settings

### Phase 13: Native App Updates (2-3 weeks)
1. Agent builder (SwiftUI form)
2. Integration management (ASWebAuthenticationSession)
3. Scheduling UI
4. Memory viewer
5. Agent dashboard
6. Navigation updates

---

## Appendix A: API Endpoint Summary (New)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/agents/:agent_id/schedules` | List agent schedules |
| POST | `/api/v1/agents/:agent_id/schedules` | Create schedule |
| GET | `/api/v1/agents/:agent_id/schedules/:id` | Get schedule |
| PATCH | `/api/v1/agents/:agent_id/schedules/:id` | Update schedule |
| DELETE | `/api/v1/agents/:agent_id/schedules/:id` | Delete schedule |
| GET | `/api/v1/agents/:agent_id/memories` | List agent memories |
| DELETE | `/api/v1/agents/:agent_id/memories/:id` | Delete memory |
| GET | `/api/v1/agents/:agent_id/events` | List agent events |
| GET | `/api/v1/integrations` | List available integrations |
| POST | `/api/v1/integrations/:service/authorize` | Start OAuth flow |
| GET | `/api/v1/integrations/callback/:service` | OAuth callback |
| DELETE | `/api/v1/integrations/:service` | Disconnect integration |
| GET | `/api/v1/integrations/:service/status` | Integration health |
| GET | `/api/v1/agents/:agent_id/channels` | List channel routes |
| POST | `/api/v1/agents/:agent_id/channels` | Create channel route |
| DELETE | `/api/v1/channels/:id` | Delete channel route |
| POST | `/api/v1/webhooks/:service/:webhook_id` | Generic inbound webhook |

## Appendix B: Environment Variables (New)

| Variable | Purpose | Example |
|----------|---------|---------|
| `OPENAI_API_KEY` | Embedding generation + OpenAI provider | `sk-...` |
| `ANTHROPIC_API_KEY` | Claude provider (existing) | `sk-ant-...` |
| `GOOGLE_CLIENT_ID` | Google OAuth (Gmail, Calendar, Drive) | `...apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | |
| `GITHUB_CLIENT_ID` | GitHub OAuth | |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth secret | |
| `SLACK_CLIENT_ID` | Slack app OAuth | |
| `SLACK_CLIENT_SECRET` | Slack app OAuth secret | |
| `DISCORD_BOT_TOKEN` | Discord bot token | |
| `DISCORD_CLIENT_ID` | Discord OAuth | |
| `DISCORD_CLIENT_SECRET` | Discord OAuth secret | |
| `DISCORD_PUBLIC_KEY` | Discord interaction verification | |
| `NOTION_CLIENT_ID` | Notion OAuth | |
| `NOTION_CLIENT_SECRET` | Notion OAuth secret | |
| `TWITTER_CLIENT_ID` | Twitter/X OAuth | |
| `TWITTER_CLIENT_SECRET` | Twitter/X OAuth secret | |
| `STRIPE_SECRET_KEY` | Stripe payments | `sk_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | `whsec_...` |
| `EXA_API_KEY` | Exa web search (for agents) | |

## Appendix C: Python Dependencies (New)

```
# Add to agent_runtime/pyproject.toml or requirements.txt
mcp>=1.0.0                  # Model Context Protocol SDK
anthropic[agents]>=0.50.0   # Claude Agent SDK (includes agents extra)
openai-agents>=0.5.0        # OpenAI Agents SDK
pgvector>=0.3.0             # pgvector Python client
httpx>=0.27.0               # Async HTTP (for embeddings API)
```

## Appendix D: Elixir Dependencies (New)

```elixir
# Add to mix.exs
{:pgvector, "~> 0.3"},      # pgvector Ecto type
{:crontab, "~> 1.1"},       # Cron expression parsing
{:stripity_stripe, "~> 3.0"} # Stripe integration
```
