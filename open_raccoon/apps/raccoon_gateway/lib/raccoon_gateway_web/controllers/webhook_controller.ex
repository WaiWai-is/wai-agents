defmodule RaccoonGatewayWeb.WebhookController do
  use RaccoonGatewayWeb, :controller
  action_fallback RaccoonGatewayWeb.FallbackController

  @doc """
  Handle incoming Telegram Bot API webhook updates.
  Signature verification should be done at the platform level.
  Always returns 200 to avoid retries from the platform.
  """
  def telegram(conn, params) do
    RaccoonBridges.handle_telegram_webhook(params)
    send_resp(conn, 200, "ok")
  end

  @doc """
  Handle incoming WhatsApp Cloud API webhook messages.
  Always returns 200 to avoid retries from the platform.
  """
  def whatsapp(conn, params) do
    RaccoonBridges.handle_whatsapp_webhook(params)
    send_resp(conn, 200, "ok")
  end

  @doc """
  WhatsApp webhook verification (GET challenge/response).
  Required for initial webhook registration with the WhatsApp Cloud API.
  """
  def whatsapp_verify(conn, params) do
    verify_token = Application.get_env(:raccoon_bridges, :whatsapp_verify_token, "")
    mode = params["hub.mode"]
    token = params["hub.verify_token"]
    challenge = params["hub.challenge"]

    if mode == "subscribe" && token == verify_token do
      conn
      |> put_resp_content_type("text/plain")
      |> send_resp(200, challenge || "")
    else
      send_resp(conn, 403, "Forbidden")
    end
  end

  @doc """
  Generic webhook endpoint for all integrations.
  Verifies signature, normalizes event, and routes to channel router.
  Always returns 200 to avoid retries from the platform.
  """
  def generic(conn, %{"service" => service, "webhook_id" => webhook_id}) do
    headers =
      conn.req_headers
      |> Enum.into(%{})

    body =
      case conn.assigns[:raw_body] do
        nil -> Jason.encode!(conn.params)
        raw -> raw
      end

    case RaccoonIntegrations.WebhookHandler.verify_and_process(service, webhook_id, headers, body) do
      {:ok, _} -> send_resp(conn, 200, "ok")
      {:error, :invalid_signature} -> send_resp(conn, 401, "Unauthorized")
      {:error, :webhook_not_found} -> send_resp(conn, 404, "Not Found")
      {:error, :webhook_disabled} -> send_resp(conn, 200, "ok")
      {:error, _} -> send_resp(conn, 200, "ok")
    end
  end
end
