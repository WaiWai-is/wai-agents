# WaiAgents — TS/Web Deployment Guide

Snapshot date: 2026-03-12

## Repository

- GitHub: `https://github.com/WaiWai-is/wai-agents`
- Domain: `https://openraccoon.com`
- CI: GitHub Actions (lint + typecheck + test)
- Deploy: GitHub Actions → SSH → git pull → pnpm build → systemctl restart
- Deploy gate: `vars.DEPLOY_ENABLED == 'true'` (set in repo settings)

## Scope

This file covers the root pnpm workspace and the public `openraccoon.com` deployment:
- `packages/api`
- `packages/shared`
- `packages/mcp-servers/*`
- `web/`

This repo also contains a separate Elixir/Python/Swift stack in `wai_agents/`, `agent_runtime/`, and `WaiAgents/`. For that stack, use `AGENTS.md` and `wai_agents/AGENTS.md`.

## Monorepo Map

- `packages/api` — Hono REST API + Socket.IO realtime server
- `packages/shared` — shared TypeScript types and schemas
- `packages/mcp-servers/memory` — memory MCP server
- `packages/mcp-servers/web-search` — web search MCP server
- `packages/mcp-servers/pr-tools` — PR tools MCP server
- `packages/mcp-servers/agent-comm` — agent-to-agent MCP server
- `web/` — Next.js 14 web client

## Local Development

```bash
pnpm install
pnpm -r build
pnpm --filter @wai-agents/api test
pnpm --filter @wai-agents/api exec tsc --noEmit
pnpm lint
pnpm dev:api
pnpm dev:web
```

## Public Deployment

Verified on March 12, 2026:
- Web origin: `https://openraccoon.com`
- API base: `https://openraccoon.com/api/v1`
- Health: `GET /health` returns `200` with `{"status":"ok","service":"wai-agents-api",...}`
- Realtime: Socket.IO is live at `https://openraccoon.com/socket.io/`
- `openraccoon.com` resolves to `157.180.72.249`
- Seeded login `alex@openraccoon.com / TestPass123!` still returns `200`
- Public profile `GET /users/alex_dev` still returns `200`

Current public gaps and failures:
- `GET /pages` returns `404`
- `GET /bridges` returns `404`
- `GET /users/me/usage` returns `404`
- `POST /auth/magic-link` returns `500`
- Invalid `POST /auth/magic-link/verify` returns `500`

Direct-host note:
- TCP `22` on `157.180.72.249` is reachable. Port `4000` is not exposed externally.
- Use `https://openraccoon.com` (nginx reverse proxy with Let's Encrypt SSL).
- `api.openraccoon.com` is also configured for direct API access.

## Auth

- Bearer JWT: `Authorization: Bearer <access_token>`
- Auth routes are rate-limited to `5` requests per minute per IP
- Supported routes in the TypeScript API:
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/refresh`
  - `DELETE /auth/logout`
  - `POST /auth/magic-link`
  - `POST /auth/magic-link/verify`
- Public deployment reality as of March 12, 2026:
  - password login works
  - logout works with `DELETE`
  - `POST /auth/logout` returns `404`
  - magic-link routes are broken in production

### zsh Curl Warning

zsh escapes `!` inside inline JSON, so `TestPass123!` can become `TestPass123\\!`. Use a heredoc or `-d @file` for auth payloads.

## Current Public TS API Surface

Users:
- `GET /users/me`
- `PATCH /users/me`
- `GET /users/:username`

Conversations:
- `GET /conversations`
- `POST /conversations`
- `GET /conversations/:id`
- `PATCH /conversations/:id`
- `DELETE /conversations/:id`
- `GET /conversations/:id/messages`
- `POST /conversations/:id/messages` with `Idempotency-Key`
- `GET /conversations/:id/members`
- `POST /conversations/:id/members`
- `DELETE /conversations/:id/members/:userId`
- `POST /conversations/:id/messages/:messageId/feedback`
- `GET /conversations/:id/should-prompt-feedback`

Agents:
- `GET /agents/templates`
- `GET /agents`
- `POST /agents`
- `GET /agents/:id`
- `PATCH /agents/:id`
- `DELETE /agents/:id`
- `GET /agents/:id/performance`
- `POST /agents/:id/conversation`

Feed and marketplace:
- `GET /feed`
- `GET /feed/trending`
- `GET /feed/following`
- `GET /feed/new`
- `POST /feed/:id/like`
- `DELETE /feed/:id/like`
- `POST /feed/:id/fork`
- `GET /marketplace`
- `GET /marketplace/search?q=...`
- `GET /marketplace/categories`
- `GET /marketplace/agents/:slug`
- `POST /marketplace/agents/:id/rate`
- `POST /users/:id/follow`
- `DELETE /users/:id/follow`

Uploads:
- `POST /uploads/presign`
- `GET /uploads/:key`

Internal-only:
- `POST /internal/agent/execute` with `X-Internal-Key`

Not on the current public deployment:
- `/pages`
- `/bridges`
- `/users/me/usage`

## Realtime Contract

- Transport: Socket.IO at `/socket.io`
- Client auth: `handshake.auth.token`
- User room auto-join: `user:{userId}`
- Conversation events:
  - client: `join:conversation`, `leave:conversation`, `typing:start`, `typing:stop`, `read`
  - server: `message:new`, `message:updated`, `message:deleted`, `typing:start`, `typing:stop`, `conversation:updated`
- Agent events:
  - client: `join:agent`, `leave:agent`
  - server: `agent:event`, `a2a:event`

## Deployment Notes

Verified on-host March 12, 2026:
- SSH: `root@157.180.72.249`
- Code dir: `/opt/wai-agents`
- Env file: `/opt/wai-agents/.env`
- PostgreSQL: `raccoon_prod` on localhost
- Redis: `localhost:6379`
- Reverse proxy: nginx with Let's Encrypt SSL for `openraccoon.com` and `api.openraccoon.com`
- Systemd services (all active): `waiagents-api`, `waiagents-web`, `waiagents-mcp-memory`, `waiagents-mcp-web-search`, `waiagents-mcp-pr-tools`, `waiagents-mcp-agent-comm`
- Object storage: Hetzner Object Storage bucket `open-raccoon`

### GitHub Actions Secrets (configured on `WaiWai-is/wai-agents`)

| Secret/Variable | Purpose |
|----------------|---------|
| `DEPLOY_ENABLED` (variable) | Set to `true` to enable deploy job |
| `SSH_PRIVATE_KEY` | ed25519 key for server access |
| `SSH_HOST` | `157.180.72.249` |
| `SSH_USER` | `root` |
| `SSH_KNOWN_HOSTS` | Server host key fingerprints |

## Verified Test Account

- `alex@openraccoon.com / TestPass123!`
