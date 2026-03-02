defmodule RaccoonAgents.ToolApproval.Store do
  @moduledoc """
  ETS-backed persistence for tool approval decisions.

  Stores approval records keyed by {user_id, agent_id, tool_name} for
  efficient lookup of remembered approvals.

  On startup, loads all `always_for_agent_tool` approvals from the
  `tool_approvals` database table into ETS so they survive restarts.
  """

  use GenServer
  require Logger

  alias RaccoonShared.Repo
  alias RaccoonAgents.ToolApprovalRecord
  import Ecto.Query

  @table :tool_approval_decisions

  # -- Public API ------------------------------------------------------------

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Insert a tool approval decision into the store.
  """
  def insert(%RaccoonAgents.ToolApproval{} = entry) do
    :ets.insert(@table, {{entry.actor_user_id, entry.agent_id, entry.tool_name}, entry})
    :ok
  end

  @doc """
  Look up a remembered approval for the given user, agent, and tool.

  Returns `:approved` if a matching `always_for_agent_tool` approval exists
  that has not been revoked, otherwise `:not_found`.
  """
  def lookup(user_id, agent_id, tool_name) do
    case :ets.lookup(@table, {user_id, agent_id, tool_name}) do
      [{_key, %{scope: :always_for_agent_tool, decision: :approved}}] ->
        :approved

      _ ->
        :not_found
    end
  end

  @doc """
  Delete a remembered approval for the given user, agent, and tool.
  """
  def delete(user_id, agent_id, tool_name) do
    :ets.delete(@table, {user_id, agent_id, tool_name})
    :ok
  end

  # -- GenServer callbacks ---------------------------------------------------

  @impl true
  def init(_opts) do
    table = :ets.new(@table, [:named_table, :set, :public, read_concurrency: true])
    load_persistent_approvals()
    {:ok, %{table: table}}
  end

  # -- Private ---------------------------------------------------------------

  defp load_persistent_approvals do
    records =
      from(r in ToolApprovalRecord,
        where: r.scope == "always_for_agent_tool" and r.decision == "approved"
      )
      |> Repo.all()

    for record <- records do
      entry = %RaccoonAgents.ToolApproval{
        actor_user_id: record.user_id,
        agent_id: record.agent_id,
        conversation_id: record.conversation_id,
        tool_name: record.tool_name,
        scope: :always_for_agent_tool,
        arguments_hash: record.arguments_hash,
        decision: :approved,
        decided_at: record.decided_at
      }

      :ets.insert(@table, {{record.user_id, record.agent_id, record.tool_name}, entry})
    end

    Logger.info("Loaded #{length(records)} persistent tool approvals into ETS")
  end
end
