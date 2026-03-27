/**
 * Bot commands — all slash commands registered here.
 */

import type { Bot } from "grammy";
import { detectLanguage } from "../agent/language.js";

export function setupCommands(bot: Bot) {
  // /start and /help
  bot.command(["start", "help"], async (ctx) => {
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
    const uptime = Math.floor(process.uptime());
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    await ctx.reply(
      `📊 *Status*\n\n⚙️ Uptime: ${h}h ${m}m\n🤖 Engine: TypeScript + grammy\n🧠 Model: Claude Haiku 4.5`,
      { parse_mode: "Markdown" },
    );
  });

  // /clear
  bot.command("clear", async (ctx) => {
    // TODO: clear conversation history
    await ctx.reply("🗑️ Conversation cleared. Fresh start!");
  });

  // /commitments
  bot.command("commitments", async (ctx) => {
    // TODO: fetch from DB
    await ctx.reply("No open commitments found.");
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
