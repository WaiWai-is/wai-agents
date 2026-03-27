/**
 * Wai Bot — Telegram bot entry point.
 *
 * grammy for Telegram + Hono for webhook server.
 * All agent logic in ./agent/ directory.
 */

import { Bot, webhookCallback } from "grammy";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { config, log, initSentry, captureError } from "@wai/core";
import { setupCommands } from "./commands/index.js";
import { setupHandlers } from "./handlers/index.js";

// Initialize Sentry
await initSentry(config.sentryDsn, {
  environment: config.environment,
  service: "wai-bot",
});

log.info({ service: "bot", action: "starting" });

// Create bot
const bot = new Bot(config.telegramBotToken);

// Global error handler — catches ALL unhandled handler errors
bot.catch((err) => {
  const userId = String(err.ctx?.from?.id ?? 0);
  const errMsg = err.error instanceof Error ? err.error.message : String(err.error);
  log.error({ service: "bot", action: "unhandled-error", userId, error: errMsg });
  captureError(err.error instanceof Error ? err.error : new Error(errMsg), { userId, service: "bot" });

  // Try to notify user
  err.ctx?.reply("⚠️ Something went wrong. Please try again.").catch(() => {});
});

// Register commands and handlers
setupCommands(bot);
setupHandlers(bot);

// Create webhook server
const app = new Hono();

// Health check
app.get("/health", (c) => c.json({ status: "healthy", service: "wai-bot" }));

// Metrics
app.get("/metrics", (c) => {
  // TODO: implement metrics
  return c.json({ uptime: process.uptime(), counters: {} });
});

// Telegram webhook
const secret = process.env.WEBHOOK_SECRET ?? "wai-webhook-secret";
app.post(`/webhook/${secret}`, webhookCallback(bot, "hono"));

// Start
const port = config.port;

if (config.environment === "production") {
  // Production: webhook mode
  serve({ fetch: app.fetch, port }, () => {
    console.log(`🚀 Wai Bot running on port ${port} (webhook mode)`);
  });
} else {
  // Development: long polling
  bot.start({
    onStart: () => console.log("🤖 Wai Bot started (polling mode)"),
  });
}

export { bot, app };
