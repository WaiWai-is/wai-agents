defmodule RaccoonIntegrations.IntegrationTest do
  use ExUnit.Case, async: true

  alias RaccoonIntegrations.IntegrationRegistry

  describe "IntegrationRegistry" do
    test "list_integrations returns all 10 integrations" do
      integrations = IntegrationRegistry.list_integrations()
      assert map_size(integrations) == 10
    end

    test "get_integration returns module for known service" do
      assert {:ok, RaccoonIntegrations.Integrations.GitHub} = IntegrationRegistry.get_integration("github")
      assert {:ok, RaccoonIntegrations.Integrations.Gmail} = IntegrationRegistry.get_integration("gmail")
      assert {:ok, RaccoonIntegrations.Integrations.Slack} = IntegrationRegistry.get_integration("slack")
    end

    test "get_integration returns error for unknown service" do
      assert {:error, :unknown_service} = IntegrationRegistry.get_integration("unknown_service")
    end

    test "service_names returns all service name strings" do
      names = IntegrationRegistry.service_names()
      assert "github" in names
      assert "gmail" in names
      assert "slack" in names
      assert "discord" in names
      assert "notion" in names
      assert "twitter" in names
      assert "telegram" in names
      assert "whatsapp" in names
      assert "google_calendar" in names
      assert "google_drive" in names
    end
  end

  describe "Integration behaviour compliance" do
    @integrations [
      RaccoonIntegrations.Integrations.Telegram,
      RaccoonIntegrations.Integrations.WhatsApp,
      RaccoonIntegrations.Integrations.Gmail,
      RaccoonIntegrations.Integrations.GoogleCalendar,
      RaccoonIntegrations.Integrations.GoogleDrive,
      RaccoonIntegrations.Integrations.GitHub,
      RaccoonIntegrations.Integrations.Slack,
      RaccoonIntegrations.Integrations.Discord,
      RaccoonIntegrations.Integrations.Notion,
      RaccoonIntegrations.Integrations.Twitter
    ]

    for module <- @integrations do
      @module module

      test "#{inspect(@module)} implements service_name/0" do
        name = @module.service_name()
        assert is_binary(name)
        assert String.length(name) > 0
      end

      test "#{inspect(@module)} implements auth_method/0" do
        method = @module.auth_method()
        assert method in [:oauth2, :oauth2_pkce, :bot_token, :api_key]
      end

      test "#{inspect(@module)} implements oauth_config/0" do
        config = @module.oauth_config()
        assert is_map(config)
      end

      test "#{inspect(@module)} implements capabilities/0" do
        caps = @module.capabilities()
        assert is_list(caps)
        assert length(caps) > 0
        Enum.each(caps, fn cap -> assert cap in [:read, :write, :webhook, :realtime] end)
      end

      test "#{inspect(@module)} implements rate_limits/0" do
        limits = @module.rate_limits()
        assert is_map(limits)
        assert map_size(limits) > 0
      end

      test "#{inspect(@module)} returns error for unsupported action" do
        assert {:error, {:unsupported_action, :nonexistent_action}} =
                 @module.execute_action(:nonexistent_action, %{}, %{})
      end
    end
  end

  describe "OAuth integrations have proper config" do
    @oauth_integrations [
      RaccoonIntegrations.Integrations.Gmail,
      RaccoonIntegrations.Integrations.GoogleCalendar,
      RaccoonIntegrations.Integrations.GoogleDrive,
      RaccoonIntegrations.Integrations.GitHub,
      RaccoonIntegrations.Integrations.Slack,
      RaccoonIntegrations.Integrations.Notion,
      RaccoonIntegrations.Integrations.Twitter
    ]

    for module <- @oauth_integrations do
      @module module

      test "#{inspect(@module)} has auth_url and token_url in oauth_config" do
        config = @module.oauth_config()
        assert Map.has_key?(config, :auth_url)
        assert Map.has_key?(config, :token_url)
        assert is_binary(config[:auth_url])
        assert is_binary(config[:token_url])
      end

      test "#{inspect(@module)} has scopes in oauth_config" do
        config = @module.oauth_config()
        assert Map.has_key?(config, :scopes)
        assert is_list(config[:scopes])
      end
    end
  end
end
