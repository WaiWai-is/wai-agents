defmodule RaccoonGatewayWeb.Router do
  use RaccoonGatewayWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :authenticated do
    plug RaccoonGatewayWeb.Plugs.Auth
    plug RaccoonGatewayWeb.Plugs.RateLimit, category: :general
  end

  pipeline :auth_rate_limited do
    plug RaccoonGatewayWeb.Plugs.RateLimit, category: :auth
  end

  # Public health check (no auth required)
  scope "/api/v1", RaccoonGatewayWeb do
    pipe_through :api

    get "/health", HealthController, :index
  end

  # Public auth endpoints (rate limited by IP)
  scope "/api/v1/auth", RaccoonGatewayWeb do
    pipe_through [:api, :auth_rate_limited]

    post "/register", AuthController, :register
    post "/login", AuthController, :login
    post "/refresh", AuthController, :refresh
    post "/magic-link", AuthController, :magic_link
    post "/magic-link/verify", AuthController, :verify_magic_link
  end

  # Authenticated endpoints
  scope "/api/v1", RaccoonGatewayWeb do
    pipe_through [:api, :authenticated]

    # Auth (logout requires auth)
    delete "/auth/logout", AuthController, :logout

    # Users
    get "/users/me", UserController, :me
    patch "/users/me", UserController, :update
    get "/users/me/usage", UserController, :usage
    get "/users/:username", UserController, :show

    # Conversations
    get "/conversations", ConversationController, :index
    post "/conversations", ConversationController, :create
    get "/conversations/:id", ConversationController, :show
    patch "/conversations/:id", ConversationController, :update
    delete "/conversations/:id", ConversationController, :delete

    # Messages (idempotency enforced via plug in controller)
    get "/conversations/:conversation_id/messages", MessageController, :index
    post "/conversations/:conversation_id/messages", MessageController, :create
    patch "/conversations/:conversation_id/messages/:id", MessageController, :update
    delete "/conversations/:conversation_id/messages/:id", MessageController, :delete

    # Members
    get "/conversations/:conversation_id/members", MemberController, :index
    post "/conversations/:conversation_id/members", MemberController, :create
    delete "/conversations/:conversation_id/members/:user_id", MemberController, :delete

    # Agents
    get "/agents", AgentController, :index
    post "/agents", AgentController, :create
    get "/agents/:id", AgentController, :show
    patch "/agents/:id", AgentController, :update
    delete "/agents/:id", AgentController, :delete
    post "/agents/:id/conversation", AgentController, :start_conversation

    # Pages (idempotency enforced via plug in controller for deploy/fork)
    get "/pages", PageController, :index
    post "/pages", PageController, :create
    get "/pages/:id", PageController, :show
    patch "/pages/:id", PageController, :update
    post "/pages/:id/deploy", PageController, :deploy
    post "/pages/:id/fork", PageController, :fork
    get "/pages/:id/versions", PageController, :versions

    # Bridges
    get "/bridges", BridgeController, :index
    post "/bridges/telegram/connect", BridgeController, :connect_telegram
    post "/bridges/whatsapp/connect", BridgeController, :connect_whatsapp
    delete "/bridges/:id", BridgeController, :disconnect
    get "/bridges/:id/status", BridgeController, :status

    # Feed (idempotency enforced via plug in controller for create/fork)
    get "/feed", FeedController, :index
    post "/feed", FeedController, :create
    get "/feed/trending", FeedController, :trending
    get "/feed/following", FeedController, :following
    get "/feed/new", FeedController, :new_items
    post "/feed/:id/like", FeedController, :like
    delete "/feed/:id/like", FeedController, :unlike
    post "/feed/:id/fork", FeedController, :fork

    # Marketplace
    get "/marketplace", MarketplaceController, :index
    get "/marketplace/categories", MarketplaceController, :categories
    get "/marketplace/agents/:slug", MarketplaceController, :agent_profile
    post "/marketplace/agents/:id/rate", MarketplaceController, :rate
    get "/marketplace/search", MarketplaceController, :search

    # Agent schedules
    get "/agents/:agent_id/schedules", ScheduleController, :index
    post "/agents/:agent_id/schedules", ScheduleController, :create
    get "/agents/:agent_id/schedules/:id", ScheduleController, :show
    patch "/agents/:agent_id/schedules/:id", ScheduleController, :update
    delete "/agents/:agent_id/schedules/:id", ScheduleController, :delete

    # Integrations
    get "/integrations", IntegrationController, :index
    get "/integrations/:service/authorize", IntegrationController, :authorize
    delete "/integrations/:service", IntegrationController, :disconnect
    get "/integrations/:service/status", IntegrationController, :status

    # Channel routes
    get "/agents/:agent_id/channels", ChannelController, :index
    post "/agents/:agent_id/channels", ChannelController, :create
    delete "/agents/:agent_id/channels/:id", ChannelController, :delete
  end

  # Magic link trampoline — browser GET redirects to app's custom URL scheme
  scope "/auth", RaccoonGatewayWeb do
    get "/magic-link/verify", AuthController, :magic_link_trampoline
  end

  # OAuth callbacks (no auth, state token verifies user)
  scope "/api/v1", RaccoonGatewayWeb do
    pipe_through :api

    get "/integrations/callback/:service", IntegrationController, :callback
  end

  # Webhook endpoints (no auth, verified by platform signature)
  scope "/api/v1/webhooks", RaccoonGatewayWeb do
    pipe_through :api

    post "/telegram", WebhookController, :telegram
    post "/whatsapp", WebhookController, :whatsapp
    get "/whatsapp", WebhookController, :whatsapp_verify
    post "/:service/:webhook_id", WebhookController, :generic
  end
end
