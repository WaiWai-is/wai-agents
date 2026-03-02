defmodule RaccoonAgents.AgentEvent do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "agent_events" do
    belongs_to :agent, RaccoonAgents.Agent
    belongs_to :user, RaccoonAccounts.User
    belongs_to :conversation, RaccoonChat.Conversation

    field :event_type, :string
    field :trigger_type, :string
    field :duration_ms, :integer
    field :input_tokens, :integer
    field :output_tokens, :integer
    field :model, :string
    field :status, :string
    field :error_code, :string
    field :error_message, :string
    field :metadata, :map, default: %{}

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(event, attrs) do
    event
    |> cast(attrs, [
      :agent_id,
      :user_id,
      :conversation_id,
      :event_type,
      :trigger_type,
      :duration_ms,
      :input_tokens,
      :output_tokens,
      :model,
      :status,
      :error_code,
      :error_message,
      :metadata
    ])
    |> validate_required([:agent_id, :user_id, :event_type, :status])
    |> validate_inclusion(:status, ["running", "completed", "failed", "timeout"])
    |> foreign_key_constraint(:agent_id)
    |> foreign_key_constraint(:user_id)
    |> foreign_key_constraint(:conversation_id)
  end
end
