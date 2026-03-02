defmodule RaccoonShared.Repo.Migrations.AddAgentPlatform do
  use Ecto.Migration

  def change do
    # 1. Enable pgvector extension
    execute "CREATE EXTENSION IF NOT EXISTS vector", "DROP EXTENSION IF EXISTS vector"

    # 2. Add execution_mode to agents
    alter table(:agents) do
      add :execution_mode, :string, size: 20, null: false, default: "raw"
    end

    # 3. Add plan to users
    alter table(:users) do
      add :plan, :string, size: 20, null: false, default: "free"
    end

    # 4. agent_schedules
    create table(:agent_schedules, primary_key: false) do
      add :id, :binary_id, primary_key: true, default: fragment("gen_random_uuid()")
      add :agent_id, references(:agents, type: :binary_id, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :schedule_type, :string, size: 20, null: false
      add :cron_expression, :string, size: 100
      add :interval_seconds, :integer
      add :run_at, :utc_datetime_usec
      add :enabled, :boolean, null: false, default: true
      add :last_run_at, :utc_datetime_usec
      add :next_run_at, :utc_datetime_usec
      add :run_count, :integer, null: false, default: 0
      add :max_runs, :integer
      add :payload, :map, default: fragment("'{}'::jsonb"), null: false
      add :metadata, :map, default: fragment("'{}'::jsonb"), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:agent_schedules, [:agent_id])
    create index(:agent_schedules, [:next_run_at], where: "enabled = true")

    # 5. agent_memories (with pgvector)
    create table(:agent_memories, primary_key: false) do
      add :id, :binary_id, primary_key: true, default: fragment("gen_random_uuid()")
      add :agent_id, references(:agents, type: :binary_id, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :content, :text, null: false
      add :importance, :float, null: false, default: 0.5
      add :memory_type, :string, size: 20, null: false, default: "observation"
      add :tags, {:array, :text}, default: fragment("'{}'::text[]")
      add :access_count, :integer, null: false, default: 0
      add :last_accessed_at, :utc_datetime_usec
      add :decay_factor, :float, null: false, default: 1.0
      add :metadata, :map, default: fragment("'{}'::jsonb"), null: false

      timestamps(type: :utc_datetime_usec)
    end

    # Add the vector column via raw SQL since Ecto doesn't natively support vector type
    execute "ALTER TABLE agent_memories ADD COLUMN embedding vector(1536) NOT NULL",
            "ALTER TABLE agent_memories DROP COLUMN embedding"

    create index(:agent_memories, [:agent_id, :user_id])
    create index(:agent_memories, [:memory_type])

    execute """
            CREATE INDEX idx_agent_memories_embedding ON agent_memories
            USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
            """,
            "DROP INDEX IF EXISTS idx_agent_memories_embedding"

    # 6. agent_events
    create table(:agent_events, primary_key: false) do
      add :id, :binary_id, primary_key: true, default: fragment("gen_random_uuid()")
      add :agent_id, references(:agents, type: :binary_id, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false

      add :conversation_id, references(:conversations, type: :binary_id, on_delete: :nilify_all)

      add :event_type, :string, size: 30, null: false
      add :trigger_type, :string, size: 20
      add :duration_ms, :integer
      add :input_tokens, :integer
      add :output_tokens, :integer
      add :model, :string, size: 64
      add :status, :string, size: 20, null: false
      add :error_code, :string, size: 50
      add :error_message, :text
      add :metadata, :map, default: fragment("'{}'::jsonb"), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create index(:agent_events, [:agent_id, :inserted_at])
    create index(:agent_events, [:user_id, :inserted_at])

    # 7. integration_credentials
    create table(:integration_credentials, primary_key: false) do
      add :id, :binary_id, primary_key: true, default: fragment("gen_random_uuid()")
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :service, :string, size: 50, null: false
      add :auth_method, :string, size: 20, null: false
      add :encrypted_tokens, :binary, null: false
      add :scopes, {:array, :text}, default: fragment("'{}'::text[]")
      add :expires_at, :utc_datetime_usec
      add :refresh_expires_at, :utc_datetime_usec
      add :status, :string, size: 20, null: false, default: "active"
      add :metadata, :map, default: fragment("'{}'::jsonb"), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:integration_credentials, [:user_id, :service])

    # 8. integration_rate_limits
    create table(:integration_rate_limits, primary_key: false) do
      add :id, :binary_id, primary_key: true, default: fragment("gen_random_uuid()")
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :service, :string, size: 50, null: false
      add :window_start, :utc_datetime_usec, null: false
      add :request_count, :integer, null: false, default: 0

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:integration_rate_limits, [:user_id, :service, :window_start])

    # 9. integration_webhooks
    create table(:integration_webhooks, primary_key: false) do
      add :id, :binary_id, primary_key: true, default: fragment("gen_random_uuid()")
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :service, :string, size: 50, null: false
      add :webhook_id, :string, size: 100, null: false
      add :secret, :binary, null: false
      add :event_types, {:array, :text}, default: fragment("'{}'::text[]")
      add :enabled, :boolean, null: false, default: true
      add :metadata, :map, default: fragment("'{}'::jsonb"), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:integration_webhooks, [:webhook_id])

    # 10. channel_routes
    create table(:channel_routes, primary_key: false) do
      add :id, :binary_id, primary_key: true, default: fragment("gen_random_uuid()")
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :agent_id, references(:agents, type: :binary_id, on_delete: :nilify_all)

      add :conversation_id,
          references(:conversations, type: :binary_id, on_delete: :nilify_all)

      add :service, :string, size: 50, null: false
      add :external_chat_id, :string, size: 255, null: false
      add :direction, :string, size: 10, null: false, default: "both"
      add :enabled, :boolean, null: false, default: true
      add :metadata, :map, default: fragment("'{}'::jsonb"), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:channel_routes, [:service, :external_chat_id])
    create index(:channel_routes, [:agent_id], where: "agent_id IS NOT NULL")

    # 11. tool_approvals
    create table(:tool_approvals, primary_key: false) do
      add :id, :binary_id, primary_key: true, default: fragment("gen_random_uuid()")
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :agent_id, references(:agents, type: :binary_id, on_delete: :delete_all), null: false

      add :conversation_id,
          references(:conversations, type: :binary_id, on_delete: :nilify_all)

      add :tool_name, :string, size: 100, null: false
      add :scope, :string, size: 30, null: false
      add :decision, :string, size: 20, null: false
      add :arguments_hash, :string, size: 64
      add :decided_at, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create index(:tool_approvals, [:user_id, :agent_id, :tool_name],
             where: "scope = 'always_for_agent_tool' AND decision = 'approved'"
           )
  end
end
