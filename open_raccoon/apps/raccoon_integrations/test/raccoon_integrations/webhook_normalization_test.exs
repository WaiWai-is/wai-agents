defmodule RaccoonIntegrations.WebhookNormalizationTest do
  use ExUnit.Case, async: true

  alias RaccoonIntegrations.IntegrationEvent

  describe "Telegram normalize_webhook/1" do
    alias RaccoonIntegrations.Integrations.Telegram

    test "normalizes a text message" do
      payload = %{
        "message" => %{
          "message_id" => 123,
          "from" => %{"id" => 456, "first_name" => "John"},
          "chat" => %{"id" => 789, "type" => "private"},
          "text" => "Hello!"
        }
      }

      assert {:ok, %IntegrationEvent{} = event} = Telegram.normalize_webhook(payload)
      assert event.service == "telegram"
      assert event.event_type == "message"
      assert event.external_id == "123"
      assert event.actor.id == "456"
      assert event.actor.name == "John"
      assert event.payload.chat_id == "789"
      assert event.payload.text == "Hello!"
    end

    test "ignores non-message updates" do
      assert {:ok, :ignored} = Telegram.normalize_webhook(%{"update_id" => 1})
    end
  end

  describe "GitHub normalize_webhook/1" do
    alias RaccoonIntegrations.Integrations.GitHub

    test "normalizes a push event" do
      payload = %{
        "action" => "push",
        "id" => "evt_1",
        "commits" => [%{"id" => "abc123"}],
        "sender" => %{"id" => 1, "login" => "octocat", "avatar_url" => "https://example.com/avatar"},
        "repository" => %{"full_name" => "octocat/Hello-World"},
        "ref" => "refs/heads/main"
      }

      assert {:ok, %IntegrationEvent{} = event} = GitHub.normalize_webhook(payload)
      assert event.service == "github"
      assert event.event_type == "push"
      assert event.actor.name == "octocat"
    end

    test "normalizes a pull_request event" do
      payload = %{
        "action" => "opened",
        "id" => "evt_2",
        "pull_request" => %{"number" => 42, "title" => "Fix bug"},
        "sender" => %{"id" => 2, "login" => "dev"}
      }

      assert {:ok, %IntegrationEvent{} = event} = GitHub.normalize_webhook(payload)
      assert event.event_type == "pull_request.opened"
    end

    test "normalizes an issue event" do
      payload = %{
        "action" => "created",
        "id" => "evt_3",
        "issue" => %{"number" => 10, "title" => "Bug report"},
        "sender" => %{"id" => 3, "login" => "reporter"}
      }

      assert {:ok, %IntegrationEvent{} = event} = GitHub.normalize_webhook(payload)
      assert event.event_type == "issue.created"
    end

    test "ignores payloads without action" do
      assert {:ok, :ignored} = GitHub.normalize_webhook(%{})
    end
  end

  describe "Slack normalize_webhook/1" do
    alias RaccoonIntegrations.Integrations.Slack

    test "normalizes a message event" do
      payload = %{
        "event" => %{
          "type" => "message",
          "user" => "U123",
          "channel" => "C456",
          "text" => "Hello Slack!",
          "ts" => "1234567890.123456"
        }
      }

      assert {:ok, %IntegrationEvent{} = event} = Slack.normalize_webhook(payload)
      assert event.service == "slack"
      assert event.event_type == "message"
      assert event.payload.channel == "C456"
      assert event.payload.text == "Hello Slack!"
    end

    test "ignores payloads without event key" do
      assert {:ok, :ignored} = Slack.normalize_webhook(%{"challenge" => "test"})
    end
  end

  describe "WhatsApp normalize_webhook/1" do
    alias RaccoonIntegrations.Integrations.WhatsApp

    test "normalizes a text message" do
      payload = %{
        "entry" => [
          %{
            "changes" => [
              %{
                "value" => %{
                  "messages" => [
                    %{
                      "id" => "wamid.123",
                      "from" => "1234567890",
                      "type" => "text",
                      "text" => %{"body" => "Hi from WhatsApp"}
                    }
                  ],
                  "contacts" => [
                    %{"profile" => %{"name" => "John Doe"}}
                  ],
                  "metadata" => %{
                    "phone_number_id" => "phone_123"
                  }
                }
              }
            ]
          }
        ]
      }

      assert {:ok, %IntegrationEvent{} = event} = WhatsApp.normalize_webhook(payload)
      assert event.service == "whatsapp"
      assert event.event_type == "message"
      assert event.actor.name == "John Doe"
    end

    test "ignores status updates without messages" do
      payload = %{
        "entry" => [
          %{
            "changes" => [
              %{"value" => %{"statuses" => [%{"id" => "123", "status" => "delivered"}]}}
            ]
          }
        ]
      }

      assert {:ok, :ignored} = WhatsApp.normalize_webhook(payload)
    end
  end

  describe "Discord normalize_webhook/1" do
    alias RaccoonIntegrations.Integrations.Discord

    test "ignores ping verification" do
      assert {:ok, :ignored} = Discord.normalize_webhook(%{"type" => 1})
    end

    test "normalizes a message event" do
      payload = %{
        "type" => 0,
        "d" => %{
          "id" => "msg_123",
          "t" => "MESSAGE_CREATE",
          "channel_id" => "ch_456",
          "guild_id" => "guild_789",
          "content" => "Hello Discord!",
          "author" => %{
            "id" => "user_1",
            "username" => "testuser",
            "avatar" => "abc123"
          }
        }
      }

      assert {:ok, %IntegrationEvent{} = event} = Discord.normalize_webhook(payload)
      assert event.service == "discord"
      assert event.actor.name == "testuser"
      assert event.payload.channel_id == "ch_456"
    end
  end
end
