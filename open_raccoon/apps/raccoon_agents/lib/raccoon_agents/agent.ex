defmodule RaccoonAgents.Agent do
  @moduledoc """
  AI Agent configuration schema.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "agents" do
    belongs_to(:creator, RaccoonAccounts.User)

    field(:name, :string)
    field(:slug, :string)
    field(:description, :string)
    field(:avatar_url, :string)
    field(:system_prompt, :string)
    field(:model, :string, default: "claude-sonnet-4-6")
    field(:temperature, :float, default: 0.7)
    field(:max_tokens, :integer, default: 4096)
    field(:tools, {:array, :map}, default: [])
    field(:mcp_servers, {:array, :map}, default: [])
    field(:visibility, Ecto.Enum, values: [:public, :unlisted, :private], default: :private)
    field(:category, :string)
    field(:usage_count, :integer, default: 0)
    field(:rating_sum, :integer, default: 0)
    field(:rating_count, :integer, default: 0)
    field(:execution_mode, Ecto.Enum,
      values: [:raw, :claude_sdk, :openai_sdk],
      default: :raw
    )

    field(:metadata, :map, default: %{})

    has_many(:ratings, RaccoonAgents.AgentRating)

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(agent, attrs) do
    agent
    |> cast(attrs, [
      :creator_id,
      :name,
      :slug,
      :description,
      :avatar_url,
      :system_prompt,
      :model,
      :temperature,
      :max_tokens,
      :tools,
      :mcp_servers,
      :visibility,
      :category,
      :execution_mode,
      :metadata
    ])
    |> validate_required([:creator_id, :name, :slug, :system_prompt])
    |> validate_length(:name, max: 64)
    |> validate_length(:slug, max: 64)
    |> validate_length(:model, max: 64)
    |> validate_length(:category, max: 32)
    |> validate_number(:temperature, greater_than_or_equal_to: 0, less_than_or_equal_to: 1)
    |> validate_number(:max_tokens, greater_than: 0)
    |> validate_inclusion(:visibility, [:public, :unlisted, :private])
    |> unique_constraint(:slug)
    |> foreign_key_constraint(:creator_id)
  end
end
