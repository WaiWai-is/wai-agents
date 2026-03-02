defmodule RaccoonIntegrations.Integrations.Discord do
  @moduledoc """
  Discord integration via Bot Token + OAuth 2.0.

  Supports sending messages, listing channels, creating threads, and reacting.
  """

  @behaviour RaccoonIntegrations.Integration

  @base_url "https://discord.com/api/v10"

  @impl true
  def service_name, do: "discord"

  @impl true
  def auth_method, do: :bot_token

  @impl true
  def oauth_config do
    %{
      client_id: Application.get_env(:raccoon_integrations, :discord_client_id),
      client_secret: Application.get_env(:raccoon_integrations, :discord_client_secret),
      auth_url: "https://discord.com/api/oauth2/authorize",
      token_url: "https://discord.com/api/oauth2/token",
      scopes: ["bot", "applications.commands"],
      pkce: false
    }
  end

  @impl true
  def capabilities, do: [:read, :write, :webhook, :realtime]

  @impl true
  def rate_limits do
    %{
      requests_per_second: 50
    }
  end

  @impl true
  def normalize_webhook(%{"type" => 1} = _payload) do
    # Ping verification - handled separately
    {:ok, :ignored}
  end

  def normalize_webhook(%{"type" => _type, "d" => data} = payload) do
    author = data["author"] || %{}

    {:ok,
     %RaccoonIntegrations.IntegrationEvent{
       service: "discord",
       event_type: data["t"] || "MESSAGE_CREATE",
       external_id: data["id"],
       actor: %{
         id: author["id"] || "",
         name: author["username"] || "unknown",
         avatar_url: if(author["avatar"], do: "https://cdn.discordapp.com/avatars/#{author["id"]}/#{author["avatar"]}.png")
       },
       payload: %{
         channel_id: data["channel_id"],
         guild_id: data["guild_id"],
         content: data["content"]
       },
       raw_payload: payload,
       timestamp: DateTime.utc_now()
     }}
  end

  def normalize_webhook(_payload), do: {:ok, :ignored}

  @impl true
  def verify_webhook(headers, body) do
    signature = headers["x-signature-ed25519"]
    timestamp = headers["x-signature-timestamp"]

    case Application.get_env(:raccoon_integrations, :discord_public_key) do
      nil ->
        {:error, :no_public_key_configured}

      public_key_hex ->
        public_key = Base.decode16!(public_key_hex, case: :lower)
        message = (timestamp || "") <> body

        case Base.decode16(signature || "", case: :lower) do
          {:ok, sig_bytes} ->
            if :crypto.verify(:eddsa, :none, message, sig_bytes, [public_key, :ed25519]) do
              :ok
            else
              {:error, :invalid_signature}
            end

          :error ->
            {:error, :invalid_signature}
        end
    end
  end

  @impl true
  def execute_action(:send_message, %{channel_id: channel_id, content: content}, credential) do
    url = "#{@base_url}/channels/#{channel_id}/messages"

    case Req.post(url, json: %{content: content}, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:list_channels, %{guild_id: guild_id}, credential) do
    url = "#{@base_url}/guilds/#{guild_id}/channels"

    case Req.get(url, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:create_thread, %{channel_id: channel_id, name: name} = params, credential) do
    url = "#{@base_url}/channels/#{channel_id}/threads"

    body = %{name: name, type: 11}
    body = if params[:message], do: Map.put(body, :message, %{content: params.message}), else: body

    case Req.post(url, json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 201, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:react, %{channel_id: channel_id, message_id: message_id, emoji: emoji}, credential) do
    url = "#{@base_url}/channels/#{channel_id}/messages/#{message_id}/reactions/#{URI.encode(emoji)}/@me"

    case Req.put(url, headers: auth_headers(credential)) do
      {:ok, %{status: 204}} -> {:ok, %{reacted: true}}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(action, _params, _credential) do
    {:error, {:unsupported_action, action}}
  end

  defp auth_headers(credential) do
    [{"authorization", "Bot #{credential.token}"}]
  end
end
