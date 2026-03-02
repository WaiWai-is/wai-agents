defmodule RaccoonAgents.AgentExecutor do
  @moduledoc """
  Sends gRPC request to Python sidecar, streams response events to the
  agent:{conversation_id} PubSub topic for pickup by AgentChannel.

  ## Lifecycle

  1. `execute/5` spawns a short-lived GenServer.
  2. The GenServer opens a gRPC stream to the Python sidecar.
  3. Each streamed event is broadcast to `agent:{conversation_id}`.
  4. On stream completion or error the process terminates normally.

  ## Events broadcast

  See `RaccoonGatewayWeb.AgentChannel` for the full event catalogue:
  token, status, tool_call, tool_result, code_block,
  approval_requested, complete, error.
  """

  use GenServer
  require Logger

  alias RaccoonAgents.{CostTracker, GRPCClient, ToolApproval}
  alias RaccoonShared.Repo
  alias RaccoonAgents.Agent
  import Ecto.Query

  defstruct [:conversation_id, :agent_id, :user_id, :channel_pid]

  @stream_timeout 120_000

  # -- Public API ------------------------------------------------------------

  @doc """
  Start agent execution for a conversation.

  Returns `{:ok, pid}` of the executor process.
  """
  def execute(conversation_id, agent_id, user_id, messages, config) do
    case start_link(%{
           conversation_id: conversation_id,
           agent_id: agent_id,
           user_id: user_id
         }) do
      {:ok, pid} ->
        GenServer.cast(pid, {:execute, messages, config})
        {:ok, pid}

      {:error, {:already_started, _pid}} ->
        Logger.warning("Agent execution already in progress",
          conversation_id: conversation_id
        )

        {:error, :already_executing}
    end
  end

  def start_link(opts) do
    name = via_tuple(opts.conversation_id)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  defp via_tuple(conversation_id) do
    {:via, Registry, {RaccoonAgents.ExecutorRegistry, conversation_id}}
  end

  # -- Callbacks -------------------------------------------------------------

  @impl true
  def init(opts) do
    {:ok, struct(__MODULE__, opts)}
  end

  @impl true
  def handle_cast({:execute, messages, config}, state) do
    Logger.info("Starting agent execution",
      conversation_id: state.conversation_id,
      agent_id: state.agent_id
    )

    topic = "agent:#{state.conversation_id}"

    # 1. Check agent visibility - private agents can only be used by their creator
    with {:ok, agent} <- check_agent_visibility(state.agent_id, state.user_id),
         # 2. Check cost limit before execution
         :ok <- CostTracker.check_limit(state.user_id) do
      broadcast(topic, "status", %{
        message: "connecting to agent runtime...",
        category: "thinking"
      })

      enriched_config =
        config
        |> Map.put(:mcp_servers, agent.mcp_servers || [])
        |> Map.put(:execution_mode, to_string(agent.execution_mode || :raw))

      request_params = %{
        conversation_id: state.conversation_id,
        agent_id: state.agent_id,
        messages: messages,
        config: enriched_config,
        user_api_key: Map.get(config, :user_api_key, Map.get(config, "user_api_key", ""))
      }

      case GRPCClient.execute_agent(request_params) do
        {:ok, event_stream, channel} ->
          consume_stream(event_stream, topic, state, channel)
          GRPC.Stub.disconnect(channel)

        {:error, reason} ->
          Logger.error("gRPC connection failed: #{inspect(reason)}",
            conversation_id: state.conversation_id
          )

          broadcast(topic, "error", %{
            code: "sidecar_unavailable",
            message: "Agent runtime is not reachable: #{inspect(reason)}"
          })
      end
    else
      {:error, :limit_exceeded} ->
        broadcast(topic, "error", %{
          code: "limit_exceeded",
          message:
            "Token usage limit exceeded. Please upgrade your plan or wait for the limit to reset."
        })

      {:error, :private_agent} ->
        broadcast(topic, "error", %{
          code: "forbidden",
          message: "This agent is private and can only be used by its creator."
        })

      {:error, :agent_not_found} ->
        broadcast(topic, "error", %{
          code: "not_found",
          message: "Agent not found."
        })
    end

    {:stop, :normal, state}
  end

  # -- Private ---------------------------------------------------------------

  defp consume_stream(event_stream, topic, state, _channel) do
    task =
      Task.async(fn ->
        Enum.reduce(event_stream, [], fn
          {:ok, response}, acc ->
            event = GRPCClient.response_to_event(response)
            broadcast_event(topic, event, state)

            case event do
              %{type: "token", text: text} -> [text | acc]
              _ -> acc
            end

          {:error, error}, acc ->
            Logger.error("gRPC stream error: #{inspect(error)}",
              conversation_id: state.conversation_id
            )

            broadcast(topic, "error", %{
              code: "stream_error",
              message: "Agent stream error: #{inspect(error)}"
            })

            acc
        end)
      end)

    case Task.yield(task, @stream_timeout) || Task.shutdown(task, :brutal_kill) do
      {:ok, tokens_acc} ->
        save_agent_response(tokens_acc, state)

      nil ->
        Logger.error("gRPC stream timed out after #{@stream_timeout}ms",
          conversation_id: state.conversation_id
        )

        broadcast(topic, "error", %{
          code: "stream_timeout",
          message: "Agent response timed out."
        })
    end

    :ok
  end

  defp save_agent_response(tokens_acc, state) do
    text = tokens_acc |> Enum.reverse() |> Enum.join("")

    if String.trim(text) != "" do
      now = DateTime.utc_now()
      message_id = Ecto.UUID.generate()
      {:ok, message_id_bin} = Ecto.UUID.dump(message_id)
      {:ok, conversation_id_bin} = Ecto.UUID.dump(state.conversation_id)

      {1, _} =
        Repo.insert_all("messages", [
          %{
            id: message_id_bin,
            conversation_id: conversation_id_bin,
            sender_id: nil,
            sender_type: "agent",
            type: "text",
            content: %{"text" => text},
            metadata: %{"agent_id" => state.agent_id},
            created_at: now
          }
        ])

      from(c in "conversations", where: c.id == ^conversation_id_bin)
      |> Repo.update_all(set: [last_message_at: now, updated_at: now])

      # Broadcast to conversation topic so WebSocket clients receive the agent reply
      Phoenix.PubSub.broadcast(
        RaccoonGateway.PubSub,
        "conversation:#{state.conversation_id}",
        {:new_message,
         %{
           id: message_id,
           conversation_id: state.conversation_id,
           sender_id: nil,
           sender_type: :agent,
           type: :text,
           content: %{"text" => text},
           metadata: %{"agent_id" => state.agent_id},
           edited_at: nil,
           deleted_at: nil,
           created_at: now
         }}
      )

      Logger.info("Saved agent response",
        conversation_id: state.conversation_id
      )
    end
  end

  # -- Helpers ---------------------------------------------------------------

  defp broadcast(topic, event_name, payload) do
    Phoenix.PubSub.broadcast(
      RaccoonGateway.PubSub,
      topic,
      %{event: event_name, payload: payload}
    )
  end

  @doc false
  def broadcast_event(topic, event, state) do
    case event do
      %{type: "token", text: text} ->
        broadcast(topic, "token", %{text: text})

      %{type: "status", message: message, category: category} ->
        broadcast(topic, "status", %{message: message, category: category})

      %{type: "tool_call", request_id: rid, tool_name: tool, arguments: args} ->
        broadcast(topic, "tool_call", %{
          request_id: rid,
          tool: tool,
          args: args
        })

      %{type: "tool_result", request_id: rid, tool_name: tool, result: result, is_error: err} ->
        broadcast(topic, "tool_result", %{
          request_id: rid,
          tool: tool,
          result: result,
          is_error: err
        })

      %{type: "code_block", language: lang, code: code} ->
        broadcast(topic, "code_block", %{language: lang, code: code})

      %{type: "approval_requested"} = approval ->
        ToolApproval.record_decision(%{
          actor_user_id: state.user_id,
          agent_id: state.agent_id,
          conversation_id: state.conversation_id,
          tool_name: approval.tool_name,
          scope: nil,
          arguments_hash: ToolApproval.hash_arguments(approval.arguments_preview),
          decision: :pending
        })

        broadcast(topic, "approval_requested", %{
          request_id: approval.request_id,
          tool: approval.tool_name,
          args_preview: approval.arguments_preview,
          scopes: approval.available_scopes
        })

      %{type: "complete"} = complete ->
        CostTracker.record_usage(state.user_id, state.agent_id, %{
          input_tokens: Map.get(complete, :prompt_tokens, 0),
          output_tokens: Map.get(complete, :completion_tokens, 0),
          model: Map.get(complete, :model, "unknown")
        })

        increment_usage_count(state.agent_id)

        broadcast(topic, "complete", %{
          input_tokens: Map.get(complete, :prompt_tokens, 0),
          output_tokens: Map.get(complete, :completion_tokens, 0),
          model: Map.get(complete, :model, "unknown"),
          stop_reason: Map.get(complete, :stop_reason, "end_turn")
        })

      %{type: "error", code: code, message: message} ->
        broadcast(topic, "error", %{code: code, message: message})

      other ->
        Logger.warning("Unknown agent event type", event: inspect(other))
    end
  end

  defp check_agent_visibility(agent_id, user_id) do
    case Repo.get(Agent, agent_id) do
      nil ->
        {:error, :agent_not_found}

      %Agent{visibility: :private, creator_id: creator_id} when creator_id != user_id ->
        {:error, :private_agent}

      %Agent{} = agent ->
        {:ok, agent}
    end
  end

  defp increment_usage_count(agent_id) do
    from(a in Agent, where: a.id == ^agent_id)
    |> Repo.update_all(inc: [usage_count: 1])
  end
end
