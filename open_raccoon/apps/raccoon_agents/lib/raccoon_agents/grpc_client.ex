defmodule RaccoonAgents.GRPCClient do
  @moduledoc """
  Manages the gRPC channel to the Python agent sidecar and provides
  a streaming interface for agent execution.

  The sidecar address defaults to `localhost:50051` and can be
  overridden with the `AGENT_SIDECAR_ADDR` environment variable.
  """

  require Logger

  alias Raccoon.Agent.V1.{
    AgentRequest,
    AgentConfig,
    Message,
    AgentService,
    ApprovalDecision,
    MCPServerConfig
  }

  @default_addr "localhost:50051"

  @doc """
  Connect to the agent sidecar and return a gRPC channel.
  """
  @spec connect() :: {:ok, GRPC.Channel.t()} | {:error, term()}
  def connect do
    addr = System.get_env("AGENT_SIDECAR_ADDR", @default_addr)
    GRPC.Stub.connect(addr)
  end

  @doc """
  Execute an agent request and return a stream of `Raccoon.Agent.V1.AgentResponse` events.

  `params` is a map with:
    - `:conversation_id` - string
    - `:agent_id` - string
    - `:messages` - list of maps with `:role` and `:content`
    - `:config` - map with agent config fields (optional)
    - `:user_api_key` - string (optional, empty for platform credits)
    - `:request_id` - idempotency key (optional)

  Returns `{:ok, event_stream, channel}` on success where `event_stream`
  is an `Enumerable` of `{:ok, AgentResponse}` tuples, or `{:error, reason}`.
  """
  @spec execute_agent(map()) :: {:ok, Enumerable.t(), GRPC.Channel.t()} | {:error, term()}
  def execute_agent(params) do
    with :ok <- validate_required_params(params),
         {:ok, channel} <- connect() do
      request = build_request(params)

      try do
        stream = AgentService.Stub.execute_agent(channel, request)

        case GRPC.Stub.recv(stream) do
          {:ok, enum} ->
            {:ok, enum, channel}

          {:error, %GRPC.RPCError{} = error} ->
            GRPC.Stub.disconnect(channel)
            {:error, {:grpc_error, error.status, error.message}}

          {:error, reason} ->
            GRPC.Stub.disconnect(channel)
            {:error, reason}
        end
      rescue
        e ->
          GRPC.Stub.disconnect(channel)
          {:error, e}
      end
    end
  end

  @doc """
  Send an approval decision to the Python sidecar via the SubmitApproval RPC.

  Returns `{:ok, ack}` or `{:error, reason}`.
  """
  def submit_approval(conversation_id, request_id, approved, scope) do
    case connect() do
      {:ok, channel} ->
        request =
          %ApprovalDecision{
            conversation_id: to_string(conversation_id),
            request_id: to_string(request_id),
            approved: approved,
            scope: to_string(scope)
          }

        result = AgentService.Stub.submit_approval(channel, request)
        GRPC.Stub.disconnect(channel)
        result

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp validate_required_params(params) do
    conversation_id = to_string(params[:conversation_id] || "")
    agent_id = to_string(params[:agent_id] || "")

    cond do
      conversation_id == "" ->
        {:error, :missing_conversation_id}

      agent_id == "" ->
        {:error, :missing_agent_id}

      true ->
        :ok
    end
  end

  @doc """
  Convert a protobuf `AgentResponse` into a flat Elixir map suitable for
  `AgentExecutor.broadcast_event/3`.
  """
  @spec response_to_event(Raccoon.Agent.V1.AgentResponse.t()) :: map()
  def response_to_event(%{token: %{text: text}} = _resp) when text != nil do
    %{type: "token", text: text}
  end

  def response_to_event(%{status: %{message: message, category: category}})
      when message != nil do
    %{type: "status", message: message, category: category}
  end

  def response_to_event(%{tool_call: %{tool_call_id: id, tool_name: name, arguments: args}})
      when id != nil do
    %{
      type: "tool_call",
      request_id: id,
      tool_name: name,
      arguments: struct_to_map(args)
    }
  end

  def response_to_event(%{
        tool_result: %{
          tool_call_id: id,
          tool_name: name,
          success: success,
          output: output,
          error_message: error_msg
        }
      })
      when id != nil do
    %{
      type: "tool_result",
      request_id: id,
      tool_name: name,
      result: if(success, do: output, else: error_msg),
      is_error: !success
    }
  end

  def response_to_event(%{code_block: %{language: lang, code: code}}) when code != nil do
    %{type: "code_block", language: lang, code: code}
  end

  def response_to_event(%{
        approval_request: %{
          approval_id: id,
          tool_name: name,
          arguments: args,
          reason: _reason
        }
      })
      when id != nil do
    %{
      type: "approval_requested",
      request_id: id,
      tool_name: name,
      arguments_preview: struct_to_map(args),
      available_scopes: []
    }
  end

  def response_to_event(%{
        complete: %{
          input_tokens: input,
          output_tokens: output,
          model: model,
          stop_reason: stop
        }
      })
      when model != nil do
    %{
      type: "complete",
      prompt_tokens: input,
      completion_tokens: output,
      model: model,
      stop_reason: stop
    }
  end

  def response_to_event(%{error: %{code: code, message: message}}) when code != nil do
    %{type: "error", code: code, message: message}
  end

  def response_to_event(_other) do
    %{type: "unknown"}
  end

  # -- Private ---------------------------------------------------------------

  defp build_request(params) do
    messages =
      (params[:messages] || [])
      |> Enum.map(fn msg ->
        %Message{
          role: Map.get(msg, :role, Map.get(msg, "role", "user")),
          content: Map.get(msg, :content, Map.get(msg, "content", "")),
          message_id: Map.get(msg, :message_id, Map.get(msg, "message_id", ""))
        }
      end)

    config =
      case params[:config] do
        nil ->
          nil

        cfg when is_map(cfg) ->
          mcp_servers =
            (Map.get(cfg, :mcp_servers, Map.get(cfg, "mcp_servers")) || [])
            |> Enum.map(&build_mcp_server_config/1)

          %AgentConfig{
            agent_id: Map.get(cfg, :agent_id, Map.get(cfg, "agent_id", "")),
            system_prompt: Map.get(cfg, :system_prompt, Map.get(cfg, "system_prompt", "")),
            model: Map.get(cfg, :model, Map.get(cfg, "model", "")),
            temperature: to_float(Map.get(cfg, :temperature, Map.get(cfg, "temperature", 0.7))),
            max_tokens: Map.get(cfg, :max_tokens, Map.get(cfg, "max_tokens", 4096)),
            visibility: Map.get(cfg, :visibility, Map.get(cfg, "visibility", "private")),
            execution_mode: Map.get(cfg, :execution_mode, Map.get(cfg, "execution_mode", "raw")),
            mcp_servers: mcp_servers
          }
      end

    %AgentRequest{
      conversation_id: to_string(params[:conversation_id] || ""),
      agent_id: to_string(params[:agent_id] || ""),
      messages: messages,
      config: config,
      user_api_key: Map.get(params, :user_api_key, ""),
      request_id: Map.get(params, :request_id, "")
    }
  end

  defp build_mcp_server_config(server) when is_map(server) do
    %MCPServerConfig{
      name: Map.get(server, "name", Map.get(server, :name, "")),
      transport: Map.get(server, "transport", Map.get(server, :transport, "stdio")),
      command: Map.get(server, "command", Map.get(server, :command, "")),
      args: Map.get(server, "args", Map.get(server, :args, [])),
      url: Map.get(server, "url", Map.get(server, :url, "")),
      env: Map.get(server, "env", Map.get(server, :env, %{})),
      headers: Map.get(server, "headers", Map.get(server, :headers, %{}))
    }
  end

  defp struct_to_map(nil), do: %{}

  defp struct_to_map(%Google.Protobuf.Struct{fields: fields}) when is_map(fields) do
    Map.new(fields, fn {k, v} -> {k, protobuf_value_to_term(v)} end)
  end

  defp struct_to_map(_), do: %{}

  defp protobuf_value_to_term(%Google.Protobuf.Value{kind: {:string_value, v}}), do: v
  defp protobuf_value_to_term(%Google.Protobuf.Value{kind: {:number_value, v}}), do: v
  defp protobuf_value_to_term(%Google.Protobuf.Value{kind: {:bool_value, v}}), do: v
  defp protobuf_value_to_term(%Google.Protobuf.Value{kind: {:null_value, _}}), do: nil

  defp protobuf_value_to_term(%Google.Protobuf.Value{kind: {:struct_value, s}}),
    do: struct_to_map(s)

  defp protobuf_value_to_term(%Google.Protobuf.Value{kind: {:list_value, %{values: vs}}}),
    do: Enum.map(vs, &protobuf_value_to_term/1)

  defp protobuf_value_to_term(_), do: nil

  defp to_float(val) when is_float(val), do: val
  defp to_float(val) when is_integer(val), do: val * 1.0

  defp to_float(val) when is_binary(val) do
    case Float.parse(val) do
      {f, _} -> f
      :error -> 0.7
    end
  end

  defp to_float(_), do: 0.7
end
