defmodule RaccoonAgents.ToolApprovalPersistenceTest do
  use ExUnit.Case, async: false

  alias RaccoonAgents.ToolApproval
  alias RaccoonAgents.ToolApproval.Store

  setup do
    # Clean up ETS entries used in tests
    on_exit(fn ->
      Store.delete("test-user-1", "test-agent-1", "test_tool")
      Store.delete("test-user-2", "test-agent-2", "another_tool")
    end)

    :ok
  end

  test "Store is running" do
    assert Process.whereis(Store) != nil
  end

  test "record_decision inserts into ETS" do
    {:ok, entry} =
      ToolApproval.record_decision(%{
        actor_user_id: "test-user-1",
        agent_id: "test-agent-1",
        conversation_id: "test-conv-1",
        tool_name: "test_tool",
        scope: :always_for_agent_tool,
        arguments_hash: nil,
        decision: :approved
      })

    assert entry.actor_user_id == "test-user-1"
    assert entry.decision == :approved
    assert entry.scope == :always_for_agent_tool
    assert entry.decided_at != nil

    # Verify ETS lookup works
    assert :approved = Store.lookup("test-user-1", "test-agent-1", "test_tool")
  end

  test "lookup returns :not_found for non-existent entry" do
    assert :not_found = Store.lookup("no-user", "no-agent", "no-tool")
  end

  test "lookup only matches always_for_agent_tool approved entries" do
    ToolApproval.record_decision(%{
      actor_user_id: "test-user-2",
      agent_id: "test-agent-2",
      conversation_id: "test-conv-2",
      tool_name: "another_tool",
      scope: :allow_once,
      arguments_hash: nil,
      decision: :approved
    })

    # allow_once should not be returned as a remembered approval
    assert :not_found = Store.lookup("test-user-2", "test-agent-2", "another_tool")
  end

  test "delete removes entry from ETS" do
    ToolApproval.record_decision(%{
      actor_user_id: "test-user-1",
      agent_id: "test-agent-1",
      conversation_id: nil,
      tool_name: "test_tool",
      scope: :always_for_agent_tool,
      arguments_hash: nil,
      decision: :approved
    })

    assert :approved = Store.lookup("test-user-1", "test-agent-1", "test_tool")

    Store.delete("test-user-1", "test-agent-1", "test_tool")
    assert :not_found = Store.lookup("test-user-1", "test-agent-1", "test_tool")
  end

  test "hash_arguments produces consistent SHA-256 hashes" do
    hash1 = ToolApproval.hash_arguments(%{"key" => "value"})
    hash2 = ToolApproval.hash_arguments(%{"key" => "value"})
    assert hash1 == hash2
    assert is_binary(hash1)
    assert String.length(hash1) == 64
  end

  test "hash_arguments returns nil for nil input" do
    assert nil == ToolApproval.hash_arguments(nil)
  end
end
