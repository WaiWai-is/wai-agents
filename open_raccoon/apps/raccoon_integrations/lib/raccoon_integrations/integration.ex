defmodule RaccoonIntegrations.Integration do
  @moduledoc """
  Behaviour that all integrations must implement.

  Each integration module represents a third-party service (Gmail, GitHub, Slack, etc.)
  and defines its authentication method, capabilities, rate limits, and action execution.
  """

  @type auth_method :: :oauth2 | :oauth2_pkce | :bot_token | :api_key
  @type capability :: :read | :write | :webhook | :realtime

  @doc "Service identifier (e.g., \"gmail\", \"github\", \"slack\")."
  @callback service_name() :: String.t()

  @doc "Authentication method used by this integration."
  @callback auth_method() :: auth_method()

  @doc """
  OAuth configuration map. Required for :oauth2 and :oauth2_pkce auth methods.

  Expected keys: :client_id, :client_secret, :auth_url, :token_url, :scopes, :pkce (boolean)
  """
  @callback oauth_config() :: map()

  @doc "List of capabilities this integration supports."
  @callback capabilities() :: [capability()]

  @doc """
  Rate limit configuration for this service.

  Expected keys: :requests_per_minute, :requests_per_second, etc.
  """
  @callback rate_limits() :: map()

  @doc """
  Normalize an inbound webhook payload into an IntegrationEvent.
  Returns {:ok, event} or {:error, reason}.
  """
  @callback normalize_webhook(payload :: map()) ::
              {:ok, RaccoonIntegrations.IntegrationEvent.t()} | {:error, term()}

  @doc """
  Verify an inbound webhook signature.
  Returns :ok if valid, {:error, reason} otherwise.
  """
  @callback verify_webhook(headers :: map(), body :: binary()) :: :ok | {:error, term()}

  @doc """
  Execute a service-specific action using the provided credential.
  Actions are atoms like :send_message, :search, :create_issue, etc.
  """
  @callback execute_action(action :: atom(), params :: map(), credential :: map()) ::
              {:ok, map()} | {:error, term()}

  @optional_callbacks [normalize_webhook: 1, verify_webhook: 2]
end
