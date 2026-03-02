defmodule Raccoon.Agent.V1.Attachment do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:filename, 1, type: :string)
  field(:mime_type, 2, type: :string, json_name: "mimeType")
  field(:data, 3, type: :bytes)
  field(:url, 4, type: :string)
end

defmodule Raccoon.Agent.V1.Message do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:role, 1, type: :string)
  field(:content, 2, type: :string)
  field(:message_id, 3, type: :string, json_name: "messageId")
  field(:timestamp, 4, type: Google.Protobuf.Timestamp)
  field(:attachments, 5, repeated: true, type: Raccoon.Agent.V1.Attachment)
end

defmodule Raccoon.Agent.V1.AgentRequest do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:conversation_id, 1, type: :string, json_name: "conversationId")
  field(:agent_id, 2, type: :string, json_name: "agentId")
  field(:messages, 3, repeated: true, type: Raccoon.Agent.V1.Message)
  field(:config, 4, type: Raccoon.Agent.V1.AgentConfig)
  field(:user_api_key, 5, type: :string, json_name: "userApiKey")
  field(:request_id, 6, type: :string, json_name: "requestId")
end

defmodule Raccoon.Agent.V1.AgentResponse do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  oneof(:event, 0)

  field(:token, 1, type: Raccoon.Agent.V1.TokenEvent, oneof: 0)
  field(:status, 2, type: Raccoon.Agent.V1.StatusEvent, oneof: 0)
  field(:tool_call, 3, type: Raccoon.Agent.V1.ToolCallEvent, json_name: "toolCall", oneof: 0)

  field(:tool_result, 4,
    type: Raccoon.Agent.V1.ToolResultEvent,
    json_name: "toolResult",
    oneof: 0
  )

  field(:code_block, 5, type: Raccoon.Agent.V1.CodeBlockEvent, json_name: "codeBlock", oneof: 0)
  field(:error, 6, type: Raccoon.Agent.V1.ErrorEvent, oneof: 0)

  field(:approval_request, 7,
    type: Raccoon.Agent.V1.ApprovalRequestEvent,
    json_name: "approvalRequest",
    oneof: 0
  )

  field(:complete, 8, type: Raccoon.Agent.V1.CompleteEvent, oneof: 0)
end

defmodule Raccoon.Agent.V1.TokenEvent do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:text, 1, type: :string)
end

defmodule Raccoon.Agent.V1.StatusEvent do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:message, 1, type: :string)
  field(:category, 2, type: :string)
end

defmodule Raccoon.Agent.V1.ToolCallEvent do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:tool_call_id, 1, type: :string, json_name: "toolCallId")
  field(:tool_name, 2, type: :string, json_name: "toolName")
  field(:arguments, 3, type: Google.Protobuf.Struct)
end

defmodule Raccoon.Agent.V1.ToolResultEvent do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:tool_call_id, 1, type: :string, json_name: "toolCallId")
  field(:tool_name, 2, type: :string, json_name: "toolName")
  field(:success, 3, type: :bool)
  field(:output, 4, type: :string)
  field(:error_message, 5, type: :string, json_name: "errorMessage")
end

defmodule Raccoon.Agent.V1.CodeBlockEvent do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:language, 1, type: :string)
  field(:code, 2, type: :string)
  field(:filename, 3, type: :string)
end

defmodule Raccoon.Agent.V1.ErrorEvent do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:code, 1, type: :string)
  field(:message, 2, type: :string)
  field(:recoverable, 3, type: :bool)
end

defmodule Raccoon.Agent.V1.ApprovalRequestEvent do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:approval_id, 1, type: :string, json_name: "approvalId")
  field(:tool_name, 2, type: :string, json_name: "toolName")
  field(:arguments, 3, type: Google.Protobuf.Struct)
  field(:reason, 4, type: :string)
end

defmodule Raccoon.Agent.V1.CompleteEvent do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:input_tokens, 1, type: :int32, json_name: "inputTokens")
  field(:output_tokens, 2, type: :int32, json_name: "outputTokens")
  field(:model, 3, type: :string)
  field(:stop_reason, 4, type: :string, json_name: "stopReason")
end

defmodule Raccoon.Agent.V1.ApprovalDecision do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:conversation_id, 1, type: :string, json_name: "conversationId")
  field(:request_id, 2, type: :string, json_name: "requestId")
  field(:approved, 3, type: :bool)
  field(:scope, 4, type: :string)
end

defmodule Raccoon.Agent.V1.ApprovalAck do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:accepted, 1, type: :bool)
  field(:error, 2, type: :string)
end

defmodule Raccoon.Agent.V1.MCPServerConfig.EnvEntry do
  @moduledoc false
  use Protobuf, map: true, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:key, 1, type: :string)
  field(:value, 2, type: :string)
end

defmodule Raccoon.Agent.V1.MCPServerConfig.HeadersEntry do
  @moduledoc false
  use Protobuf, map: true, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:key, 1, type: :string)
  field(:value, 2, type: :string)
end

defmodule Raccoon.Agent.V1.MCPServerConfig do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:name, 1, type: :string)
  field(:transport, 2, type: :string)
  field(:command, 3, type: :string)
  field(:args, 4, repeated: true, type: :string)
  field(:url, 5, type: :string)
  field(:env, 6, repeated: true, type: Raccoon.Agent.V1.MCPServerConfig.EnvEntry, map: true)

  field(:headers, 7,
    repeated: true,
    type: Raccoon.Agent.V1.MCPServerConfig.HeadersEntry,
    map: true
  )
end

defmodule Raccoon.Agent.V1.AgentConfig do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:agent_id, 1, type: :string, json_name: "agentId")
  field(:system_prompt, 2, type: :string, json_name: "systemPrompt")
  field(:model, 3, type: :string)
  field(:temperature, 4, type: :double)
  field(:max_tokens, 5, type: :int32, json_name: "maxTokens")
  field(:tools, 6, repeated: true, type: Raccoon.Agent.V1.ToolConfig)
  field(:visibility, 7, type: :string)
  field(:execution_mode, 8, type: :string, json_name: "executionMode")

  field(:mcp_servers, 9,
    repeated: true,
    type: Raccoon.Agent.V1.MCPServerConfig,
    json_name: "mcpServers"
  )
end

defmodule Raccoon.Agent.V1.ToolConfig do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:name, 1, type: :string)
  field(:description, 2, type: :string)
  field(:input_schema, 3, type: Google.Protobuf.Struct, json_name: "inputSchema")
  field(:requires_approval, 4, type: :bool, json_name: "requiresApproval")
end

defmodule Raccoon.Agent.V1.AgentConfigRequest do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:agent_id, 1, type: :string, json_name: "agentId")
end

defmodule Raccoon.Agent.V1.ValidateToolsRequest do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:tools, 1, repeated: true, type: Raccoon.Agent.V1.ToolConfig)
end

defmodule Raccoon.Agent.V1.ToolValidationError do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:tool_name, 1, type: :string, json_name: "toolName")
  field(:error, 2, type: :string)
end

defmodule Raccoon.Agent.V1.ValidateToolsResponse do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:valid, 1, type: :bool)
  field(:errors, 2, repeated: true, type: Raccoon.Agent.V1.ToolValidationError)
end

defmodule Raccoon.Agent.V1.CreateSandboxRequest do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:conversation_id, 1, type: :string, json_name: "conversationId")
  field(:template, 2, type: :string)
  field(:limits, 3, type: Raccoon.Agent.V1.SandboxLimits)
end

defmodule Raccoon.Agent.V1.SandboxLimits do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:max_cpu, 1, type: :int32, json_name: "maxCpu")
  field(:max_memory_mb, 2, type: :int32, json_name: "maxMemoryMb")
  field(:timeout_seconds, 3, type: :int32, json_name: "timeoutSeconds")
end

defmodule Raccoon.Agent.V1.SandboxInfo do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:sandbox_id, 1, type: :string, json_name: "sandboxId")
  field(:conversation_id, 2, type: :string, json_name: "conversationId")
  field(:template, 3, type: :string)
  field(:status, 4, type: :string)
  field(:preview_url, 5, type: :string, json_name: "previewUrl")
  field(:created_at, 6, type: Google.Protobuf.Timestamp, json_name: "createdAt")
  field(:limits, 7, type: Raccoon.Agent.V1.SandboxLimits)
end

defmodule Raccoon.Agent.V1.ExecuteCodeRequest do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:sandbox_id, 1, type: :string, json_name: "sandboxId")
  field(:code, 2, type: :string)
  field(:language, 3, type: :string)
  field(:timeout_seconds, 4, type: :int32, json_name: "timeoutSeconds")
end

defmodule Raccoon.Agent.V1.ExecutionResult do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:exit_code, 1, type: :int32, json_name: "exitCode")
  field(:output, 2, type: :string)
  field(:files, 3, repeated: true, type: Raccoon.Agent.V1.OutputFile)
end

defmodule Raccoon.Agent.V1.ExecutionError do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:code, 1, type: :string)
  field(:message, 2, type: :string)
end

defmodule Raccoon.Agent.V1.ExecutionOutput do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  oneof(:output, 0)

  field(:stdout, 1, type: :string, oneof: 0)
  field(:stderr, 2, type: :string, oneof: 0)
  field(:result, 3, type: Raccoon.Agent.V1.ExecutionResult, oneof: 0)
  field(:error, 4, type: Raccoon.Agent.V1.ExecutionError, oneof: 0)
end

defmodule Raccoon.Agent.V1.OutputFile do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:path, 1, type: :string)
  field(:mime_type, 2, type: :string, json_name: "mimeType")
  field(:data, 3, type: :bytes)
end

defmodule Raccoon.Agent.V1.UploadFileRequest do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:sandbox_id, 1, type: :string, json_name: "sandboxId")
  field(:path, 2, type: :string)
  field(:data, 3, type: :bytes)
  field(:mime_type, 4, type: :string, json_name: "mimeType")
end

defmodule Raccoon.Agent.V1.UploadFileResponse do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:path, 1, type: :string)
  field(:size_bytes, 2, type: :int64, json_name: "sizeBytes")
end

defmodule Raccoon.Agent.V1.DestroySandboxRequest do
  @moduledoc false
  use Protobuf, protoc_gen_elixir_version: "0.13.0", syntax: :proto3

  field(:sandbox_id, 1, type: :string, json_name: "sandboxId")
end

defmodule Raccoon.Agent.V1.AgentService.Service do
  @moduledoc false
  use GRPC.Service, name: "raccoon.agent.v1.AgentService"

  rpc(:ExecuteAgent, Raccoon.Agent.V1.AgentRequest, stream(Raccoon.Agent.V1.AgentResponse))
  rpc(:GetAgentConfig, Raccoon.Agent.V1.AgentConfigRequest, Raccoon.Agent.V1.AgentConfig)

  rpc(
    :ValidateTools,
    Raccoon.Agent.V1.ValidateToolsRequest,
    Raccoon.Agent.V1.ValidateToolsResponse
  )

  rpc(
    :SubmitApproval,
    Raccoon.Agent.V1.ApprovalDecision,
    Raccoon.Agent.V1.ApprovalAck
  )
end

defmodule Raccoon.Agent.V1.AgentService.Stub do
  @moduledoc false
  use GRPC.Stub, service: Raccoon.Agent.V1.AgentService.Service
end

defmodule Raccoon.Agent.V1.SandboxService.Service do
  @moduledoc false
  use GRPC.Service, name: "raccoon.agent.v1.SandboxService"

  rpc(
    :CreateSandbox,
    Raccoon.Agent.V1.CreateSandboxRequest,
    Raccoon.Agent.V1.SandboxInfo
  )

  rpc(
    :ExecuteCode,
    Raccoon.Agent.V1.ExecuteCodeRequest,
    stream(Raccoon.Agent.V1.ExecutionOutput)
  )

  rpc(
    :UploadFile,
    Raccoon.Agent.V1.UploadFileRequest,
    Raccoon.Agent.V1.UploadFileResponse
  )

  rpc(
    :DestroySandbox,
    Raccoon.Agent.V1.DestroySandboxRequest,
    Google.Protobuf.Empty
  )
end

defmodule Raccoon.Agent.V1.SandboxService.Stub do
  @moduledoc false
  use GRPC.Stub, service: Raccoon.Agent.V1.SandboxService.Service
end
