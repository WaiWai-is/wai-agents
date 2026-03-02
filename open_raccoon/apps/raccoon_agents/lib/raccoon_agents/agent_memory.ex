defmodule RaccoonAgents.AgentMemory do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "agent_memories" do
    belongs_to :agent, RaccoonAgents.Agent
    belongs_to :user, RaccoonAccounts.User

    field :content, :string
    field :embedding, Pgvector.Ecto.Vector
    field :importance, :float, default: 0.5
    field :memory_type, :string, default: "observation"
    field :tags, {:array, :string}, default: []
    field :access_count, :integer, default: 0
    field :last_accessed_at, :utc_datetime_usec
    field :decay_factor, :float, default: 1.0
    field :metadata, :map, default: %{}

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(memory, attrs) do
    memory
    |> cast(attrs, [
      :agent_id,
      :user_id,
      :content,
      :embedding,
      :importance,
      :memory_type,
      :tags,
      :metadata
    ])
    |> validate_required([:agent_id, :user_id, :content, :embedding])
    |> validate_number(:importance, greater_than_or_equal_to: 0.0, less_than_or_equal_to: 1.0)
    |> validate_inclusion(:memory_type, ["observation", "reflection", "fact", "preference"])
    |> foreign_key_constraint(:agent_id)
    |> foreign_key_constraint(:user_id)
  end
end
