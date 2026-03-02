defmodule RaccoonAgents.EventRouterTest do
  use ExUnit.Case, async: false

  alias RaccoonAgents.EventRouter

  test "EventRouter is running" do
    assert Process.whereis(EventRouter) != nil
  end

  test "route_trigger accepts valid trigger types" do
    valid_types = [:user_message, :cron_schedule, :webhook, :channel_message, :api_call]

    for type <- valid_types do
      # route_trigger returns :ok from GenServer.cast (async, fire-and-forget).
      # The actual execution will fail because there's no real agent in test,
      # but the cast itself should succeed without raising.
      assert :ok =
               EventRouter.route_trigger(type, %{
                 conversation_id: "test-conv",
                 agent_id: "test-agent",
                 user_id: "test-user",
                 messages: [],
                 config: %{}
               })
    end
  end

  test "route_trigger rejects invalid trigger types" do
    assert_raise FunctionClauseError, fn ->
      EventRouter.route_trigger(:invalid_type, %{})
    end
  end
end
