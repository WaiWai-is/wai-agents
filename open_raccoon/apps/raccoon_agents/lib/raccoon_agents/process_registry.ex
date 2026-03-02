defmodule RaccoonAgents.ProcessRegistry do
  @moduledoc """
  Registry wrapper for looking up AgentProcess instances by
  `{conversation_id, agent_id}` tuple.

  The actual Registry is started in `RaccoonAgents.Application` with:

      {Registry, keys: :unique, name: RaccoonAgents.ProcessRegistry}
  """

  @doc """
  Look up the pid of a registered agent process.

  Returns `{:ok, pid}` if found, `:error` otherwise.
  """
  @spec lookup(String.t(), String.t()) :: {:ok, pid()} | :error
  def lookup(conversation_id, agent_id) do
    case Registry.lookup(__MODULE__, {conversation_id, agent_id}) do
      [{pid, _}] -> {:ok, pid}
      [] -> :error
    end
  end

  @doc """
  Build a `{:via, Registry, ...}` tuple for naming an agent process.
  """
  @spec via(String.t(), String.t()) :: {:via, Registry, {__MODULE__, {String.t(), String.t()}}}
  def via(conversation_id, agent_id) do
    {:via, Registry, {__MODULE__, {conversation_id, agent_id}}}
  end
end
