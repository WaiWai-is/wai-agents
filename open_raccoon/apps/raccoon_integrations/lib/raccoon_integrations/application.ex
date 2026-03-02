defmodule RaccoonIntegrations.Application do
  @moduledoc """
  OTP Application for raccoon_integrations.

  Starts the integration Registry and rate limiter ETS table.
  """

  use Application

  @impl true
  def start(_type, _args) do
    # Initialize ETS tables before starting the supervisor
    RaccoonIntegrations.RateLimiter.init()
    RaccoonIntegrations.OAuth.init_state_store()

    children = [
      {Registry, keys: :unique, name: RaccoonIntegrations.Registry}
    ]

    opts = [strategy: :one_for_one, name: RaccoonIntegrations.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
