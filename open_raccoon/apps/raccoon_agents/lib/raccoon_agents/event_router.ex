defmodule RaccoonAgents.EventRouter do
  @moduledoc """
  Routes inbound triggers to the correct `AgentProcess`.

  Trigger types:
    - `:user_message`    — interactive conversation turn
    - `:cron_schedule`   — Oban schedule worker fires
    - `:webhook`         — external webhook event
    - `:channel_message` — Telegram / WhatsApp / etc.
    - `:api_call`        — programmatic REST trigger
  """

  use GenServer

  alias RaccoonAgents.{AgentProcess, AgentSupervisor, ProcessRegistry}

  @trigger_types [:user_message, :cron_schedule, :webhook, :channel_message, :api_call]

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @doc """
  Route a trigger to the appropriate agent process.

  `payload` must include `:conversation_id`, `:agent_id`, `:user_id`,
  `:messages`, and `:config`.
  """
  def route_trigger(trigger_type, payload) when trigger_type in @trigger_types do
    GenServer.cast(__MODULE__, {:trigger, trigger_type, payload})
  end

  # -- Callbacks -------------------------------------------------------------

  @impl true
  def init(:ok) do
    {:ok, %{}}
  end

  @impl true
  def handle_cast({:trigger, _trigger_type, payload}, state) do
    %{
      conversation_id: conv_id,
      agent_id: agent_id,
      user_id: user_id,
      messages: messages,
      config: config
    } = payload

    # Find or start agent process
    case ProcessRegistry.lookup(conv_id, agent_id) do
      {:ok, _pid} ->
        AgentProcess.execute(conv_id, agent_id, messages, config)

      :error ->
        {:ok, _pid} = AgentSupervisor.start_agent(conv_id, agent_id, user_id)
        AgentProcess.execute(conv_id, agent_id, messages, config)
    end

    {:noreply, state}
  end
end
