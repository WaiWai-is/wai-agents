defmodule RaccoonAgents.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      {GRPC.Client.Supervisor, []},
      RaccoonAgents.CostTracker,
      {RaccoonAgents.ToolApproval.Store, []},
      {Registry, keys: :unique, name: RaccoonAgents.ProcessRegistry},
      RaccoonAgents.AgentSupervisor,
      RaccoonAgents.EventRouter
    ]

    opts = [strategy: :one_for_one, name: RaccoonAgents.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
