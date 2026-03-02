defmodule RaccoonIntegrations.CredentialTest do
  use ExUnit.Case, async: true

  alias RaccoonIntegrations.Credential

  describe "changeset/2" do
    test "valid changeset with required fields" do
      attrs = %{
        user_id: Ecto.UUID.generate(),
        service: "github",
        auth_method: "oauth2",
        encrypted_tokens: <<1, 2, 3, 4>>
      }

      changeset = Credential.changeset(%Credential{}, attrs)
      assert changeset.valid?
    end

    test "invalid without required fields" do
      changeset = Credential.changeset(%Credential{}, %{})
      refute changeset.valid?
      assert "can't be blank" in errors_on(changeset, :user_id)
      assert "can't be blank" in errors_on(changeset, :service)
      assert "can't be blank" in errors_on(changeset, :auth_method)
      assert "can't be blank" in errors_on(changeset, :encrypted_tokens)
    end

    test "invalid auth_method is rejected" do
      attrs = %{
        user_id: Ecto.UUID.generate(),
        service: "github",
        auth_method: "invalid",
        encrypted_tokens: <<1, 2, 3, 4>>
      }

      changeset = Credential.changeset(%Credential{}, attrs)
      refute changeset.valid?
      assert "is invalid" in errors_on(changeset, :auth_method)
    end

    test "accepts all valid auth methods" do
      for method <- ["oauth2", "oauth2_pkce", "bot_token", "api_key"] do
        attrs = %{
          user_id: Ecto.UUID.generate(),
          service: "test",
          auth_method: method,
          encrypted_tokens: <<1, 2, 3, 4>>
        }

        changeset = Credential.changeset(%Credential{}, attrs)
        assert changeset.valid?, "Expected valid changeset for auth_method: #{method}"
      end
    end

    test "optional fields have defaults" do
      attrs = %{
        user_id: Ecto.UUID.generate(),
        service: "github",
        auth_method: "oauth2",
        encrypted_tokens: <<1, 2, 3, 4>>
      }

      changeset = Credential.changeset(%Credential{}, attrs)
      assert changeset.valid?
      # Default values from schema
      assert Ecto.Changeset.get_field(changeset, :scopes) == []
      assert Ecto.Changeset.get_field(changeset, :status) == :active
      assert Ecto.Changeset.get_field(changeset, :metadata) == %{}
    end
  end

  describe "ChannelRoute changeset" do
    alias RaccoonIntegrations.ChannelRoute

    test "valid changeset with required fields" do
      attrs = %{
        user_id: Ecto.UUID.generate(),
        service: "telegram",
        external_chat_id: "12345"
      }

      changeset = ChannelRoute.changeset(%ChannelRoute{}, attrs)
      assert changeset.valid?
    end

    test "invalid without service" do
      attrs = %{
        user_id: Ecto.UUID.generate(),
        external_chat_id: "12345"
      }

      changeset = ChannelRoute.changeset(%ChannelRoute{}, attrs)
      refute changeset.valid?
    end

    test "validates direction values" do
      for direction <- ["inbound", "outbound", "both"] do
        attrs = %{
          user_id: Ecto.UUID.generate(),
          service: "slack",
          external_chat_id: "C123",
          direction: direction
        }

        changeset = ChannelRoute.changeset(%ChannelRoute{}, attrs)
        assert changeset.valid?, "Expected valid for direction: #{direction}"
      end

      attrs = %{
        user_id: Ecto.UUID.generate(),
        service: "slack",
        external_chat_id: "C123",
        direction: "invalid"
      }

      changeset = ChannelRoute.changeset(%ChannelRoute{}, attrs)
      refute changeset.valid?
    end

    test "default direction is both" do
      attrs = %{
        user_id: Ecto.UUID.generate(),
        service: "telegram",
        external_chat_id: "12345"
      }

      changeset = ChannelRoute.changeset(%ChannelRoute{}, attrs)
      assert Ecto.Changeset.get_field(changeset, :direction) == "both"
    end
  end

  describe "IntegrationWebhook changeset" do
    alias RaccoonIntegrations.IntegrationWebhook

    test "valid changeset" do
      attrs = %{
        user_id: Ecto.UUID.generate(),
        service: "github",
        webhook_id: "wh_abc123",
        secret: <<1, 2, 3, 4>>
      }

      changeset = IntegrationWebhook.changeset(%IntegrationWebhook{}, attrs)
      assert changeset.valid?
    end

    test "invalid without webhook_id" do
      attrs = %{
        user_id: Ecto.UUID.generate(),
        service: "github",
        secret: <<1, 2, 3, 4>>
      }

      changeset = IntegrationWebhook.changeset(%IntegrationWebhook{}, attrs)
      refute changeset.valid?
    end
  end

  # Helper to extract error messages from changeset
  defp errors_on(changeset, field) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
    |> Map.get(field, [])
  end
end
