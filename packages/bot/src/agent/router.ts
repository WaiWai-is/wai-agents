/**
 * Intent Router — classifies user messages and routes to the right model.
 *
 * Pattern matching first (instant, free), LLM fallback for ambiguous messages.
 * Supports English and Russian natural language patterns.
 */

import type { Intent } from "@wai/core";

// Model routing: cheap for classification, expensive for complex tasks
const MODEL_MAP: Record<Intent, string> = {
  search: "claude-haiku-4-5",
  voice_summary: "claude-haiku-4-5",
  digest: "claude-haiku-4-5",
  action: "claude-haiku-4-5",
  build: "claude-haiku-4-5",
  coach: "claude-haiku-4-5",
  chat: "claude-haiku-4-5",
};

export function classifyIntent(message: string, hasVoice = false): Intent {
  if (hasVoice) return "voice_summary";

  const lower = message.toLowerCase().trim();

  // Slash commands
  if (/^\/(search|find|найди|поиск)/.test(lower)) return "search";
  if (/^\/(digest|дайджест|summary)/.test(lower)) return "digest";
  if (/^\/(build|deploy|создай\s*сайт|сделай)/.test(lower)) return "build";
  if (/^\/(coach|teach|научи|промпт)/.test(lower)) return "coach";
  if (/^\/(send|email|calendar|отправь|письмо)/.test(lower)) return "action";

  // Natural language patterns (skip LLM for obvious intents)
  const searchPatterns = [
    "search for", "find ", "what did", "when did", "who said",
    "найди", "поищи", "что говорил", "что обсуждали", "когда был",
    "where is", "show me", "look for", "покажи",
  ];
  if (searchPatterns.some((p) => lower.startsWith(p) || lower.includes(` ${p}`))) {
    return "search";
  }

  const buildPatterns = [
    "build ", "create ", "deploy ", "make a site", "make a bot",
    "построй", "создай", "задеплой", "сделай сайт", "сделай бот",
  ];
  if (buildPatterns.some((p) => lower.includes(p))) return "build";

  const actionPatterns = [
    "send email", "send a message", "create event", "schedule",
    "отправь письмо", "отправь сообщение", "создай событие",
  ];
  if (actionPatterns.some((p) => lower.includes(p))) return "action";

  const digestPatterns = ["digest", "summary of", "what happened", "дайджест", "что было"];
  if (digestPatterns.some((p) => lower.includes(p))) return "digest";

  // Default to chat for everything else (no LLM call needed for Haiku)
  return "chat";
}

export function getModelForIntent(intent: Intent): string {
  return MODEL_MAP[intent] ?? MODEL_MAP.chat;
}
