import Config

# Shared Ecto repo config
config :wai_agents_shared, ecto_repos: [WaiAgentsShared.Repo]

config :wai_agents_shared, WaiAgentsShared.Repo,
  migration_primary_key: [type: :binary_id],
  migration_timestamps: [type: :utc_datetime_usec]

# Oban background job config
config :wai_agents_shared, Oban,
  repo: WaiAgentsShared.Repo,
  queues: [
    default: 10,
    mailers: 20,
    media: 5,
    bridges: 10,
    agents: 5,
    feed: 10,
    maintenance: 2
  ],
  plugins: [
    {Oban.Plugins.Cron,
     crontab: [
       {"0 3 * * *", WaiAgentsGateway.Workers.MaintenanceWorker,
        args: %{"task" => "create_partitions"}},
       {"0 * * * *", WaiAgentsGateway.Workers.MaintenanceWorker,
        args: %{"task" => "cleanup_idempotency_keys"}},
       {"0 4 * * *", WaiAgentsGateway.Workers.MaintenanceWorker,
        args: %{"task" => "cleanup_sessions"}},
       {"0 5 * * *", WaiAgentsGateway.Workers.MaintenanceWorker,
        args: %{"task" => "prune_delivery_receipts"}},
       {"*/15 * * * *", WaiAgentsGateway.Workers.TrendingWorker},
       {"*/1 * * * *", WaiAgentsGateway.Workers.AgentScheduleWorker,
        args: %{"task" => "scan"}},
       {"0 2 * * *", WaiAgentsGateway.Workers.MemoryDecayWorker}
     ]}
  ]

# Phoenix gateway config
config :wai_agents_gateway,
  generators: [timestamp_type: :utc_datetime_usec]

config :wai_agents_gateway, WaiAgentsGatewayWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: WaiAgentsGatewayWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: WaiAgentsGateway.PubSub,
  live_view: [signing_salt: "zIWHx2T+"]

# Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Guardian JWT config (secret_key loaded from env in runtime.exs)
config :wai_agents_accounts, WaiAgentsAccounts.Guardian, issuer: "waiagents"

# Swoosh Mailer config (Resend in prod, overridden in dev/test)
config :swoosh, :api_client, Swoosh.ApiClient.Req

config :wai_agents_shared, WaiAgentsShared.Mailer, adapter: Swoosh.Adapters.Resend

# Base URL for magic links and email callbacks
config :wai_agents_gateway, :base_url, "https://openraccoon.com"

# JSON library
config :phoenix, :json_library, Jason

# Import environment specific config
import_config "#{config_env()}.exs"
