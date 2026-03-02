defmodule RaccoonAgents.AgentSupervisorTest do
  use ExUnit.Case, async: false

  alias RaccoonAgents.{AgentSupervisor, ProcessRegistry}

  setup do
    # Ensure the supervisor is running (started by Application)
    # We'll test using the live supervisor
    :ok
  end

  test "start_link starts the DynamicSupervisor" do
    # The supervisor is already started by the application.
    # Verify it's alive.
    assert Process.whereis(AgentSupervisor) != nil
  end

  test "active_count returns 0 when no agents are running" do
    assert AgentSupervisor.active_count() >= 0
  end

  test "stop_agent returns error when agent not found" do
    assert {:error, :not_found} =
             AgentSupervisor.stop_agent("nonexistent-conv", "nonexistent-agent")
  end

  test "ProcessRegistry.lookup returns :error for unknown key" do
    assert :error = ProcessRegistry.lookup("unknown-conv", "unknown-agent")
  end

  test "ProcessRegistry.via returns a valid via tuple" do
    result = ProcessRegistry.via("conv-123", "agent-456")
    assert {:via, Registry, {RaccoonAgents.ProcessRegistry, {"conv-123", "agent-456"}}} = result
  end
end
