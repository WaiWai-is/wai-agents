defmodule RaccoonIntegrations.Workers.ChannelOutboundWorker do
  @moduledoc """
  Oban worker for sending outbound messages through integration channels.

  Loads the credential, checks rate limits, and calls the integration's
  execute_action(:send_message, ...) to send the message.
  """

  use Oban.Worker, queue: :integrations, max_attempts: 3

  alias RaccoonIntegrations.{IntegrationRegistry, RateLimiter, Credential}

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    %{
      "service" => service,
      "external_chat_id" => chat_id,
      "content" => content,
      "user_id" => user_id
    } = args

    with {:ok, module} <- IntegrationRegistry.get_integration(service),
         credential when not is_nil(credential) <- RaccoonIntegrations.get_credential(user_id, service),
         {:ok, tokens} <- Credential.decrypt_tokens(credential),
         :ok <- check_rate_limit(user_id, service, module) do
      params = build_send_params(service, chat_id, content)
      result = module.execute_action(:send_message, params, tokens)
      RateLimiter.record_call(user_id, service)

      case result do
        {:ok, _} ->
          :ok

        {:error, reason} ->
          Logger.error("Outbound #{service} message failed: #{inspect(reason)}")
          {:error, reason}
      end
    else
      nil -> {:error, :no_credential}
      {:error, reason} -> {:error, reason}
    end
  end

  defp check_rate_limit(user_id, service, module) do
    limits = module.rate_limits()
    max_rpm = limits[:requests_per_minute] || limits[:requests_per_second] && limits[:requests_per_second] * 60 || 60
    RateLimiter.check_rate(user_id, service, max_rpm)
  end

  defp build_send_params("telegram", chat_id, content) do
    %{chat_id: chat_id, text: content}
  end

  defp build_send_params("whatsapp", phone_number, content) do
    %{phone_number_id: "default", to: phone_number, text: content}
  end

  defp build_send_params("slack", channel, content) do
    %{channel: channel, text: content}
  end

  defp build_send_params("discord", channel_id, content) do
    %{channel_id: channel_id, content: content}
  end

  defp build_send_params(_service, chat_id, content) do
    %{chat_id: chat_id, text: content}
  end
end
