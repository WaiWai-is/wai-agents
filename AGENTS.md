# WaiAgents Monorepo Guide

Snapshot date: 2026-03-05

## Purpose
This file is the root operating guide for agents/contributors working across the monorepo.
It reflects the current codebase across both active stacks:
- the root TypeScript/web workspace (`packages/*`, `web/`)
- the Elixir umbrella + Python runtime + Swift client (`wai_agents/`, `agent_runtime/`, `WaiAgents/`)

`CLAUDE.md` remains the main operational guide for the TypeScript/web deployment and public `openraccoon.com` surface.

## Source of truth
Use this precedence when behavior conflicts:
1. Current code in the stack you are touching.
2. Stack-local operational guides:
   - `CLAUDE.md` for the root TypeScript/web workspace and public deployment.
   - `wai_agents/AGENTS.md` plus the umbrella router/controllers for the Elixir backend.
3. `SPECS.md` (target architecture; parts are still aspirational).

`SPECS.md` should be treated as target intent, not as guaranteed implementation.

## Repository map
- `packages/api`: TypeScript Hono API + Socket.IO realtime server.
- `packages/shared`: shared TypeScript schemas/types.
- `packages/mcp-servers/*`: TypeScript MCP servers (`memory`, `web-search`, `pr-tools`, `agent-comm`).
- `web/`: Next.js 14 web app.
- `wai_agents/`: Elixir umbrella backend.
  - `wai_agents_gateway`: REST API, channels, plugs, workers.
  - `wai_agents_accounts`: auth, users, token/magic-link/passkey schemas.
  - `wai_agents_chat`: conversations, members, messages, delivery pipeline.
  - `wai_agents_agents`: agent config, gRPC client, execution bridge, cost tracking.
  - `wai_agents_bridges`: bridge adapters, bridge lifecycle/processes.
  - `wai_agents_pages`: pages, deploy, versioning, forking.
  - `wai_agents_feed`: feed submission, ranking, trending, likes/follows.
  - `wai_agents_shared`: repo, pagination, idempotency, common types, media helpers.
- `agent_runtime/`: Python gRPC sidecar for LLM orchestration and E2B sandbox execution.
- `WaiAgents/`: Swift package + XcodeGen project (macOS + iOS clients).

## Running and testing
### TypeScript/web workspace
```bash
pnpm install
pnpm -r build
pnpm --filter @wai-agents/api test
pnpm --filter @wai-agents/api exec tsc --noEmit
pnpm lint
cd web && pnpm build
```

Local dev entrypoints:
```bash
pnpm dev:api
pnpm dev:web
```

### Backend (Elixir umbrella)
```bash
cd wai_agents
mix deps.get
mix ecto.create
mix ecto.migrate
mix phx.server
```

Quality/testing:
```bash
cd wai_agents
mix format
mix test
```

API integration scripts:
```bash
cd wai_agents/test_scripts
./run_all.sh --non-interactive --no-soak
```

### Agent runtime (Python)
```bash
cd agent_runtime
uv sync
uv run python -m wai_agents_runtime
```

Tests/lint:
```bash
cd agent_runtime
make test
make lint
make format
```

### Swift client
```bash
cd WaiAgents
swift test
./generate-project.sh
xcodebuild -scheme WaiAgents-macOS -configuration Debug -derivedDataPath build/DerivedData -destination 'platform=macOS' build
```

## Current implemented surface
### TypeScript/web stack
#### Auth and users
- Public deployment serves password auth, register, refresh, logout, magic-link request/verify, `GET /users/me`, `PATCH /users/me`, and public `GET /users/:username`.
- Root `web/` auth shell persists session in Zustand and restores by calling `/users/me`.
- On March 5, 2026, the public seeded-user login path `alex@openraccoon.com / TestPass123!` still returned HTTP 200.

#### Chat and realtime
- TypeScript API uses Socket.IO at `/socket.io`; current web chat is wired to `socket.io-client`.
- Supported TS realtime events include `join:conversation`, `message:new`, `message:updated`, `message:deleted`, `join:agent`, and `agent:event`.
- The repo also contains a Phoenix client helper, but the checked-in `web/` chat surface does not currently consume it.

#### Agents, feed, and marketplace
- TypeScript API ships agent CRUD, marketplace listing/search/profile/rating, and agent conversation start.
- Feed list/trending/following/new plus like/unlike are implemented in the TS API.
- Internal agent-to-agent execution exists behind `/api/v1/internal/agent/execute` and the `packages/mcp-servers/agent-comm` server, but there is no first-class browser UI for multi-agent conversations.

#### Public deployment gaps seen on March 5, 2026
- `https://openraccoon.com/api/v1/pages` returned `404`.
- `https://openraccoon.com/api/v1/bridges` returned `404`.
- `https://openraccoon.com/api/v1/users/me/usage` returned `404`.
- `POST /auth/magic-link` and invalid `POST /auth/magic-link/verify` returned `500` in the shipped shell smoke script.

### Current implemented surface (Elixir umbrella)
### Auth and users
- Implemented endpoints: register/login/refresh/logout, magic-link request/verify, profile read/update, usage placeholder.
- JWT auth via Guardian with refresh rotation and ETS-backed token revocation.
- API verify path is `POST /api/v1/auth/magic-link/verify`; browser/app trampoline is `GET /auth/magic-link/verify`, which redirects to `waiagents://`.
- Passkey schema exists (`user_credentials`) but passkey auth endpoints are not implemented.
- OAuth deps are present in `wai_agents_accounts`, but OAuth/Telegram auth endpoints from spec are not wired in router.

### Chat and realtime
- Conversation/member/message CRUD exists with membership-based authorization checks.
- Realtime channels implemented:
  - `conversation:{id}` (messages, typing, read, reactions, presence).
  - `agent:{conversation_id}` (streaming/status/tool events).
  - `user:{id}` (notifications/bridge status/conversation updates).
- Message persistence uses partitioned PostgreSQL `messages` table by `created_at`.
- `POST /conversations/:id/messages` enforces `Idempotency-Key`.
- E2E encryption requirements in spec are not implemented.

### Agent system
- Agent CRUD, visibility, marketplace listing/search/rating are implemented.
- Agent conversation creation endpoint exists (`POST /agents/:id/conversation`).
- `WaiAgentsAgents.AgentExecutor` streams gRPC sidecar events to Phoenix PubSub.
- Cost tracking persists usage logs and maintains in-memory aggregates/limits.
- Tool approval audit store is ETS-backed (not durable DB persistence).
- Important gap: channel approval events are recorded/broadcast, but no live bridge is wired to call Python orchestrator `submit_approval_decision`.

### Pages
- Page CRUD, deploy/fork/version listing endpoints are implemented.
- Deploy path supports version increment + `PageVersion` creation.
- `POST /pages/:id/deploy` and `POST /pages/:id/fork` enforce `Idempotency-Key`.
- Custom-domain provisioning and richer page generation workflow from spec are not implemented.

### Bridges
- Bridge CRUD-ish endpoints implemented (list/connect/disconnect/status).
- Telegram and WhatsApp adapters normalize payloads and support outbound API calls/media fetch paths.
- Bridge worker/supervisor/monitor modules exist for process lifecycle.
- Media normalization/transcoding modules still contain placeholders (`:not_implemented` paths).
- Webhook endpoints currently accept payloads without platform signature verification.

### Feed and marketplace
- Feed endpoints implemented: list/trending/following/new/create/like/unlike/fork.
- Submission pipeline: daily rate limit + duplicate check + quality threshold.
- Ranking/trending formulas implemented and periodic trending recalculation worker exists.
- Current duplicate and quality logic is heuristic + `pg_trgm`; spec’s LLM evaluator + pgvector embedding flow is not yet implemented.
- Marketplace categories endpoint is static.

### Swift app
- Session restore + token refresh + auth flows (email/password + magic link) are implemented.
- REST client and Phoenix websocket client with reconnect behavior are implemented.
- Chat views, feed, marketplace, settings shells are present.
- Agent chat UI with streaming/status/tool approval components exists.
- Several UI actions are still placeholders (comments/share/reviews/security/settings actions).

### Python runtime
- gRPC server exposes `AgentService` and `SandboxService`.
- Provider routing for `claude*` and `gpt*`, streaming token/status/tool/code/error/complete events.
- Tool registry validation/execution exists; unregistered handlers raise `NotImplementedError`.
- E2B sandbox lifecycle APIs implemented (create/execute/upload/destroy).
- `GetAgentConfig` RPC is explicitly unimplemented.

## Major spec deltas to track
- Auth spec includes passkey/OAuth/Telegram flows; backend currently ships password + magic-link only.
- Security spec calls for Signal-protocol E2E encryption; current messaging is server-mediated.
- Feed spec calls for LLM quality evaluator + pgvector embeddings; implementation is heuristic scoring + trigram duplicate checks.
- Several workers/services are scaffolded with placeholders (agent execution worker internals, feed indexing, media transcoding, some bridge sync tasks).

## Operational notes
### Public TypeScript/web deployment (`CLAUDE.md`)
- API base: `https://openraccoon.com/api/v1`
- Web realtime: `https://openraccoon.com/socket.io/`
- Public web origin: `https://openraccoon.com`
- SSH host in `CLAUDE.md`: `root@157.180.72.249`
- Systemd services in `CLAUDE.md`: `waiagents-api`, `waiagents-web`, `waiagents-mcp-memory`, `waiagents-mcp-web-search`, `waiagents-mcp-pr-tools`, `waiagents-mcp-agent-comm`
- DB/Redis/object storage paths and deploy commands for the TS/web stack live in `CLAUDE.md`; keep this file and `CLAUDE.md` in sync when those operational details change.

### Elixir/Python/Swift stack
- Agent runtime sidecar expected at `localhost:50051` unless `AGENT_SIDECAR_ADDR` is overridden.
- Phoenix websocket path: `/socket/websocket?token=JWT`
- Seed script provides test accounts (all password `TestPass123!`).
- On March 5, 2026, direct access to `http://157.180.72.249:4000` timed out from this machine, so validate reachability before assuming that host is usable from your current environment.

## Contributor rules
- If touching backend code under `wai_agents/`, also follow [`wai_agents/AGENTS.md`](/Users/mikwiseman/Documents/Code/wai-agents/wai_agents/AGENTS.md).
- If touching `packages/` or `web/`, consult [`CLAUDE.md`](/Users/mikwiseman/Documents/Code/wai-agents/CLAUDE.md) for public deployment behavior and operational commands.
- Validate real behavior from router/controllers before implementing spec-driven changes.
- Preserve idempotency and pagination contracts on existing endpoints.
- Prefer extending existing context modules instead of bypassing them in controllers.
- Keep this file updated when implementation materially changes.
- If you change shared operational behavior, update both `AGENTS.md` and `CLAUDE.md` in the same pass.

## Known technical debt warnings (current code)
- `web/` is currently split across two backend contracts: the checked-in UI assumes Elixir-style list/pagination payloads for many REST calls, while the public TypeScript API returns different top-level keys for conversations/messages/agents.
- `web/` chat uses Socket.IO, while the Swift app and Elixir backend use Phoenix channels; there is no single verified realtime contract across all clients today.
- `WaiAgentsFeed.SubmissionPipeline` uses `DateTime.beginning_of_day/1` (warning in current build).
- `WaiAgentsGateway.Workers.BridgeSyncWorker` calls `BridgeManager.reconnect/1` which is not currently defined.
- `WaiAgentsChat` references `WaiAgentsAgents` without declaring a direct umbrella dependency (compile warnings).
- `WaiAgentsAccounts.Guardian` implements `after_decode_and_verify/2` with a Guardian callback warning.
