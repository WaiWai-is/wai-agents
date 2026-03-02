defmodule RaccoonIntegrations.IntegrationEventTest do
  use ExUnit.Case, async: true

  alias RaccoonIntegrations.IntegrationEvent

  test "creates an IntegrationEvent struct" do
    event = %IntegrationEvent{
      service: "github",
      event_type: "push",
      external_id: "12345",
      actor: %{id: "user1", name: "octocat", avatar_url: nil},
      payload: %{ref: "refs/heads/main"},
      raw_payload: %{"action" => "push"},
      timestamp: DateTime.utc_now()
    }

    assert event.service == "github"
    assert event.event_type == "push"
    assert event.external_id == "12345"
    assert event.actor.id == "user1"
  end

  test "all fields default to nil" do
    event = %IntegrationEvent{}
    assert is_nil(event.service)
    assert is_nil(event.event_type)
    assert is_nil(event.external_id)
    assert is_nil(event.actor)
    assert is_nil(event.payload)
    assert is_nil(event.raw_payload)
    assert is_nil(event.timestamp)
  end
end
