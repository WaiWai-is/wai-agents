defmodule RaccoonIntegrations.IntegrationWebhook do
  @moduledoc """
  Ecto schema for integration_webhooks table.

  Stores inbound webhook configuration including signing secrets
  and event type filters.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "integration_webhooks" do
    belongs_to(:user, RaccoonAccounts.User)

    field(:service, :string)
    field(:webhook_id, :string)
    field(:secret, :binary)
    field(:event_types, {:array, :string}, default: [])
    field(:enabled, :boolean, default: true)
    field(:metadata, :map, default: %{})

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(webhook, attrs) do
    webhook
    |> cast(attrs, [:user_id, :service, :webhook_id, :secret, :event_types, :enabled, :metadata])
    |> validate_required([:user_id, :service, :webhook_id, :secret])
    |> unique_constraint(:webhook_id)
    |> foreign_key_constraint(:user_id)
  end
end
