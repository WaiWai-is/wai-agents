defmodule RaccoonAgents.AgentSchedule do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "agent_schedules" do
    belongs_to :agent, RaccoonAgents.Agent
    belongs_to :user, RaccoonAccounts.User

    field :schedule_type, Ecto.Enum, values: [:cron, :interval, :once]
    field :cron_expression, :string
    field :interval_seconds, :integer
    field :run_at, :utc_datetime_usec
    field :enabled, :boolean, default: true
    field :last_run_at, :utc_datetime_usec
    field :next_run_at, :utc_datetime_usec
    field :run_count, :integer, default: 0
    field :max_runs, :integer
    field :payload, :map, default: %{}
    field :metadata, :map, default: %{}

    timestamps(type: :utc_datetime_usec)
  end

  def changeset(schedule, attrs) do
    schedule
    |> cast(attrs, [
      :agent_id,
      :user_id,
      :schedule_type,
      :cron_expression,
      :interval_seconds,
      :run_at,
      :enabled,
      :next_run_at,
      :max_runs,
      :payload,
      :metadata
    ])
    |> validate_required([:agent_id, :user_id, :schedule_type])
    |> validate_inclusion(:schedule_type, [:cron, :interval, :once])
    |> foreign_key_constraint(:agent_id)
    |> foreign_key_constraint(:user_id)
  end
end
