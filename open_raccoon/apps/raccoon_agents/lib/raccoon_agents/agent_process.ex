defmodule RaccoonAgents.AgentProcess do
  @moduledoc """
  GenServer representing a single agent bound to a conversation.

  Each process is `:temporary` — it is never restarted by the supervisor.
  After 5 minutes of inactivity the process shuts itself down.

  Execution is delegated to `AgentExecutor` (existing gRPC streaming).
  Approval decisions are forwarded to the Python sidecar via
  `GRPCClient.submit_approval/4`.
  """

  use GenServer, restart: :temporary

  alias RaccoonAgents.{AgentExecutor, GRPCClient, ProcessRegistry}

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

  # -- Public API ------------------------------------------------------------

  def start_link(init_arg) do
    GenServer.start_link(__MODULE__, init_arg,
      name: ProcessRegistry.via(init_arg.conversation_id, init_arg.agent_id)
    )
  end

  @doc """
  Kick off an agent execution turn. Returns `{:ok, executor_pid}`.
  """
  def execute(conversation_id, agent_id, messages, config) do
    GenServer.call(
      ProcessRegistry.via(conversation_id, agent_id),
      {:execute, messages, config}
    )
  end

  @doc """
  Forward an approval decision to the running Python sidecar.
  """
  def submit_approval(conversation_id, agent_id, request_id, approved, scope) do
    GenServer.cast(
      ProcessRegistry.via(conversation_id, agent_id),
      {:submit_approval, request_id, approved, scope}
    )
  end

  # -- Callbacks -------------------------------------------------------------

  @impl true
  def init(args) do
    agent = RaccoonAgents.get_agent!(args.agent_id)
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
    {:ok, pid} =
      AgentExecutor.execute(
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
    GRPCClient.submit_approval(
      state.conversation_id,
      request_id,
      approved,
      scope
    )

    {:noreply, %{state | last_activity: System.monotonic_time(:millisecond)}, @idle_timeout}
  end

  @impl true
  def handle_info(:timeout, state) do
    {:stop, :normal, state}
  end
end
