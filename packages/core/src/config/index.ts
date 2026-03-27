/**
 * Wai Configuration — all env vars in one place.
 */

export const config = {
  // Database
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://wai:wai@localhost:5432/wai",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",

  // Telegram
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramApiId: Number(process.env.TELEGRAM_API_ID ?? "0"),
  telegramApiHash: process.env.TELEGRAM_API_HASH ?? "",

  // Anthropic
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",

  // Cloudflare
  cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN ?? "",
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",

  // Deepgram
  deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? "",

  // OpenAI (embeddings)
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",

  // Sentry
  sentryDsn: process.env.SENTRY_DSN ?? "",

  // App
  environment: process.env.NODE_ENV ?? "development",
  domain: "wai.computer",
  port: Number(process.env.PORT ?? "3000"),
} as const;
