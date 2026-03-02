defmodule RaccoonIntegrations.ChannelRoute do
  @moduledoc """
  Ecto schema for channel_routes table.

  Maps external platform channels to agents or conversations,
  enabling multi-channel access for a single agent.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "channel_routes" do
    belongs_to(:user, RaccoonAccounts.User)

    field(:agent_id, :binary_id)
    field(:conversation_id, :binary_id)
    field(:service, :string)
    field(:external_chat_id, :string)
    field(:direction, :string, default: "both")
    field(:enabled, :boolean, default: true)
    field(:metadata, :map, default: %{})

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(route, attrs) do
    route
    |> cast(attrs, [
      :user_id,
      :agent_id,
      :conversation_id,
      :service,
      :external_chat_id,
      :direction,
      :enabled,
      :metadata
    ])
    |> validate_required([:user_id, :service, :external_chat_id])
    |> validate_inclusion(:direction, ["inbound", "outbound", "both"])
    |> unique_constraint([:service, :external_chat_id])
    |> foreign_key_constraint(:user_id)
  end
end
