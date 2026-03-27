import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses default values when env vars are not set", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.PORT;
    delete process.env.NODE_ENV;

    const { config } = await import("../config/index.js");

    expect(config.databaseUrl).toBe("postgresql://wai:wai@localhost:5432/wai");
    expect(config.redisUrl).toBe("redis://localhost:6379");
    expect(config.port).toBe(3000);
    expect(config.environment).toBe("development");
    expect(config.domain).toBe("wai.computer");
  });

  it("reads DATABASE_URL from env", async () => {
    process.env.DATABASE_URL = "postgresql://custom:pass@host:5433/mydb";

    const { config } = await import("../config/index.js");

    expect(config.databaseUrl).toBe("postgresql://custom:pass@host:5433/mydb");
  });

  it("reads TELEGRAM_BOT_TOKEN from env", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:ABC";

    const { config } = await import("../config/index.js");

    expect(config.telegramBotToken).toBe("123:ABC");
  });

  it("reads ANTHROPIC_API_KEY from env", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";

    const { config } = await import("../config/index.js");

    expect(config.anthropicApiKey).toBe("sk-ant-test");
  });

  it("parses PORT as number", async () => {
    process.env.PORT = "8080";

    const { config } = await import("../config/index.js");

    expect(config.port).toBe(8080);
    expect(typeof config.port).toBe("number");
  });

  it("parses TELEGRAM_API_ID as number", async () => {
    process.env.TELEGRAM_API_ID = "12345";

    const { config } = await import("../config/index.js");

    expect(config.telegramApiId).toBe(12345);
  });

  it("reads Cloudflare config from env", async () => {
    process.env.CLOUDFLARE_API_TOKEN = "cf-token";
    process.env.CLOUDFLARE_ACCOUNT_ID = "cf-account";

    const { config } = await import("../config/index.js");

    expect(config.cloudflareApiToken).toBe("cf-token");
    expect(config.cloudflareAccountId).toBe("cf-account");
  });

  it("reads SENTRY_DSN from env", async () => {
    process.env.SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0";

    const { config } = await import("../config/index.js");

    expect(config.sentryDsn).toBe("https://examplePublicKey@o0.ingest.sentry.io/0");
  });

  it("reads NODE_ENV as environment", async () => {
    process.env.NODE_ENV = "production";

    const { config } = await import("../config/index.js");

    expect(config.environment).toBe("production");
  });

  it("defaults empty strings for optional API keys", async () => {
    delete process.env.DEEPGRAM_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CLOUDFLARE_API_TOKEN;

    const { config } = await import("../config/index.js");

    expect(config.deepgramApiKey).toBe("");
    expect(config.openaiApiKey).toBe("");
    expect(config.cloudflareApiToken).toBe("");
  });

  it("has all expected config keys", async () => {
    const { config } = await import("../config/index.js");

    const expectedKeys = [
      "databaseUrl", "redisUrl",
      "telegramBotToken", "telegramApiId", "telegramApiHash",
      "anthropicApiKey",
      "cloudflareApiToken", "cloudflareAccountId",
      "deepgramApiKey", "openaiApiKey",
      "sentryDsn",
      "environment", "domain", "port",
    ];

    for (const key of expectedKeys) {
      expect(config).toHaveProperty(key);
    }
  });
});
