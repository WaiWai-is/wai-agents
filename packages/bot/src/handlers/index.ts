/**
 * Message handlers — text, voice, photo, document, forward.
 *
 * In-memory conversation history per chat (until DB integration).
 */

import type { Bot } from "grammy";
import { log, captureError } from "@wai/core";
import { runAgent } from "../agent/loop.js";
import { detectLanguage } from "../agent/language.js";

/** In-memory conversation store. Key = chatId, value = last N messages. */
const conversationStore = new Map<number, Array<{ role: "user" | "assistant"; content: string }>>();

const MAX_HISTORY = 20;

function getHistory(chatId: number): Array<{ role: "user" | "assistant"; content: string }> {
  return conversationStore.get(chatId) ?? [];
}

function addToHistory(chatId: number, role: "user" | "assistant", content: string) {
  const history = conversationStore.get(chatId) ?? [];
  history.push({ role, content });
  // Keep only last N messages
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
  conversationStore.set(chatId, history);
}

export function clearHistory(chatId: number) {
  conversationStore.delete(chatId);
}

export function setupHandlers(bot: Bot) {
  // Voice messages → transcribe + summarize
  bot.on("message:voice", async (ctx) => {
    const userId = String(ctx.from?.id ?? 0);
    log.info({ service: "handler", action: "voice-received", userId });
    try {
      await ctx.replyWithChatAction("typing");
      // TODO: Download voice, transcribe with Deepgram, summarize
      await ctx.reply("🎤 Voice message received. Transcription coming soon!");
    } catch (error) {
      log.error({ service: "handler", action: "voice-error", userId, error: String(error) });
      captureError(error instanceof Error ? error : new Error(String(error)), { userId });
      await ctx.reply("⚠️ Error processing voice message.").catch(() => {});
    }
  });

  // Photos → Claude Vision description
  bot.on("message:photo", async (ctx) => {
    const userId = String(ctx.from?.id ?? 0);
    log.info({ service: "handler", action: "photo-received", userId });
    try {
      await ctx.replyWithChatAction("typing");
      // TODO: Download photo, describe with Claude Vision
      await ctx.reply("📷 Photo received. Analysis coming soon!");
    } catch (error) {
      log.error({ service: "handler", action: "photo-error", userId, error: String(error) });
      captureError(error instanceof Error ? error : new Error(String(error)), { userId });
      await ctx.reply("⚠️ Error processing photo.").catch(() => {});
    }
  });

  // Documents → text extraction
  bot.on("message:document", async (ctx) => {
    const userId = String(ctx.from?.id ?? 0);
    const fileName = ctx.message.document.file_name ?? "unknown";
    log.info({ service: "handler", action: "document-received", userId, fileName });
    try {
      await ctx.replyWithChatAction("typing");
      await ctx.reply(`📄 Document received: *${fileName}*. Processing coming soon!`, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      log.error({ service: "handler", action: "document-error", userId, error: String(error) });
      captureError(error instanceof Error ? error : new Error(String(error)), { userId });
      await ctx.reply("⚠️ Error processing document.").catch(() => {});
    }
  });

  // Forwarded messages → remember
  bot.on("message:forward_origin", async (ctx) => {
    const userId = String(ctx.from?.id ?? 0);
    const text = ctx.message.text ?? ctx.message.caption ?? "";
    log.info({ service: "handler", action: "forward-received", userId, hasText: !!text });
    try {
      if (!text) {
        await ctx.reply("📝 Content received and saved.");
        return;
      }
      // TODO: Extract entities, detect commitments, save to memory
      const preview = text.length > 200 ? text.slice(0, 200) + "..." : text;
      await ctx.reply(`💬 *Saved*\n_${preview}_\n\n✅ _Remembered._`, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      log.error({ service: "handler", action: "forward-error", userId, error: String(error) });
      captureError(error instanceof Error ? error : new Error(String(error)), { userId });
      await ctx.reply("⚠️ Error processing forwarded message.").catch(() => {});
    }
  });

  // Text messages → agent loop
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;

    // Skip if it's a command (handled by command handlers)
    if (text.startsWith("/")) return;

    const userId = String(ctx.from.id);
    const chatId = ctx.chat.id;
    const lang = detectLanguage(text);
    log.info({ service: "handler", action: "text-received", userId, lang, length: text.length });

    await ctx.replyWithChatAction("typing");

    try {
      // Get conversation history for this chat
      const conversationHistory = getHistory(chatId);

      const result = await runAgent({
        message: text,
        userId,
        userName: ctx.from.first_name,
        userLanguage: lang,
        conversationHistory,
      });

      // Store user message and bot response in history
      addToHistory(chatId, "user", text);
      addToHistory(chatId, "assistant", result.response);

      log.info({
        service: "handler", action: "agent-response", userId,
        intent: result.intent, tokens: result.inputTokens + result.outputTokens,
        toolCalls: result.toolCalls,
      });

      await ctx.reply(result.response, { parse_mode: "Markdown" }).catch(() => {
        // Retry without Markdown if parse fails
        ctx.reply(result.response);
      });
    } catch (error) {
      log.error({ service: "handler", action: "agent-error", userId, error: String(error) });
      captureError(error instanceof Error ? error : new Error(String(error)), { userId });
      const errorMsg = lang === "ru"
        ? "⚠️ Произошла ошибка. Попробуйте ещё раз."
        : "⚠️ Something went wrong. Please try again.";
      await ctx.reply(errorMsg);
    }
  });
}
