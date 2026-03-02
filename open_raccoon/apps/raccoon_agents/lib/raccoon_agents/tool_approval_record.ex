defmodule RaccoonAgents.ToolApprovalRecord do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "tool_approvals" do
    belongs_to :user, RaccoonAccounts.User
    belongs_to :agent, RaccoonAgents.Agent
    belongs_to :conversation, RaccoonChat.Conversation

    field :tool_name, :string
    field :scope, :string
    field :decision, :string
    field :arguments_hash, :string
    field :decided_at, :utc_datetime_usec

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(record, attrs) do
    record
    |> cast(attrs, [
      :user_id,
      :agent_id,
      :conversation_id,
      :tool_name,
      :scope,
      :decision,
      :arguments_hash,
      :decided_at
    ])
    |> validate_required([:user_id, :agent_id, :tool_name, :scope, :decision])
    |> validate_inclusion(:scope, ["allow_once", "allow_for_session", "always_for_agent_tool"])
    |> validate_inclusion(:decision, ["approved", "denied", "revoked", "pending"])
    |> foreign_key_constraint(:user_id)
    |> foreign_key_constraint(:agent_id)
    |> foreign_key_constraint(:conversation_id)
  end
end
