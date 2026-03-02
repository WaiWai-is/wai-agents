defmodule RaccoonIntegrations.WebhookHandler do
  @moduledoc """
  Handles inbound webhooks from third-party integrations.

  Verifies signatures, normalizes events, and dispatches
  to the channel router.
  """

  alias RaccoonShared.Repo
  alias RaccoonIntegrations.{IntegrationWebhook, IntegrationRegistry, ChannelRouter}
  import Ecto.Query

  require Logger

  @doc """
  Verify and process a generic inbound webhook.

  1. Look up the webhook registration
  2. Verify the signature
  3. Normalize the event
  4. Route to the channel router
  """
  def verify_and_process(service, webhook_id, headers, body) do
    with {:ok, webhook} <- get_webhook(webhook_id),
         :ok <- check_enabled(webhook),
         {:ok, module} <- IntegrationRegistry.get_integration(service),
         :ok <- verify_signature(module, headers, body),
         {:ok, event} <- normalize_event(module, body) do
      route_event(webhook, event)
    end
  end

  @doc """
  Get a webhook registration by its external webhook_id.
  """
  def get_webhook(webhook_id) do
    case Repo.get_by(IntegrationWebhook, webhook_id: webhook_id) do
      nil -> {:error, :webhook_not_found}
      webhook -> {:ok, webhook}
    end
  end

  @doc """
  Create a new webhook registration.
  """
  def create_webhook(attrs) do
    secret = :crypto.strong_rand_bytes(32)
    {:ok, encrypted_secret} = RaccoonBridges.CredentialEncryption.encrypt(secret)

    attrs =
      attrs
      |> Map.put(:webhook_id, generate_webhook_id())
      |> Map.put(:secret, encrypted_secret)

    %IntegrationWebhook{}
    |> IntegrationWebhook.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  List webhooks for a user and service.
  """
  def list_webhooks(user_id, service) do
    from(w in IntegrationWebhook,
      where: w.user_id == ^user_id and w.service == ^service,
      order_by: [desc: w.inserted_at]
    )
    |> Repo.all()
  end

  # --- Private ---

  defp check_enabled(%IntegrationWebhook{enabled: true}), do: :ok
  defp check_enabled(%IntegrationWebhook{enabled: false}), do: {:error, :webhook_disabled}

  defp verify_signature(module, headers, body) do
    if function_exported?(module, :verify_webhook, 2) do
      module.verify_webhook(headers, body)
    else
      :ok
    end
  end

  defp normalize_event(module, body) do
    parsed = if is_binary(body), do: Jason.decode!(body), else: body

    if function_exported?(module, :normalize_webhook, 1) do
      module.normalize_webhook(parsed)
    else
      {:ok, :ignored}
    end
  end

  defp route_event(_webhook, :ignored), do: {:ok, :ignored}

  defp route_event(_webhook, event) do
    ChannelRouter.route_inbound(event)
  end

  defp generate_webhook_id do
    :crypto.strong_rand_bytes(16) |> Base.url_encode64(padding: false)
  end
end
