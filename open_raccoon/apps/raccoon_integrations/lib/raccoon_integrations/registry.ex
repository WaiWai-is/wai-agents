defmodule RaccoonIntegrations.IntegrationRegistry do
  @moduledoc """
  Registry of all available integration modules.

  Provides lookup by service name and listing of all integrations.
  Integration modules register themselves using `use RaccoonIntegrations.IntegrationRegistry`.
  """

  @integrations %{
    "telegram" => RaccoonIntegrations.Integrations.Telegram,
    "whatsapp" => RaccoonIntegrations.Integrations.WhatsApp,
    "gmail" => RaccoonIntegrations.Integrations.Gmail,
    "google_calendar" => RaccoonIntegrations.Integrations.GoogleCalendar,
    "google_drive" => RaccoonIntegrations.Integrations.GoogleDrive,
    "github" => RaccoonIntegrations.Integrations.GitHub,
    "slack" => RaccoonIntegrations.Integrations.Slack,
    "discord" => RaccoonIntegrations.Integrations.Discord,
    "notion" => RaccoonIntegrations.Integrations.Notion,
    "twitter" => RaccoonIntegrations.Integrations.Twitter
  }

  @doc "List all registered integration modules."
  def list_integrations do
    @integrations
  end

  @doc "Get the integration module for a service name."
  def get_integration(service) when is_binary(service) do
    case Map.get(@integrations, service) do
      nil -> {:error, :unknown_service}
      module -> {:ok, module}
    end
  end

  @doc "Get all service names."
  def service_names do
    Map.keys(@integrations)
  end
end
