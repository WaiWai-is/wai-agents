/**
 * Message handlers — text, voice, photo, document, forward.
 */

import type { Bot } from "grammy";
import { runAgent } from "../agent/loop.js";
import { detectLanguage } from "../agent/language.js";

export function setupHandlers(bot: Bot) {
  // Voice messages → transcribe + summarize
  bot.on("message:voice", async (ctx) => {
    await ctx.replyWithChatAction("typing");
    // TODO: Download voice, transcribe with Deepgram, summarize
    await ctx.reply("🎤 Voice message received. Transcription coming soon!");
  });

  // Photos → Claude Vision description
  bot.on("message:photo", async (ctx) => {
    await ctx.replyWithChatAction("typing");
    // TODO: Download photo, describe with Claude Vision
    await ctx.reply("📷 Photo received. Analysis coming soon!");
  });

  // Documents → text extraction
  bot.on("message:document", async (ctx) => {
    await ctx.replyWithChatAction("typing");
    const fileName = ctx.message.document.file_name ?? "unknown";
    await ctx.reply(`📄 Document received: *${fileName}*. Processing coming soon!`, {
      parse_mode: "Markdown",
    });
  });

  // Forwarded messages → remember
  bot.on("message:forward_origin", async (ctx) => {
    const text = ctx.message.text ?? ctx.message.caption ?? "";
    if (!text) {
      await ctx.reply("📝 Content received and saved.");
      return;
    }
    // TODO: Extract entities, detect commitments, save to memory
    const preview = text.length > 200 ? text.slice(0, 200) + "..." : text;
    await ctx.reply(`💬 *Saved*\n_${preview}_\n\n✅ _Remembered._`, {
      parse_mode: "Markdown",
    });
  });

  // Text messages → agent loop
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;

    // Skip if it's a command (handled by command handlers)
    if (text.startsWith("/")) return;

    await ctx.replyWithChatAction("typing");

    try {
      const result = await runAgent({
        message: text,
        userId: String(ctx.from.id),
        userName: ctx.from.first_name,
        userLanguage: detectLanguage(text),
      });

      await ctx.reply(result.response, { parse_mode: "Markdown" }).catch(() => {
        // Retry without Markdown if it fails
        ctx.reply(result.response);
      });
    } catch (error) {
      console.error("Agent error:", error);
      const lang = detectLanguage(text);
      const errorMsg = lang === "ru"
        ? "⚠️ Произошла ошибка. Попробуйте ещё раз."
        : "⚠️ Something went wrong. Please try again.";
      await ctx.reply(errorMsg);
    }
  });
}
