# Wai — AI Partner in Telegram

## Overview
Personal AI partner that lives in Telegram. Memory + Build + Chief of Staff.
Bot: @waicomputer_bot | Domain: wai.computer

## Stack
- **TypeScript** everywhere (monorepo with Turborepo + pnpm)
- **grammy** — Telegram bot framework
- **Hono** — HTTP API server
- **Drizzle ORM** — PostgreSQL with pgvector
- **@anthropic-ai/sdk** — Claude API
- **@anthropic-ai/claude-agent-sdk** — Agent SDK for site building
- **Cloudflare Pages** — user site hosting (*.wai.computer)

## Structure
```
packages/
  core/     — shared types, DB schema (Drizzle), config
  bot/      — Telegram bot (grammy) + agent system
  api/      — REST API (Hono) for web dashboard
apps/
  web/      — Next.js web dashboard
```

## Development
```bash
pnpm install
pnpm dev:bot    # Start bot (polling mode)
pnpm dev:api    # Start API server
pnpm dev:web    # Start web dashboard
pnpm test       # Run all tests
pnpm typecheck  # TypeScript check
```

## Agent System (packages/bot/src/agent/)
- `router.ts` — Intent classification (30+ patterns EN/RU)
- `soul.ts` — 5-layer personality prompt (11 languages)
- `loop.ts` — Agent execution with Claude tool_use
- `language.ts` — 13-language detection
