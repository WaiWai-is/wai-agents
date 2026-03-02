defmodule RaccoonGatewayWeb.AgentChannel do
  @moduledoc """
  Channel for agent streaming events and tool approval flow.

  Client -> Server events:
    - approval_decision: {request_id, decision, scope}

  Server -> Client events (pushed from AgentExecutor via PubSub):
    - token:              {text}
    - status:             {message}
    - approval_requested: {request_id, tool, args_preview, scopes}
    - approval_granted:   {request_id, scope}
    - approval_denied:    {request_id, reason_code}
    - approval_revoked:   {tool, scope}
    - tool_call:          {tool, args}
    - tool_result:        {tool, result}
    - code_block:         {language, code}
    - complete:           {message}
    - error:              {message}
  """

  use RaccoonGatewayWeb, :channel

  alias RaccoonAgents.{GRPCClient, ToolApproval}

  @impl true
  def join("agent:" <> conversation_id, _params, socket) do
    user_id = socket.assigns.user_id

    case RaccoonChat.get_membership(conversation_id, user_id) do
      nil ->
        {:error, %{reason: "not_a_member"}}

      _member ->
        {:ok, assign(socket, :conversation_id, conversation_id)}
    end
  end

  # Client approves/denies a tool call
  @impl true
  def handle_in("approval_decision", payload, socket) do
    %{"request_id" => request_id, "decision" => decision} = payload
    scope = Map.get(payload, "scope", "allow_once")
    conversation_id = socket.assigns.conversation_id
    user_id = socket.assigns.user_id

    decision_atom = if decision == "approve", do: :approved, else: :denied
    scope_atom = parse_scope(scope)

    ToolApproval.record_decision(%{
      actor_user_id: user_id,
      agent_id: nil,
      conversation_id: conversation_id,
      tool_name: Map.get(payload, "tool_name"),
      scope: scope_atom,
      arguments_hash: nil,
      decision: decision_atom
    })

    # Forward approval decision to Python sidecar via SubmitApproval RPC
    GRPCClient.submit_approval(
      conversation_id,
      request_id,
      decision_atom == :approved,
      scope_atom
    )

    event = if decision == "approve", do: "approval_granted", else: "approval_denied"

    broadcast!(socket, event, %{
      request_id: request_id,
      scope: scope,
      user_id: user_id
    })

    {:reply, :ok, socket}
  end

  # -- PubSub handle_info clauses for AgentExecutor events --

  @impl true
  def handle_info(%{event: "token", payload: payload}, socket) do
    push(socket, "token", payload)
    {:noreply, socket}
  end

  @impl true
  def handle_info(%{event: "status", payload: payload}, socket) do
    push(socket, "status", payload)
    {:noreply, socket}
  end

  @impl true
  def handle_info(%{event: "tool_call", payload: payload}, socket) do
    push(socket, "tool_call", payload)
    {:noreply, socket}
  end

  @impl true
  def handle_info(%{event: "tool_result", payload: payload}, socket) do
    push(socket, "tool_result", payload)
    {:noreply, socket}
  end

  @impl true
  def handle_info(%{event: "approval_requested", payload: payload}, socket) do
    push(socket, "approval_requested", payload)
    {:noreply, socket}
  end

  @impl true
  def handle_info(%{event: "code_block", payload: payload}, socket) do
    push(socket, "code_block", payload)
    {:noreply, socket}
  end

  @impl true
  def handle_info(%{event: "complete", payload: payload}, socket) do
    push(socket, "complete", payload)
    {:noreply, socket}
  end

  @impl true
  def handle_info(%{event: "error", payload: payload}, socket) do
    push(socket, "error", payload)
    {:noreply, socket}
  end

  @impl true
  def handle_info(_msg, socket) do
    {:noreply, socket}
  end

  # -- Private --

  defp parse_scope("allow_once"), do: :allow_once
  defp parse_scope("allow_for_session"), do: :allow_for_session
  defp parse_scope("always_for_agent_tool"), do: :always_for_agent_tool
  defp parse_scope(_), do: :allow_once
end
