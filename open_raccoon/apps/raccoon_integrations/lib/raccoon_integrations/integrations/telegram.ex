defmodule RaccoonIntegrations.Integrations.Telegram do
  @moduledoc """
  Telegram integration (upgraded from bridges).

  Uses Bot Token authentication. Supports sending messages,
  photos, and receiving webhook updates.
  """

  @behaviour RaccoonIntegrations.Integration

  @impl true
  def service_name, do: "telegram"

  @impl true
  def auth_method, do: :bot_token

  @impl true
  def oauth_config, do: %{}

  @impl true
  def capabilities, do: [:read, :write, :webhook, :realtime]

  @impl true
  def rate_limits do
    %{
      requests_per_second: 30,
      messages_per_second_per_chat: 1
    }
  end

  @impl true
  def normalize_webhook(%{"message" => message}) do
    {:ok,
     %RaccoonIntegrations.IntegrationEvent{
       service: "telegram",
       event_type: "message",
       external_id: to_string(message["message_id"]),
       actor: %{
         id: to_string(get_in(message, ["from", "id"])),
         name: get_in(message, ["from", "first_name"]) || "Unknown",
         avatar_url: nil
       },
       payload: %{
         chat_id: to_string(get_in(message, ["chat", "id"])),
         text: message["text"],
         chat_type: get_in(message, ["chat", "type"])
       },
       raw_payload: %{"message" => message},
       timestamp: DateTime.utc_now()
     }}
  end

  def normalize_webhook(_payload), do: {:ok, :ignored}

  @impl true
  def verify_webhook(_headers, _body), do: :ok

  @impl true
  def execute_action(:send_message, %{chat_id: chat_id, text: text}, credential) do
    url = "https://api.telegram.org/bot#{credential.token}/sendMessage"

    case Req.post(url, json: %{chat_id: chat_id, text: text, parse_mode: "Markdown"}) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:send_photo, %{chat_id: chat_id, photo: photo_url} = params, credential) do
    url = "https://api.telegram.org/bot#{credential.token}/sendPhoto"

    body = %{chat_id: chat_id, photo: photo_url}
    body = if params[:caption], do: Map.put(body, :caption, params.caption), else: body

    case Req.post(url, json: body) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:get_updates, params, credential) do
    url = "https://api.telegram.org/bot#{credential.token}/getUpdates"
    query = Map.take(params, [:offset, :limit, :timeout])

    case Req.get(url, params: query) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(action, _params, _credential) do
    {:error, {:unsupported_action, action}}
  end
end
