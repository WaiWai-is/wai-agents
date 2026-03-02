defmodule RaccoonAgents.AgentSupervisor do
  @moduledoc """
  DynamicSupervisor for `AgentProcess` instances.

  Each agent execution gets a temporary child process registered in
  `ProcessRegistry` under `{conversation_id, agent_id}`. The supervisor
  enforces a hard cap of 20 concurrent agent processes to stay within
  the server's 2 GB agent-runtime budget.
  """

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

  @doc """
  Start a new `AgentProcess` for the given conversation + agent pair.

  Returns `{:ok, pid}` or `{:error, reason}`.
  """
  def start_agent(conversation_id, agent_id, user_id, opts \\ []) do
    spec = {
      RaccoonAgents.AgentProcess,
      %{
        conversation_id: conversation_id,
        agent_id: agent_id,
        user_id: user_id,
        opts: opts
      }
    }

    DynamicSupervisor.start_child(__MODULE__, spec)
  end

  @doc """
  Terminate the `AgentProcess` for a conversation + agent pair.
  """
  def stop_agent(conversation_id, agent_id) do
    case RaccoonAgents.ProcessRegistry.lookup(conversation_id, agent_id) do
      {:ok, pid} -> DynamicSupervisor.terminate_child(__MODULE__, pid)
      :error -> {:error, :not_found}
    end
  end

  @doc """
  Return the number of currently active agent processes.
  """
  def active_count do
    DynamicSupervisor.count_children(__MODULE__).active
  end
end
