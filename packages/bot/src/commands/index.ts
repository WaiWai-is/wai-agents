/**
 * Bot commands — all slash commands registered here.
 */

import type { Bot } from "grammy";
import { log, captureError } from "@wai/core";
import { detectLanguage } from "../agent/language.js";
import { clearHistory } from "../handlers/index.js";

export function setupCommands(bot: Bot) {
  // /start and /help
  bot.command(["start", "help"], async (ctx) => {
    log.info({ service: "command", action: "help", userId: String(ctx.from?.id ?? 0) });
    const lang = detectLanguage(ctx.from?.first_name ?? "");
    const isRu = lang === "ru";

    const text = isRu
      ? `👋 *Привет! Я Wai* — твой AI-партнёр в Telegram.

Я умею:
🔍 Искать по прошлым сообщениям по смыслу
🎤 Транскрибировать и резюмировать голосовые
📋 Отслеживать обещания (свои и чужие)
🚀 Создавать и публиковать сайты
📊 Генерировать дайджесты активности
🌅 Утренний брифинг с обязательствами

Команды:
• \`/search запрос\` — поиск по сообщениям
• \`/build описание\` — создать сайт
• \`/commitments\` — открытые обещания
• \`/digest\` — дайджест дня
• \`/briefing\` — утренний брифинг
• \`/status\` — статистика
• \`/clear\` — очистить историю`
      : `👋 *Hey! I'm Wai* — your AI partner in Telegram.

I can:
🔍 Search past messages by meaning
🎤 Transcribe & summarize voice messages
📋 Track commitments (yours & others')
🚀 Create & publish websites
📊 Generate daily digests
🌅 Morning briefing with commitments

Commands:
• \`/search query\` — search messages
• \`/build description\` — create a website
• \`/commitments\` — open promises
• \`/digest\` — daily summary
• \`/briefing\` — morning briefing
• \`/status\` — statistics
• \`/clear\` — reset conversation`;

    await ctx.reply(text, { parse_mode: "Markdown" });
  });

  // /status
  bot.command("status", async (ctx) => {
    log.info({ service: "command", action: "status", userId: String(ctx.from?.id ?? 0) });
    const uptime = Math.floor(process.uptime());
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    await ctx.reply(
      `📊 *Status*\n\n⚙️ Uptime: ${h}h ${m}m\n🤖 Engine: TypeScript + grammy\n🧠 Model: Claude Haiku 4.5`,
      { parse_mode: "Markdown" },
    );
  });

  // /clear — actually clears conversation history
  bot.command("clear", async (ctx) => {
    const chatId = ctx.chat.id;
    log.info({ service: "command", action: "clear", userId: String(ctx.from?.id ?? 0), chatId });
    clearHistory(chatId);
    await ctx.reply("🗑️ Conversation cleared. Fresh start!");
  });

  // /commitments
  bot.command("commitments", async (ctx) => {
    log.info({ service: "command", action: "commitments", userId: String(ctx.from?.id ?? 0) });
    await ctx.reply("No open commitments found.");
  });

  // /build — generate and deploy a website
  bot.command("build", async (ctx) => {
    const userId = String(ctx.from?.id ?? 0);
    let description = ctx.match?.trim() ?? "";

    // Check for --agent flag
    const useAgent = description.includes("--agent");
    if (useAgent) {
      description = description.replace("--agent", "").trim();
    }

    if (!description || description.length < 10) {
      await ctx.reply(
        "🚀 Usage: `/build <description>`\n\n" +
        "Examples:\n" +
        "• `/build Landing page for cafe Sunrise. Menu: coffee $3, latte $4.`\n" +
        "• `/build --agent Portfolio site for photographer with gallery and contact form`",
        { parse_mode: "Markdown" },
      );
      return;
    }

    const mode = useAgent ? "agent" : "simple";
    log.info({ service: "command", action: "build", userId, mode, descriptionLength: description.length });

    try {
      await ctx.replyWithChatAction("typing");
      if (useAgent) {
        await ctx.reply("🤖 Agent mode: building multi-file site...");
      }

      const { buildSite } = await import("../agent/site-builder.js");
      const name = description.includes(".") ? description.split(".")[0]?.slice(0, 40) : description.slice(0, 40);
      const result = await buildSite(description, name, mode);

      if (result.success) {
        log.info({ service: "command", action: "build-success", userId, slug: result.slug, url: result.url });
        const fileInfo = result.fileCount && result.fileCount > 1 ? `\n📂 Files: ${result.fileCount}` : "";
        await ctx.reply(
          `🚀 *Site deployed!*\n\n🌐 URL: ${result.url}\n📁 Slug: \`${result.slug}\`${fileInfo}`,
          { parse_mode: "Markdown" },
        );
      } else {
        log.error({ service: "command", action: "build-failed", userId, error: result.error });
        await ctx.reply(`❌ ${result.error}\n\nTry a more detailed description.`);
      }
    } catch (error) {
      log.error({ service: "command", action: "build-error", userId, error: String(error) });
      captureError(error instanceof Error ? error : new Error(String(error)), { userId });
      await ctx.reply("❌ Failed to build site. Please try again.");
    }
  });

  // /feedback
  bot.command("feedback", async (ctx) => {
    const feedback = ctx.match?.trim() ?? "";
    if (feedback) {
      log.info({ service: "feedback", action: "received", userId: String(ctx.from?.id ?? 0), feedback });
      await ctx.reply("💬 Thanks for the feedback!");
    } else {
      await ctx.reply("Usage: `/feedback your message here`", { parse_mode: "Markdown" });
    }
  });

  // Set bot commands menu
  bot.api.setMyCommands([
    { command: "start", description: "Start Wai" },
    { command: "help", description: "Show commands" },
    { command: "search", description: "Search messages by meaning" },
    { command: "build", description: "Create & publish a website" },
    { command: "digest", description: "Daily activity digest" },
    { command: "commitments", description: "Track promises" },
    { command: "briefing", description: "Morning briefing" },
    { command: "status", description: "Stats & health" },
    { command: "clear", description: "Reset conversation" },
    { command: "feedback", description: "Send feedback" },
  ]).catch(() => {}); // Ignore if not authorized yet
}
