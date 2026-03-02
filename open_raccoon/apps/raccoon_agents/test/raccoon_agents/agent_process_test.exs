defmodule RaccoonAgents.AgentProcessTest do
  use ExUnit.Case, async: false

  alias RaccoonAgents.AgentProcess

  test "module defines start_link/1" do
    assert function_exported?(AgentProcess, :start_link, 1)
  end

  test "module defines execute/4" do
    assert function_exported?(AgentProcess, :execute, 4)
  end

  test "module defines submit_approval/5" do
    assert function_exported?(AgentProcess, :submit_approval, 5)
  end

  test "struct has expected fields" do
    process = %AgentProcess{}
    assert Map.has_key?(process, :conversation_id)
    assert Map.has_key?(process, :agent_id)
    assert Map.has_key?(process, :user_id)
    assert Map.has_key?(process, :agent)
    assert Map.has_key?(process, :execution_pid)
    assert Map.has_key?(process, :started_at)
    assert Map.has_key?(process, :last_activity)
    assert process.started_at == nil
    assert process.last_activity == nil
  end
end
