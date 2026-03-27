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
      // Send initial progress message that we'll edit in real-time
      const progressMsg = await ctx.reply("🔨 *Building your site...*\n\n📋 Planning architecture...", {
        parse_mode: "Markdown",
      });

      // Progress callback — edits the message in real-time
      const stageIcons: Record<string, string> = {
        planning: "📋", planned: "✅", generating: "⚡", retrying: "🔄", deploying: "🚀",
      };
      const onProgress = async (stage: string, detail: string) => {
        const icon = stageIcons[stage] ?? "⏳";
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            `🔨 *Building your site...*\n\n${icon} ${detail}`,
            { parse_mode: "Markdown" },
          );
        } catch {
          // Edit may fail if message hasn't changed enough — ignore
        }
      };

      await ctx.replyWithChatAction("typing");

      const { buildSite } = await import("../agent/site-builder.js");
      const name = description.includes(".") ? description.split(".")[0]?.slice(0, 40) : description.slice(0, 40);
      const result = await buildSite(description, name, mode, onProgress, userId);

      if (result.success) {
        log.info({ service: "command", action: "build-success", userId, slug: result.slug, url: result.url });
        const fileInfo = result.fileCount && result.fileCount > 1 ? `\n📂 Files: ${result.fileCount}` : "";
        const planInfo = result.plan
          ? `\n📐 Sections: ${result.plan.sections.length} | Interactive: ${result.plan.interactiveElements.length}`
          : "";

        // Update progress message with final result
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            `🚀 *Site deployed!*\n\n🌐 URL: ${result.url}\n📁 Slug: \`${result.slug}\`${fileInfo}${planInfo}`,
            { parse_mode: "Markdown" },
          );
        } catch {
          // Fallback: send new message
          await ctx.reply(
            `🚀 *Site deployed!*\n\n🌐 URL: ${result.url}\n📁 Slug: \`${result.slug}\`${fileInfo}${planInfo}`,
            { parse_mode: "Markdown" },
          );
        }
      } else {
        log.error({ service: "command", action: "build-failed", userId, error: result.error });
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            `❌ ${result.error}\n\nTry a more detailed description.`,
          );
        } catch {
          await ctx.reply(`❌ ${result.error}\n\nTry a more detailed description.`);
        }
      }
    } catch (error) {
      log.error({ service: "command", action: "build-error", userId, error: String(error) });
      captureError(error instanceof Error ? error : new Error(String(error)), { userId });
      await ctx.reply("❌ Failed to build site. Please try again.");
    }
  });

  // /edit — modify the last built site
  bot.command("edit", async (ctx) => {
    const userId = String(ctx.from?.id ?? 0);
    const editRequest = ctx.match?.trim() ?? "";

    if (!editRequest) {
      await ctx.reply(
        "✏️ Usage: `/edit <what to change>`\n\n" +
        "Examples:\n" +
        "• `/edit Change the color scheme to dark blue`\n" +
        "• `/edit Add a testimonials section with 3 reviews`\n" +
        "• `/edit Make the hero section bigger with a gradient`\n" +
        "• `/edit Translate everything to Russian`",
        { parse_mode: "Markdown" },
      );
      return;
    }

    log.info({ service: "command", action: "edit", userId, editLength: editRequest.length });

    try {
      const progressMsg = await ctx.reply("✏️ *Editing your site...*\n\n⏳ Applying changes...", {
        parse_mode: "Markdown",
      });

      const stageIcons: Record<string, string> = {
        editing: "✏️", deploying: "🚀",
      };
      const onProgress = async (stage: string, detail: string) => {
        const icon = stageIcons[stage] ?? "⏳";
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            `✏️ *Editing your site...*\n\n${icon} ${detail}`,
            { parse_mode: "Markdown" },
          );
        } catch { /* ignore edit failures */ }
      };

      const { editAndDeploySite } = await import("../agent/site-builder.js");
      const result = await editAndDeploySite(userId, editRequest, onProgress);

      if (result.success) {
        log.info({ service: "command", action: "edit-success", userId, slug: result.slug });
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            progressMsg.message_id,
            `✅ *Site updated!*\n\n🌐 URL: ${result.url}\n✏️ Change: "${editRequest.slice(0, 80)}"`,
            { parse_mode: "Markdown" },
          );
        } catch {
          await ctx.reply(
            `✅ *Site updated!*\n\n🌐 URL: ${result.url}\n✏️ Change: "${editRequest.slice(0, 80)}"`,
            { parse_mode: "Markdown" },
          );
        }
      } else {
        log.error({ service: "command", action: "edit-failed", userId, error: result.error });
        try {
          await ctx.api.editMessageText(ctx.chat.id, progressMsg.message_id, `❌ ${result.error}`);
        } catch {
          await ctx.reply(`❌ ${result.error}`);
        }
      }
    } catch (error) {
      log.error({ service: "command", action: "edit-error", userId, error: String(error) });
      captureError(error instanceof Error ? error : new Error(String(error)), { userId });
      await ctx.reply("❌ Failed to edit site. Please try again.");
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
    { command: "edit", description: "Edit the last built site" },
    { command: "digest", description: "Daily activity digest" },
    { command: "commitments", description: "Track promises" },
    { command: "briefing", description: "Morning briefing" },
    { command: "status", description: "Stats & health" },
    { command: "clear", description: "Reset conversation" },
    { command: "feedback", description: "Send feedback" },
  ]).catch(() => {}); // Ignore if not authorized yet
}
