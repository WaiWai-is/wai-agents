defmodule RaccoonIntegrations.Integrations.WhatsApp do
  @moduledoc """
  WhatsApp Cloud API integration (upgraded from bridges).

  Uses Cloud API access token authentication.
  """

  @behaviour RaccoonIntegrations.Integration

  @base_url "https://graph.facebook.com/v19.0"

  @impl true
  def service_name, do: "whatsapp"

  @impl true
  def auth_method, do: :api_key

  @impl true
  def oauth_config, do: %{}

  @impl true
  def capabilities, do: [:read, :write, :webhook]

  @impl true
  def rate_limits do
    %{
      messages_per_second: 80,
      messages_per_day_user_initiated: 250
    }
  end

  @impl true
  def normalize_webhook(%{"entry" => [entry | _]}) do
    case get_in(entry, ["changes", Access.at(0), "value", "messages", Access.at(0)]) do
      nil ->
        {:ok, :ignored}

      message ->
        contact = get_in(entry, ["changes", Access.at(0), "value", "contacts", Access.at(0)])

        {:ok,
         %RaccoonIntegrations.IntegrationEvent{
           service: "whatsapp",
           event_type: "message",
           external_id: message["id"],
           actor: %{
             id: message["from"],
             name: (contact && contact["profile"]["name"]) || message["from"],
             avatar_url: nil
           },
           payload: %{
             phone_number_id: get_in(entry, ["changes", Access.at(0), "value", "metadata", "phone_number_id"]),
             text: get_in(message, ["text", "body"]),
             type: message["type"]
           },
           raw_payload: %{"entry" => [entry]},
           timestamp: DateTime.utc_now()
         }}
    end
  end

  def normalize_webhook(_payload), do: {:ok, :ignored}

  @impl true
  def verify_webhook(_headers, _body), do: :ok

  @impl true
  def execute_action(:send_message, %{phone_number_id: phone_id, to: to, text: text}, credential) do
    url = "#{@base_url}/#{phone_id}/messages"

    body = %{
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: %{body: text}
    }

    case Req.post(url, json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(:send_template, %{phone_number_id: phone_id, to: to, template: template}, credential) do
    url = "#{@base_url}/#{phone_id}/messages"

    body = %{
      messaging_product: "whatsapp",
      to: to,
      type: "template",
      template: template
    }

    case Req.post(url, json: body, headers: auth_headers(credential)) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status, body: body}} -> {:error, {status, body}}
    end
  end

  def execute_action(action, _params, _credential) do
    {:error, {:unsupported_action, action}}
  end

  defp auth_headers(credential) do
    [{"authorization", "Bearer #{credential.token}"}]
  end
end
