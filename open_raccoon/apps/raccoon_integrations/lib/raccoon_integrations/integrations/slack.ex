defmodule RaccoonIntegrations.Integrations.Slack do
  @moduledoc """
  Slack integration via OAuth 2.0 (Slack app).

  Supports sending messages, searching, listing channels, uploading files, and reacting.
  """

  @behaviour RaccoonIntegrations.Integration

  @base_url "https://slack.com/api"

  @impl true
  def service_name, do: "slack"

  @impl true
  def auth_method, do: :oauth2

  @impl true
  def oauth_config do
    %{
      client_id: Application.get_env(:raccoon_integrations, :slack_client_id),
      client_secret: Application.get_env(:raccoon_integrations, :slack_client_secret),
      auth_url: "https://slack.com/oauth/v2/authorize",
      token_url: "https://slack.com/api/oauth.v2.access",
      scopes: ["channels:read", "chat:write", "users:read", "files:read"],
      pkce: false
    }
  end

  @impl true
  def capabilities, do: [:read, :write, :webhook, :realtime]

  @impl true
  def rate_limits do
    %{requests_per_minute: 50}
  end

  @impl true
  def normalize_webhook(%{"event" => event} = payload) do
    {:ok,
     %RaccoonIntegrations.IntegrationEvent{
       service: "slack",
       event_type: event["type"],
       external_id: event["event_ts"] || event["ts"],
       actor: %{
         id: event["user"] || "",
         name: event["user"] || "unknown",
         avatar_url: nil
       },
       payload: %{
         channel: event["channel"],
         text: event["text"],
         thread_ts: event["thread_ts"]
       },
       raw_payload: payload,
       timestamp: DateTime.utc_now()
     }}
  end

  def normalize_webhook(_payload), do: {:ok, :ignored}

  @impl true
  def verify_webhook(headers, body) do
    timestamp = headers["x-slack-request-timestamp"]
    expected = headers["x-slack-signature"]

    case Application.get_env(:raccoon_integrations, :slack_signing_secret) do
      nil ->
        {:error, :no_signing_secret_configured}

      secret ->
        basestring = "v0:#{timestamp}:#{body}"
        computed = "v0=" <> (:crypto.mac(:hmac, :sha256, secret, basestring) |> Base.encode16(case: :lower))

        if Plug.Crypto.secure_compare(computed, expected || "") do
          :ok
        else
          {:error, :invalid_signature}
        end
    end
  end

  @impl true
  def execute_action(:send_message, %{channel: channel, text: text} = params, credential) do
    body = %{channel: channel, text: text}
    body = if params[:thread_ts], do: Map.put(body, :thread_ts, params.thread_ts), else: body

    case Req.post("#{@base_url}/chat.postMessage", json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: %{"ok" => true} = resp}} -> {:ok, resp}
      {:ok, %{status: 200, body: %{"ok" => false, "error" => error}}} -> {:error, error}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:search, %{query: query} = params, credential) do
    query_params = %{query: query, count: params[:count] || 10}

    case Req.get("#{@base_url}/search.messages", params: query_params, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: %{"ok" => true} = resp}} -> {:ok, resp}
      {:ok, %{status: 200, body: %{"ok" => false, "error" => error}}} -> {:error, error}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:list_channels, params, credential) do
    query = %{limit: params[:limit] || 100, types: "public_channel,private_channel"}

    case Req.get("#{@base_url}/conversations.list", params: query, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: %{"ok" => true} = resp}} -> {:ok, resp}
      {:ok, %{status: 200, body: %{"ok" => false, "error" => error}}} -> {:error, error}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:react, %{channel: channel, timestamp: timestamp, name: name}, credential) do
    body = %{channel: channel, timestamp: timestamp, name: name}

    case Req.post("#{@base_url}/reactions.add", json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: %{"ok" => true} = resp}} -> {:ok, resp}
      {:ok, %{status: 200, body: %{"ok" => false, "error" => error}}} -> {:error, error}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(action, _params, _credential) do
    {:error, {:unsupported_action, action}}
  end

  defp auth_headers(credential) do
    [{"authorization", "Bearer #{credential.access_token}"}]
  end
end
